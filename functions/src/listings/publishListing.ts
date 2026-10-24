import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import {
  gameSchema,
  listingMachine,
  publishListingInputSchema,
  savedLocationSchema,
  snapToArea,
  userProfileSchema,
  type PublishListingError,
  type PublishListingResult,
} from '@weloot/shared';

import { requireTrader } from '../auth/requireTrader';

// Publishing a listing (PRD W2). The server sets everything clients may not: status, the denormalized game fields
// and the public location, which is only the area of the chosen saved address (~1 km), never the address itself.

function fail(
  code: 'invalid-argument' | 'not-found' | 'failed-precondition',
  reason: PublishListingError,
): never {
  throw new HttpsError(code, `Publishing failed: ${reason}`, { reason });
}

function hasCode(error: unknown, code: number | string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

export async function handlePublishListing(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: { db: Firestore },
): Promise<PublishListingResult> {
  const uid = requireTrader(auth);
  const input = publishListingInputSchema.safeParse(data);
  if (!input.success) fail('invalid-argument', 'invalidInput');
  const { listing, locationId, requestId } = input.data;
  const { db } = deps;

  // The same request again (double tap, retry after a timeout): the listing already exists.
  const listingRef = db.collection('listings').doc(requestId);
  const existing = await listingRef.get();
  if (existing.exists) {
    if (existing.get('userId') === uid) return { listingId: requestId };
    fail('invalid-argument', 'invalidInput');
  }

  const [gameSnap, profileSnap, locationSnap] = await Promise.all([
    db.collection('games').doc(String(listing.igdbGameId)).get(),
    db.collection('users').doc(uid).get(),
    db.collection('users').doc(uid).collection('locations').doc(locationId).get(),
  ]);
  const game = gameSchema.safeParse(gameSnap.data());
  if (!game.success) fail('not-found', 'unknownGame');
  if (!game.data.platforms.includes(listing.platform)) fail('invalid-argument', 'wrongPlatform');
  const profile = userProfileSchema.safeParse(profileSnap.data());
  if (!profile.success || profile.data.deletedAt) fail('failed-precondition', 'profileRequired');
  const saved = savedLocationSchema.safeParse(locationSnap.data());
  if (!saved.success) fail('not-found', 'unknownLocation');

  const now = FieldValue.serverTimestamp();
  const doc = {
    userId: uid,
    igdbGameId: listing.igdbGameId,
    platform: listing.platform,
    gameTitle: game.data.title,
    ...(game.data.coverImageId ? { coverImageId: game.data.coverImageId } : {}),
    condition: listing.condition,
    hasCase: listing.hasCase,
    notes: listing.notes.trim(),
    isForTrade: listing.isForTrade,
    isForSale: listing.isForSale,
    ...(listing.isForSale && listing.askingPriceAgorot !== undefined
      ? { askingPriceAgorot: listing.askingPriceAgorot }
      : {}),
    photoPaths: [],
    hasPhotos: false,
    status: listingMachine.transition('draft', 'publish'),
    location: {
      ...snapToArea(saved.data.lat, saved.data.lng),
      areaName: saved.data.areaName,
      ...(saved.data.cityId ? { cityId: saved.data.cityId } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };

  try {
    await listingRef.create(doc);
  } catch (error) {
    // A concurrent identical request won the race (gRPC ALREADY_EXISTS = 6).
    if (!hasCode(error, 6)) throw error;
  }
  return { listingId: requestId };
}

/** Account deletion cleanup (#11): the user's open listings are removed (reserved ones are handled with deals). */
export function removeListingsOf(db: Firestore) {
  return async (uid: string) => {
    const open = await db
      .collection('listings')
      .where('userId', '==', uid)
      .where('status', 'in', ['active', 'paused'])
      .get();
    const writer = db.bulkWriter();
    for (const listing of open.docs) {
      void writer.update(listing.ref, {
        status: listingMachine.transition(listing.get('status') as 'active' | 'paused', 'remove'),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await writer.close();
  };
}
