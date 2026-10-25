import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  computeMatch,
  listingSchema,
  wantlistItemSchema,
  type MatchListing,
  type MatchResult,
  type MatchWant,
} from '@weloot/shared';

// Matches (PRD W3, #21): `matches/{userId}/items/{otherUserId}`, kept up to date incrementally. A listing or want
// list change only recomputes the pairs of users it can affect (people who want that game / people who have it),
// never the whole user base. Each pair is recomputed from scratch, from current data, inside a transaction, so
// events arriving twice or out of order end in the same result.

/** How many pairs are recomputed at once after one change. */
const PAIR_CONCURRENCY = 10;

const matchRef = (db: Firestore, uid: string, other: string) =>
  db.collection('matches').doc(uid).collection('items').doc(other);

async function wantsOf(tx: Transaction, db: Firestore, uid: string): Promise<MatchWant[]> {
  const snapshot = await tx.get(db.collection('wantlist').doc(uid).collection('items'));
  return snapshot.docs.flatMap((d) => {
    const parsed = wantlistItemSchema.safeParse(d.data());
    if (!parsed.success) return [];
    return [
      {
        igdbGameId: parsed.data.igdbGameId,
        ...(parsed.data.platform ? { platform: parsed.data.platform } : {}),
      },
    ];
  });
}

async function activeListingsOf(
  tx: Transaction,
  db: Firestore,
  uid: string,
): Promise<MatchListing[]> {
  const snapshot = await tx.get(
    db.collection('listings').where('userId', '==', uid).where('status', '==', 'active'),
  );
  return snapshot.docs.flatMap((d) => {
    const parsed = listingSchema.safeParse(d.data());
    if (!parsed.success) return [];
    const l = parsed.data;
    return [
      {
        id: d.id,
        igdbGameId: l.igdbGameId,
        platform: l.platform,
        hasPhotos: l.hasPhotos,
        lat: l.location.lat,
        lng: l.location.lng,
      },
    ];
  });
}

async function blockedBy(tx: Transaction, db: Firestore, uid: string): Promise<string[]> {
  const settings = await tx.get(
    db.collection('users').doc(uid).collection('private').doc('settings'),
  );
  const blocked: unknown = settings.get('blockedUserIds');
  return Array.isArray(blocked) ? blocked.filter((id): id is string => typeof id === 'string') : [];
}

/** Writes one side of a match, deleting it when there's none, and skipping writes that change nothing. */
function writeSide(
  tx: Transaction,
  ref: DocumentReference,
  existing: DocumentData | undefined,
  result: MatchResult | null,
) {
  if (!result) {
    if (existing) tx.delete(ref);
    return;
  }
  if (existing) {
    const previous = Object.fromEntries(
      Object.entries(existing).filter(([key]) => key !== 'updatedAt'),
    );
    if (JSON.stringify(sortKeys(previous)) === JSON.stringify(sortKeys(result))) return;
  }
  tx.set(ref, { ...result, updatedAt: FieldValue.serverTimestamp() });
}

function sortKeys(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Recomputes the match between two users, both sides. Blocking either way (PRD W3: blocked users are excluded
 * everywhere) means no match.
 * Blocking and unblocking call this for the pair (safety/block.ts).
 */
export async function recomputePair(db: Firestore, a: string, b: string): Promise<void> {
  if (a === b) return;
  const aRef = matchRef(db, a, b);
  const bRef = matchRef(db, b, a);
  await db.runTransaction(async (tx) => {
    const [aWants, bWants, aListings, bListings, aBlocked, bBlocked, aMatch, bMatch] =
      await Promise.all([
        wantsOf(tx, db, a),
        wantsOf(tx, db, b),
        activeListingsOf(tx, db, a),
        activeListingsOf(tx, db, b),
        blockedBy(tx, db, a),
        blockedBy(tx, db, b),
        tx.get(aRef),
        tx.get(bRef),
      ]);
    const blocked = aBlocked.includes(b) || bBlocked.includes(a);
    const { forA, forB } = blocked
      ? { forA: null, forB: null }
      : computeMatch({ aWants, bWants, aListings, bListings });
    writeSide(tx, aRef, aMatch.data(), forA);
    writeSide(tx, bRef, bMatch.data(), forB);
  });
}

async function recomputeAll(db: Firestore, uid: string, others: Iterable<string>): Promise<number> {
  const list = [...new Set(others)].filter((other) => other !== uid);
  for (let i = 0; i < list.length; i += PAIR_CONCURRENCY) {
    await Promise.all(
      list.slice(i, i + PAIR_CONCURRENCY).map((other) => recomputePair(db, uid, other)),
    );
  }
  return list.length;
}

/** Users with this game on their want list (any console; the pair computation checks consoles). */
async function wantersOf(db: Firestore, igdbGameId: number): Promise<string[]> {
  const snapshot = await db.collectionGroup('items').where('igdbGameId', '==', igdbGameId).get();
  return snapshot.docs.flatMap((d) => {
    // `items` is also the subcollection name of alerts and matches: keep want list items only.
    const owner = d.ref.parent.parent;
    return owner && owner.parent.id === 'wantlist' ? [owner.id] : [];
  });
}

/** Owners of active listings of this game. */
async function ownersOf(db: Firestore, igdbGameId: number): Promise<string[]> {
  const snapshot = await db
    .collection('listings')
    .where('igdbGameId', '==', igdbGameId)
    .where('status', '==', 'active')
    .get();
  return snapshot.docs.map((d) => d.get('userId') as string);
}

/** What about a listing matters to matching; null when it doesn't count (not active, or not a listing). */
function matchKey(data: unknown): string | null {
  const parsed = data === undefined ? null : listingSchema.safeParse(data);
  if (!parsed?.success || parsed.data.status !== 'active') return null;
  const l = parsed.data;
  return JSON.stringify([l.igdbGameId, l.platform, l.hasPhotos, l.location.lat, l.location.lng]);
}

/**
 * A listing was written: recompute its owner's pairs with everyone who wants that game. Changes matching doesn't
 * see (notes, price, `updatedAt`) cost nothing.
 */
export async function matchOnListingWrite(
  db: Firestore,
  before: unknown,
  after: unknown,
): Promise<number> {
  if (matchKey(before) === matchKey(after)) return 0;
  const owner = ((after ?? before) as { userId?: unknown } | undefined)?.userId;
  if (typeof owner !== 'string') return 0;
  const games = new Set<number>();
  for (const data of [before, after]) {
    const id = (data as { igdbGameId?: unknown } | undefined)?.igdbGameId;
    if (typeof id === 'number') games.add(id);
  }
  const wanters: string[] = [];
  for (const game of games) wanters.push(...(await wantersOf(db, game)));
  return recomputeAll(db, owner, wanters);
}

/** A want list item was added or removed: recompute the user's pairs with everyone who has that game. */
export async function matchOnWantWrite(
  db: Firestore,
  uid: string,
  before: unknown,
  after: unknown,
): Promise<number> {
  const games = new Set<number>();
  for (const data of [before, after]) {
    const id = (data as { igdbGameId?: unknown } | undefined)?.igdbGameId;
    if (typeof id === 'number') games.add(id);
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return 0;
  const owners: string[] = [];
  for (const game of games) owners.push(...(await ownersOf(db, game)));
  return recomputeAll(db, uid, owners);
}
