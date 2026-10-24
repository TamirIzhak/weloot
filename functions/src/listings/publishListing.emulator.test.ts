import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

import { handlePublishListing, removeListingsOf } from './publishListing';

jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const db = getFirestore(getApps()[0] ?? initializeApp());

const trader = (uid: string) =>
  ({
    uid,
    token: { phone_number: '+972541234567' },
    rawToken: 'raw',
  }) as unknown as CallableRequest['auth'];

const LISTING = {
  igdbGameId: 119133,
  platform: 'ps5',
  condition: 'like_new',
  hasCase: true,
  notes: '  Played once  ',
  isForTrade: true,
  isForSale: true,
  askingPriceAgorot: 15000,
};
const input = (overrides: Record<string, unknown> = {}, listing: Record<string, unknown> = {}) => ({
  listing: { ...LISTING, ...listing },
  locationId: 'home',
  requestId: 'req0000000000000001',
  ...overrides,
});

async function clear() {
  for (const name of ['listings', 'games', 'users']) await db.recursiveDelete(db.collection(name));
}

beforeEach(async () => {
  await clear();
  const now = new Date();
  await db.doc('games/119133').set({
    title: 'Elden Ring',
    slug: 'elden-ring',
    platforms: ['ps4', 'ps5'],
    platformIds: [48, 167],
    coverImageId: 'co4jni',
    genres: [],
    altNames: [],
    similarGameIds: [],
    igdbUpdatedAt: 1700000000,
  });
  for (const uid of ['u1', 'u2']) {
    await db.doc(`users/${uid}`).set({
      username: `Gamer_${uid}`,
      usernameLower: `gamer_${uid}`,
      ratingAvg: 0,
      ratingCount: 0,
      completedTrades: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  await db.doc('users/u1/locations/home').set({
    label: 'Home',
    address: 'Dizengoff 50, Tel Aviv',
    lat: 32.0754,
    lng: 34.7752,
    cityId: '5000',
    areaName: 'Tel Aviv - Yafo',
    createdAt: now,
    updatedAt: now,
  });
});
afterAll(clear);

describe('publishListing', () => {
  it('publishes an active listing with the game details and only the area of the address', async () => {
    await expect(handlePublishListing(trader('u1'), input(), { db })).resolves.toEqual({
      listingId: 'req0000000000000001',
    });
    const listing = (await db.doc('listings/req0000000000000001').get()).data();
    expect(listing).toMatchObject({
      userId: 'u1',
      igdbGameId: 119133,
      platform: 'ps5',
      gameTitle: 'Elden Ring',
      coverImageId: 'co4jni',
      condition: 'like_new',
      hasCase: true,
      notes: 'Played once',
      isForTrade: true,
      isForSale: true,
      askingPriceAgorot: 15000,
      photoPaths: [],
      hasPhotos: false,
      status: 'active',
      location: { lat: 32.08, lng: 34.78, areaName: 'Tel Aviv - Yafo', cityId: '5000' },
    });
    expect(listing?.location.geohash).toHaveLength(5);
    expect(JSON.stringify(listing)).not.toMatch(/Dizengoff|32\.0754|34\.7752/);
  });

  it('creates one listing for a repeated request', async () => {
    await handlePublishListing(trader('u1'), input(), { db });
    await handlePublishListing(trader('u1'), input(), { db });
    expect((await db.collection('listings').count().get()).data().count).toBe(1);
  });

  it("refuses someone else's request ID", async () => {
    await handlePublishListing(trader('u1'), input(), { db });
    await expect(handlePublishListing(trader('u2'), input(), { db })).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
  });

  it('leaves out the price of a trade-only listing', async () => {
    await handlePublishListing(
      trader('u1'),
      input({}, { isForSale: false, askingPriceAgorot: undefined }),
      { db },
    );
    expect(
      (await db.doc('listings/req0000000000000001').get()).get('askingPriceAgorot'),
    ).toBeUndefined();
  });

  it.each([
    ['neither trade nor sale', {}, { isForTrade: false, isForSale: false }],
    ['a sale without a price', {}, { askingPriceAgorot: undefined }],
    ['a price below ₪10', {}, { askingPriceAgorot: 500 }],
    ['a price in agorot fractions', {}, { askingPriceAgorot: 15050 }],
    ['a long note', {}, { notes: 'x'.repeat(301) }],
    ['a bad request ID', { requestId: 'short' }, {}],
  ])('rejects %s', async (_, overrides, listing) => {
    await expect(
      handlePublishListing(trader('u1'), input(overrides, listing), { db }),
    ).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
  });

  it('rejects an unknown game or a console the game is not on', async () => {
    await expect(
      handlePublishListing(trader('u1'), input({}, { igdbGameId: 1 }), { db }),
    ).rejects.toMatchObject({ details: { reason: 'unknownGame' } });
    await expect(
      handlePublishListing(trader('u1'), input({}, { platform: 'switch' }), { db }),
    ).rejects.toMatchObject({ details: { reason: 'wrongPlatform' } });
  });

  it("only uses the user's own saved addresses", async () => {
    await expect(handlePublishListing(trader('u2'), input(), { db })).rejects.toMatchObject({
      details: { reason: 'unknownLocation' },
    });
  });

  it('needs a profile that is not deleted, and a verified phone', async () => {
    await db.doc('users/u1').update({ deletedAt: new Date() });
    await expect(handlePublishListing(trader('u1'), input(), { db })).rejects.toMatchObject({
      details: { reason: 'profileRequired' },
    });
    const noPhone = { uid: 'u1', token: {}, rawToken: 'raw' } as unknown as CallableRequest['auth'];
    await expect(handlePublishListing(noPhone, input(), { db })).rejects.toMatchObject({
      details: { reason: 'phoneRequired' },
    });
  });
});

describe('removeListingsOf (account deletion)', () => {
  it("removes the user's active and paused listings and leaves the rest", async () => {
    const base = { userId: 'u1', gameTitle: 'X' };
    await db.doc('listings/a').set({ ...base, status: 'active' });
    await db.doc('listings/b').set({ ...base, status: 'paused' });
    await db.doc('listings/c').set({ ...base, status: 'traded' });
    await db.doc('listings/d').set({ ...base, userId: 'u2', status: 'active' });
    await removeListingsOf(db)('u1');
    const status = async (id: string) => (await db.doc(`listings/${id}`).get()).get('status');
    expect(await status('a')).toBe('removed');
    expect(await status('b')).toBe('removed');
    expect(await status('c')).toBe('traded');
    expect(await status('d')).toBe('active');
  });
});
