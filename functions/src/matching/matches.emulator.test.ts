import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { matchOnListingWrite, matchOnWantWrite, recomputePair } from './matches';

const db = getFirestore(getApps()[0] ?? initializeApp());
const now = Timestamp.fromMillis(Date.UTC(2026, 9, 25));

const ELDEN = 119133;
const ZELDA = 119388;

function listingData(userId: string, igdbGameId: number, overrides: Record<string, unknown> = {}) {
  return {
    userId,
    igdbGameId,
    platform: igdbGameId === ZELDA ? 'switch' : 'ps5',
    gameTitle: igdbGameId === ZELDA ? 'Zelda' : 'Elden Ring',
    condition: 'good',
    hasCase: true,
    notes: '',
    isForTrade: true,
    isForSale: false,
    photoPaths: [],
    hasPhotos: false,
    status: 'active',
    location: { lat: 32.08, lng: 34.78, geohash: 'sv8wr', areaName: 'Tel Aviv' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Writes a listing and runs the trigger the way the function does. */
async function putListing(id: string, data: Record<string, unknown> | null) {
  const ref = db.doc(`listings/${id}`);
  const before = (await ref.get()).data();
  if (data) await ref.set(data);
  else await ref.delete();
  return matchOnListingWrite(db, before, data ?? undefined);
}

async function putWant(uid: string, igdbGameId: number, platform?: string, remove = false) {
  const ref = db.doc(`wantlist/${uid}/items/${igdbGameId}_${platform ?? 'any'}`);
  const before = (await ref.get()).data();
  const after = remove
    ? undefined
    : { igdbGameId, gameTitle: 'Game', createdAt: now, ...(platform ? { platform } : {}) };
  if (after) await ref.set(after);
  else await ref.delete();
  return matchOnWantWrite(db, uid, before, after);
}

const match = async (uid: string, other: string) =>
  (await db.doc(`matches/${uid}/items/${other}`).get()).data();

async function clear() {
  for (const name of ['listings', 'wantlist', 'matches', 'alerts', 'users']) {
    await db.recursiveDelete(db.collection(name));
  }
}

beforeEach(clear);
afterAll(clear);

describe('matching', () => {
  it('creates a one-way match when someone lists a game you want, and removes it when paused', async () => {
    await putWant('alice', ELDEN, 'ps5');
    await expect(putListing('b1', listingData('bob', ELDEN))).resolves.toBe(1);
    expect(await match('alice', 'bob')).toMatchObject({
      theirListingIds: ['b1'],
      myListingIds: [],
      perfect: false,
    });
    expect(await match('bob', 'alice')).toBeUndefined();

    await putListing('b1', listingData('bob', ELDEN, { status: 'paused' }));
    expect(await match('alice', 'bob')).toBeUndefined();
  });

  it('becomes perfect for both when the other side wants what you have, and back when that goes', async () => {
    await putListing('a1', listingData('alice', ZELDA));
    await putListing('b1', listingData('bob', ELDEN));
    await putWant('alice', ELDEN);
    expect(await match('alice', 'bob')).toMatchObject({ perfect: false });

    await putWant('bob', ZELDA, 'switch');
    expect(await match('alice', 'bob')).toMatchObject({
      perfect: true,
      theirListingIds: ['b1'],
      myListingIds: ['a1'],
      distanceKm: 0,
    });
    expect(await match('bob', 'alice')).toMatchObject({ perfect: true, theirListingIds: ['a1'] });

    // Alice's Zelda is reserved in a deal: Bob loses his match, Alice keeps a one-way one.
    await putListing('a1', listingData('alice', ZELDA, { status: 'reserved' }));
    expect(await match('bob', 'alice')).toBeUndefined();
    expect(await match('alice', 'bob')).toMatchObject({ perfect: false, myListingIds: [] });

    // Alice removes Elden Ring from her want list: no match left.
    await putWant('alice', ELDEN, undefined, true);
    expect(await match('alice', 'bob')).toBeUndefined();
  });

  it('only recomputes the pairs a change can affect', async () => {
    await putWant('alice', ELDEN);
    await putWant('carol', ZELDA);
    // Bob's Elden Ring concerns Alice only, not Carol.
    await expect(putListing('b1', listingData('bob', ELDEN))).resolves.toBe(1);
    // A change matching doesn't see costs nothing.
    await expect(putListing('b1', listingData('bob', ELDEN, { notes: 'mint' }))).resolves.toBe(0);
    expect(await match('carol', 'bob')).toBeUndefined();
  });

  it('respects the console on the want list', async () => {
    await putWant('alice', ELDEN, 'ps4');
    await putListing('b1', listingData('bob', ELDEN));
    expect(await match('alice', 'bob')).toBeUndefined();
  });

  it('ignores alerts that share the `items` name', async () => {
    await db.doc('alerts/dave/items/x').set({ igdbGameId: ELDEN, radiusKm: 25, source: 'search' });
    await expect(putListing('b1', listingData('bob', ELDEN))).resolves.toBe(0);
    expect(await match('dave', 'bob')).toBeUndefined();
  });

  it('never matches users who blocked each other', async () => {
    await db.doc('users/alice/private/settings').set({ blockedUserIds: ['bob'] });
    await putWant('alice', ELDEN);
    await putListing('b1', listingData('bob', ELDEN));
    expect(await match('alice', 'bob')).toBeUndefined();
  });

  it('gives the same result however often or in whatever order it runs', async () => {
    await putWant('alice', ELDEN);
    await db.doc('listings/b1').set(listingData('bob', ELDEN));
    await Promise.all([recomputePair(db, 'alice', 'bob'), recomputePair(db, 'bob', 'alice')]);
    await recomputePair(db, 'alice', 'bob');
    const first = await match('alice', 'bob');
    await recomputePair(db, 'alice', 'bob');
    // Nothing changed, so nothing was rewritten (same updatedAt).
    expect(await match('alice', 'bob')).toEqual(first);
    expect(first).toMatchObject({ theirListingIds: ['b1'] });
  });

  it('removes matches when the listing is deleted', async () => {
    await putWant('alice', ELDEN);
    await putListing('b1', listingData('bob', ELDEN));
    await putListing('b1', null);
    expect(await match('alice', 'bob')).toBeUndefined();
  });
});
