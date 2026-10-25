import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import {
  distanceKm,
  listingSchema,
  snapToArea,
  wantedNearYouInputSchema,
  wantsListing,
  wantlistItemSchema,
  type MatchWant,
  type PlatformKey,
  type WantedNearYouResult,
} from '@weloot/shared';

// "Wanted near you" (PRD W3, Home): for each game the caller has listed, how many people near the browsing location
// want it. Want lists are private and users have no stored location, so this runs server-side and returns counts
// only, never who. A wanter counts as near when one of their saved addresses or active listings is in the radius.

/** Wanters looked at per game, so a very popular game can't make one call unbounded. */
const MAX_WANTERS_PER_GAME = 200;
const MAX_GAMES = 10;
/**
 * Smallest radius counted, and wanters' places are snapped to the ~1 km area grid first: probing with tiny circles
 * around different points can't pin down where a wanter lives.
 */
export const MIN_WANTED_RADIUS_KM = 5;

type Point = { lat: number; lng: number };

async function placesOf(db: Firestore, uid: string): Promise<Point[]> {
  const [locations, listings] = await Promise.all([
    db.collection('users').doc(uid).collection('locations').get(),
    db.collection('listings').where('userId', '==', uid).where('status', '==', 'active').get(),
  ]);
  const points: Point[] = [];
  for (const d of [...locations.docs, ...listings.docs]) {
    const lat: unknown = d.get('lat') ?? d.get('location.lat');
    const lng: unknown = d.get('lng') ?? d.get('location.lng');
    if (typeof lat === 'number' && typeof lng === 'number') points.push(snapToArea(lat, lng));
  }
  return points;
}

export async function handleWantedNearYou(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: { db: Firestore },
): Promise<WantedNearYouResult> {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in first', { reason: 'signInRequired' });
  }
  const input = wantedNearYouInputSchema.safeParse(data);
  if (!input.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', { reason: 'invalidInput' });
  }
  const { db } = deps;
  const here = { lat: input.data.lat, lng: input.data.lng };
  const uid = auth.uid;
  const radiusKm = Math.max(MIN_WANTED_RADIUS_KM, input.data.radiusKm);

  const [mine, settings] = await Promise.all([
    db.collection('listings').where('userId', '==', uid).where('status', '==', 'active').get(),
    db.collection('users').doc(uid).collection('private').doc('settings').get(),
  ]);
  const blockedValue: unknown = settings.get('blockedUserIds');
  const blocked = new Set(Array.isArray(blockedValue) ? (blockedValue as string[]) : []);

  // One entry per game and console the caller has listed.
  const games = new Map<string, { igdbGameId: number; gameTitle: string; platform: PlatformKey }>();
  for (const d of mine.docs) {
    const parsed = listingSchema.safeParse(d.data());
    if (!parsed.success) continue;
    const { igdbGameId, gameTitle, platform } = parsed.data;
    games.set(`${igdbGameId}_${platform}`, { igdbGameId, gameTitle, platform });
  }

  const nearCache = new Map<string, Promise<boolean>>();
  const isNear = (other: string) => {
    let near = nearCache.get(other);
    if (!near) {
      near = placesOf(db, other).then((points) =>
        points.some((p) => distanceKm(here, p) <= radiusKm),
      );
      nearCache.set(other, near);
    }
    return near;
  };

  const results: WantedNearYouResult['games'] = [];
  for (const game of [...games.values()].slice(0, MAX_GAMES)) {
    const wants = await db
      .collectionGroup('items')
      .where('igdbGameId', '==', game.igdbGameId)
      .limit(MAX_WANTERS_PER_GAME)
      .get();
    const wanters = new Set<string>();
    for (const d of wants.docs) {
      const owner = d.ref.parent.parent;
      if (!owner || owner.parent.id !== 'wantlist') continue;
      if (owner.id === uid || blocked.has(owner.id)) continue;
      const parsed = wantlistItemSchema.safeParse(d.data());
      if (!parsed.success) continue;
      const want: MatchWant = {
        igdbGameId: parsed.data.igdbGameId,
        ...(parsed.data.platform ? { platform: parsed.data.platform } : {}),
      };
      // Same game on another console isn't "wanted" for this copy.
      if (!wantsListing(want, { ...game, id: '', hasPhotos: false, ...here })) continue;
      wanters.add(owner.id);
    }
    let count = 0;
    for (const other of wanters) if (await isNear(other)) count++;
    if (count > 0) results.push({ ...game, count });
  }
  results.sort((a, b) => b.count - a.count || a.gameTitle.localeCompare(b.gameTitle));
  return { games: results };
}
