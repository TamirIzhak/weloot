import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import {
  barcodeLookupInputSchema,
  barcodeSchema,
  confirmBarcodeInputSchema,
  gameSchema,
  toGameRecord,
  TRUSTED_BARCODE_CONFIRMATIONS,
  type BarcodeError,
  type BarcodeLookupResult,
  type GameRecord,
  type PlatformKey,
} from '@weloot/shared';

import { requireTrader } from '../auth/requireTrader';

// Barcode → game (PRD §5.1): `barcodes/{ean}` is WeLoot's own mapping (server-only), built from users'
// confirmations. On a miss, a UPC provider names the product and catalog search turns that into suggestions.

/** Looks a barcode up at a UPC/EAN database and returns the product title. */
export type UpcProvider = { lookup(ean: string): Promise<{ title: string } | null> };

/**
 * TODO(OPEN-6): the UPC/EAN provider isn't chosen yet (cost, Israeli barcode coverage). Until then no external
 * lookup happens; unknown barcodes go straight to search, and confirmations still build our own table.
 */
export const noUpcProvider: UpcProvider = {
  lookup: async () => null,
};

export type BarcodeDeps = {
  db: Firestore;
  upc: UpcProvider;
  /** Catalog search (Algolia `games`), top matches for a product title. */
  searchGames(query: string): Promise<GameRecord[]>;
};

const MAX_SUGGESTIONS = 5;

function fail(code: 'invalid-argument' | 'not-found', reason: BarcodeError): never {
  throw new HttpsError(code, `Barcode request failed: ${reason}`, { reason });
}

async function gameRecord(db: Firestore, igdbGameId: number): Promise<GameRecord | null> {
  const parsed = gameSchema.safeParse(
    (await db.collection('games').doc(String(igdbGameId)).get()).data(),
  );
  return parsed.success ? toGameRecord(String(igdbGameId), parsed.data) : null;
}

export async function handleLookupBarcode(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: BarcodeDeps,
): Promise<BarcodeLookupResult> {
  requireTrader(auth);
  const input = barcodeLookupInputSchema.safeParse(data);
  if (!input.success) fail('invalid-argument', 'invalidInput');
  const { ean } = input.data;

  const mapping = barcodeSchema.safeParse(
    (await deps.db.collection('barcodes').doc(ean).get()).data(),
  );
  if (mapping.success) {
    const game = await gameRecord(deps.db, mapping.data.igdbGameId);
    if (game) {
      return {
        ean,
        match: { game, platform: mapping.data.platform, trusted: mapping.data.trusted },
        suggestions: [],
      };
    }
  }

  const product = await deps.upc.lookup(ean).catch((error: unknown) => {
    logger.warn('lookupBarcode: UPC provider failed', {
      ean,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  const suggestions = product
    ? (await deps.searchGames(product.title)).slice(0, MAX_SUGGESTIONS)
    : [];
  return { ean, suggestions };
}

/**
 * Records that this user says `ean` is this game on this platform. One vote per user per barcode (a new vote
 * moves theirs); the mapping follows the candidate with the most votes and is trusted from
 * TRUSTED_BARCODE_CONFIRMATIONS votes.
 */
export async function handleConfirmBarcode(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: Pick<BarcodeDeps, 'db'>,
): Promise<{ trusted: boolean }> {
  const uid = requireTrader(auth);
  const input = confirmBarcodeInputSchema.safeParse(data);
  if (!input.success) fail('invalid-argument', 'invalidInput');
  const { ean, igdbGameId, platform } = input.data;

  const game = gameSchema.safeParse(
    (await deps.db.collection('games').doc(String(igdbGameId)).get()).data(),
  );
  if (!game.success) fail('not-found', 'unknownGame');
  if (!game.data.platforms.includes(platform)) fail('invalid-argument', 'wrongPlatform');

  const barcode = deps.db.collection('barcodes').doc(ean);
  const candidates = barcode.collection('candidates');
  const keyOf = (c: { igdbGameId: number; platform: PlatformKey }) =>
    `${c.igdbGameId}_${c.platform}`;
  const countOf = (snap: { get(field: string): unknown } | null) =>
    typeof snap?.get('confirmations') === 'number' ? (snap.get('confirmations') as number) : 0;

  return deps.db.runTransaction(async (tx) => {
    const voteRef = barcode.collection('votes').doc(uid);
    const [voteSnap, mappingSnap] = await Promise.all([tx.get(voteRef), tx.get(barcode)]);
    const previous = voteSnap.exists
      ? (voteSnap.data() as { igdbGameId: number; platform: PlatformKey })
      : null;
    const mapping = barcodeSchema.safeParse(mappingSnap.data());
    const current = mapping.success ? mapping.data : null;

    const chosen = { igdbGameId, platform };
    const chosenKey = keyOf(chosen);
    const oldKey = previous && keyOf(previous) !== chosenKey ? keyOf(previous) : null;
    const currentKey = current ? keyOf(current) : null;
    const extraKey =
      currentKey && currentKey !== chosenKey && currentKey !== oldKey ? currentKey : null;

    // All reads before any write (Firestore transactions).
    const [chosenSnap, oldSnap, extraSnap] = await Promise.all([
      tx.get(candidates.doc(chosenKey)),
      oldKey ? tx.get(candidates.doc(oldKey)) : Promise.resolve(null),
      extraKey ? tx.get(candidates.doc(extraKey)) : Promise.resolve(null),
    ]);

    // A repeated vote for the same candidate changes nothing; a new or moved vote counts once.
    const sameVote = previous !== null && keyOf(previous) === chosenKey;
    const chosenCount = countOf(chosenSnap) + (sameVote ? 0 : 1);
    const oldCount = Math.max(0, countOf(oldSnap) - 1);
    tx.set(candidates.doc(chosenKey), { ...chosen, confirmations: chosenCount });
    if (oldKey) tx.set(candidates.doc(oldKey), { confirmations: oldCount }, { merge: true });
    tx.set(voteRef, { ...chosen, at: FieldValue.serverTimestamp() });

    // The mapping follows the most-confirmed candidate; a tie keeps the current one.
    const currentCount =
      currentKey === chosenKey
        ? chosenCount
        : currentKey === oldKey
          ? oldCount
          : countOf(extraSnap);
    const winner =
      !current || currentKey === chosenKey || chosenCount > currentCount
        ? { ...chosen, confirmations: chosenCount }
        : {
            igdbGameId: current.igdbGameId,
            platform: current.platform,
            confirmations: currentCount,
          };
    const trusted = winner.confirmations >= TRUSTED_BARCODE_CONFIRMATIONS;
    tx.set(barcode, {
      ...winner,
      confirmations: Math.max(1, winner.confirmations),
      trusted,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { trusted: trusted && keyOf(winner) === chosenKey };
  });
}
