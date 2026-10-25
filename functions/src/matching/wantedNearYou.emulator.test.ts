import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

import { handleWantedNearYou } from './wantedNearYou';

jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const db = getFirestore(getApps()[0] ?? initializeApp());
const user = (uid: string) =>
  ({ uid, token: {}, rawToken: 'raw' }) as unknown as CallableRequest['auth'];
const now = Timestamp.fromMillis(Date.UTC(2026, 9, 25));
const TEL_AVIV = { lat: 32.08, lng: 34.78 };
const HAIFA = { lat: 32.79, lng: 34.99 };
const ELDEN = 119133;
const ZELDA = 119388;

async function listing(
  id: string,
  userId: string,
  igdbGameId: number,
  at = TEL_AVIV,
  status = 'active',
) {
  await db.doc(`listings/${id}`).set({
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
    status,
    location: { ...at, geohash: 'sv8wr', areaName: 'Area' },
    createdAt: now,
    updatedAt: now,
  });
}

async function wants(uid: string, igdbGameId: number, platform?: string) {
  await db.doc(`wantlist/${uid}/items/${igdbGameId}_${platform ?? 'any'}`).set({
    igdbGameId,
    gameTitle: 'Game',
    createdAt: now,
    ...(platform ? { platform } : {}),
  });
}

async function home(uid: string, at: { lat: number; lng: number }) {
  await db.doc(`users/${uid}/locations/home`).set({ label: 'Home', address: 'Secret 1', ...at });
}

const ask = (uid = 'me', radiusKm = 25) =>
  handleWantedNearYou(user(uid), { ...TEL_AVIV, radiusKm }, { db });

async function clear() {
  for (const name of ['listings', 'wantlist', 'users', 'alerts']) {
    await db.recursiveDelete(db.collection(name));
  }
}
beforeEach(clear);
afterAll(clear);

describe('wantedNearYou', () => {
  it('counts nearby people who want a game you listed, by saved address or listing', async () => {
    await listing('m1', 'me', ELDEN);
    await wants('a', ELDEN);
    await home('a', TEL_AVIV);
    await wants('b', ELDEN, 'ps5');
    await listing('b1', 'b', ZELDA, TEL_AVIV);
    // Far away: not counted.
    await wants('c', ELDEN);
    await home('c', HAIFA);
    // No place at all: can't be "near".
    await wants('d', ELDEN);
    await expect(ask()).resolves.toEqual({
      games: [{ igdbGameId: ELDEN, gameTitle: 'Elden Ring', platform: 'ps5', count: 2 }],
    });
  });

  it('skips the wrong console, yourself, blocked users, alerts and paused listings', async () => {
    await listing('m1', 'me', ELDEN);
    await listing('m2', 'me', ZELDA, TEL_AVIV, 'paused');
    await wants('me', ELDEN);
    await wants('ps4fan', ELDEN, 'ps4');
    await home('ps4fan', TEL_AVIV);
    await wants('blocked', ELDEN);
    await home('blocked', TEL_AVIV);
    await db.doc('users/me/private/settings').set({ blockedUserIds: ['blocked'] });
    await db.doc('alerts/e/items/x').set({ igdbGameId: ELDEN, radiusKm: 25, source: 'search' });
    await wants('zfan', ZELDA);
    await home('zfan', TEL_AVIV);
    await expect(ask()).resolves.toEqual({ games: [] });
  });

  it('never counts with a tiny radius (5 km minimum, areas snapped)', async () => {
    await listing('m1', 'me', ELDEN);
    await wants('a', ELDEN);
    // About 3 km from the asked point.
    await home('a', { lat: 32.107, lng: 34.78 });
    const small = await ask('me', 1);
    expect(small.games[0]?.count).toBe(1);
  });

  it('needs sign-in and a place in Israel', async () => {
    await expect(
      handleWantedNearYou(undefined, { ...TEL_AVIV, radiusKm: 25 }, { db }),
    ).rejects.toMatchObject({ details: { reason: 'signInRequired' } });
    await expect(
      handleWantedNearYou(user('me'), { lat: 51.5, lng: -0.1, radiusKm: 25 }, { db }),
    ).rejects.toMatchObject({ details: { reason: 'invalidInput' } });
  });
});
