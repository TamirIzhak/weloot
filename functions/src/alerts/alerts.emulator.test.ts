import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { alertOnListingWrite, type AlertPush } from './alerts';

jest.mock('firebase-functions', () => ({ logger: { warn: jest.fn() } }));

const db = getFirestore(getApps()[0] ?? initializeApp());
const NOW = new Date('2026-10-25T12:00:00Z');
const created = Timestamp.fromDate(NOW);
const TEL_AVIV = { lat: 32.08, lng: 34.78 };
const HAIFA = { lat: 32.79, lng: 34.99 };
const ZELDA = 119388;

const sent: AlertPush[] = [];
const notifier = {
  send: jest.fn(async (push: AlertPush) => {
    sent.push(push);
  }),
};
const deps = (now = NOW) => ({ db, notifier, now: () => now });

function listing(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'seller',
    igdbGameId: ZELDA,
    platform: 'switch',
    gameTitle: 'Zelda TOTK',
    condition: 'good',
    hasCase: true,
    notes: '',
    isForTrade: true,
    isForSale: false,
    photoPaths: [],
    hasPhotos: false,
    status: 'active',
    location: { ...TEL_AVIV, geohash: 'sv8wr', areaName: 'Tel Aviv-Yafo', cityId: '5000' },
    createdAt: created,
    updatedAt: created,
    ...overrides,
  };
}

async function alert(uid: string, overrides: Record<string, unknown> = {}) {
  await db.doc(`alerts/${uid}/items/${ZELDA}_any`).set({
    igdbGameId: ZELDA,
    gameTitle: 'Zelda TOTK',
    radiusKm: 25,
    ...TEL_AVIV,
    source: 'search',
    createdAt: created,
    ...overrides,
  });
}

async function settings(uid: string, data: Record<string, unknown>) {
  await db.doc(`users/${uid}/private/settings`).set({ fcmTokens: [`token-${uid}`], ...data });
}

const forYou = async (uid: string, listingId = 'l1') =>
  (await db.doc(`newForYou/${uid}/items/${listingId}`).get()).data();

async function clear() {
  for (const name of [
    'alerts',
    'wantlist',
    'users',
    'listings',
    'newForYou',
    'alertState',
    'config',
  ]) {
    await db.recursiveDelete(db.collection(name));
  }
}

beforeEach(async () => {
  await clear();
  jest.clearAllMocks();
  sent.length = 0;
});
afterAll(clear);

describe('alertOnListing', () => {
  it('delivers a new listing to a matching alert nearby: New for you, and a push in their language', async () => {
    await alert('fan');
    await settings('fan', { preferredLanguage: 'he' });
    await expect(alertOnListingWrite(deps(), 'l1', undefined, listing())).resolves.toBe(1);
    expect(await forYou('fan')).toMatchObject({
      listingId: 'l1',
      gameTitle: 'Zelda TOTK',
      alertKey: `a_${ZELDA}_any`,
      pushed: true,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      uid: 'fan',
      tokens: ['token-fan'],
      listingId: 'l1',
      title: 'חדש בשבילך ב־WeLoot',
    });
    expect(sent[0]?.body).toMatch(/^Zelda TOTK \(Switch\) פורסם עכשיו ב־תל אביב/);
  });

  it('also alerts want list items, within the user radius from their places', async () => {
    await db.doc(`wantlist/near/items/${ZELDA}_switch`).set({
      igdbGameId: ZELDA,
      platform: 'switch',
      gameTitle: 'Zelda TOTK',
      createdAt: created,
    });
    await db.doc('users/near/locations/home').set({ label: 'Home', address: 'x', ...TEL_AVIV });
    await settings('near', { searchRadiusKm: 10 });
    await db
      .doc(`wantlist/far/items/${ZELDA}_any`)
      .set({ igdbGameId: ZELDA, gameTitle: 'Z', createdAt: created });
    await db.doc('users/far/locations/home').set({ label: 'Home', address: 'x', ...HAIFA });
    await settings('far', { searchRadiusKm: 10 });
    await expect(alertOnListingWrite(deps(), 'l1', undefined, listing())).resolves.toBe(1);
    expect(await forYou('near')).toMatchObject({ alertKey: `w_${ZELDA}_switch` });
    expect(await forYou('far')).toBeUndefined();
  });

  it('respects the console, the alert radius, the seller and blocks', async () => {
    await alert('ps5fan', { platform: 'ps5' });
    await alert('farfan', { ...HAIFA, radiusKm: 10 });
    await alert('blocker');
    await settings('blocker', { blockedUserIds: ['seller'] });
    await alert('blockedbyseller');
    await settings('seller', { blockedUserIds: ['blockedbyseller'] });
    await alert('seller');
    await expect(alertOnListingWrite(deps(), 'l1', undefined, listing())).resolves.toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('runs only when a listing becomes active: new or reactivated, not edits or pauses', async () => {
    await alert('fan');
    await settings('fan', {});
    await expect(
      alertOnListingWrite(deps(), 'l1', listing(), listing({ notes: 'x' })),
    ).resolves.toBe(0);
    await expect(
      alertOnListingWrite(deps(), 'l1', listing(), listing({ status: 'paused' })),
    ).resolves.toBe(0);
    await expect(
      alertOnListingWrite(deps(), 'l1', listing({ status: 'paused' }), listing()),
    ).resolves.toBe(1);
  });

  it('never delivers the same listing twice (repeated events)', async () => {
    await alert('fan');
    await settings('fan', {});
    await alertOnListingWrite(deps(), 'l1', undefined, listing());
    await expect(alertOnListingWrite(deps(), 'l1', undefined, listing())).resolves.toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('rate-limits pushes (1 per alert per 6 h, a daily cap) but still lists everything', async () => {
    await alert('fan');
    await settings('fan', {});
    for (let i = 1; i <= 3; i++) {
      await alertOnListingWrite(deps(), `l${i}`, undefined, listing());
    }
    // Same alert within 6 hours: one push, all three listed.
    expect(sent).toHaveLength(1);
    expect(await forYou('fan', 'l2')).toMatchObject({ pushed: false });
    expect(await forYou('fan', 'l3')).toMatchObject({ pushed: false });

    // Config can lower the daily cap.
    await db.doc('config/limits').set({ alertPushesPerDay: 1 });
    const later = new Date(NOW.getTime() + 7 * 3_600_000);
    await alertOnListingWrite(deps(later), 'l4', undefined, listing());
    expect(sent).toHaveLength(1);
    expect(await forYou('fan', 'l4')).toMatchObject({ pushed: false });
  });

  it('lists it without a push when alert notifications are switched off (#27)', async () => {
    await alert('fan');
    await settings('fan', { notificationPrefs: { alerts: false } });
    await alertOnListingWrite(deps(), 'l1', undefined, listing());
    expect(await forYou('fan')).toMatchObject({ pushed: false });
    expect(sent).toHaveLength(0);
  });

  it('lists it without a push when the user has no device registered yet', async () => {
    await alert('fan');
    await settings('fan', { fcmTokens: [] });
    await alertOnListingWrite(deps(), 'l1', undefined, listing());
    expect(await forYou('fan')).toMatchObject({ pushed: false });
    expect(sent).toHaveLength(0);
  });
});
