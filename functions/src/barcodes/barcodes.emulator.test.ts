import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

import type { GameRecord } from '@weloot/shared';

import { handleConfirmBarcode, handleLookupBarcode, type UpcProvider } from './barcodes';

jest.mock('firebase-functions', () => ({ logger: { warn: jest.fn() } }));
jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const db = getFirestore(getApps()[0] ?? initializeApp());

// A real EAN-13 (valid check digit) and its UPC-A twin.
const EAN = '0711719541783';
const OTHER_EAN = '4006381333931';

const trader = (uid: string) =>
  ({
    uid,
    token: { phone_number: '+972541234567' },
    rawToken: 'raw',
  }) as unknown as CallableRequest['auth'];

const GAME = {
  title: 'Elden Ring',
  slug: 'elden-ring',
  platforms: ['ps4', 'ps5'],
  platformIds: [48, 167],
  genres: [],
  altNames: [],
  similarGameIds: [],
  igdbUpdatedAt: 1700000000,
};
const RECORD: GameRecord = {
  objectID: '119133',
  title: 'Elden Ring',
  slug: 'elden-ring',
  platforms: ['ps4', 'ps5'],
  genres: [],
  altNames: [],
};

async function clear() {
  await db.recursiveDelete(db.collection('barcodes'));
  await db.recursiveDelete(db.collection('games'));
}

beforeEach(async () => {
  await clear();
  await db.doc('games/119133').set(GAME);
  await db.doc('games/2').set({ ...GAME, title: 'Elden Ring Nightreign', slug: 'nightreign' });
});
afterAll(clear);

function lookupDeps(upc: UpcProvider = { lookup: async () => null }) {
  const searchGames = jest.fn(async () => [RECORD]);
  return { deps: { db, upc, searchGames }, searchGames };
}

describe('lookupBarcode', () => {
  it('matches a barcode we know, with its game and platform', async () => {
    await db
      .doc(`barcodes/${EAN}`)
      .set({ igdbGameId: 119133, platform: 'ps5', confirmations: 2, trusted: true });
    const { deps, searchGames } = lookupDeps();
    await expect(handleLookupBarcode(trader('u1'), { ean: EAN }, deps)).resolves.toEqual({
      ean: EAN,
      match: {
        game: expect.objectContaining({ objectID: '119133', title: 'Elden Ring' }),
        platform: 'ps5',
        trusted: true,
      },
      suggestions: [],
    });
    expect(searchGames).not.toHaveBeenCalled();
  });

  it('suggests games from the UPC product title for an unknown barcode', async () => {
    const { deps, searchGames } = lookupDeps({
      lookup: async () => ({ title: 'ELDEN RING PS5 Launch Edition' }),
    });
    await expect(handleLookupBarcode(trader('u1'), { ean: EAN }, deps)).resolves.toEqual({
      ean: EAN,
      suggestions: [RECORD],
    });
    expect(searchGames).toHaveBeenCalledWith('ELDEN RING PS5 Launch Edition');
  });

  it('returns no suggestions when nobody knows the barcode, even if the provider fails', async () => {
    const { deps } = lookupDeps({ lookup: async () => Promise.reject(new Error('quota')) });
    await expect(handleLookupBarcode(trader('u1'), { ean: EAN }, deps)).resolves.toEqual({
      ean: EAN,
      suggestions: [],
    });
  });

  it('rejects codes that are not EAN-13 and callers who cannot trade', async () => {
    const { deps } = lookupDeps();
    await expect(
      handleLookupBarcode(trader('u1'), { ean: '0711719541784' }, deps),
    ).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
    await expect(handleLookupBarcode(undefined, { ean: EAN }, deps)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    const noPhone = { uid: 'u1', token: {}, rawToken: 'raw' } as unknown as CallableRequest['auth'];
    await expect(handleLookupBarcode(noPhone, { ean: EAN }, deps)).rejects.toMatchObject({
      details: { reason: 'phoneRequired' },
    });
  });
});

describe('confirmBarcode', () => {
  const confirm = (uid: string, igdbGameId: number, platform = 'ps5', ean = EAN) =>
    handleConfirmBarcode(trader(uid), { ean, igdbGameId, platform }, { db });
  const mapping = async (ean = EAN) => (await db.doc(`barcodes/${ean}`).get()).data();

  it('maps a new barcode on the first confirmation and trusts it from the second user', async () => {
    await expect(confirm('u1', 119133)).resolves.toEqual({ trusted: false });
    expect(await mapping()).toMatchObject({
      igdbGameId: 119133,
      platform: 'ps5',
      confirmations: 1,
      trusted: false,
    });
    await expect(confirm('u2', 119133)).resolves.toEqual({ trusted: true });
    expect(await mapping()).toMatchObject({ confirmations: 2, trusted: true });
  });

  it('counts a user once, however often they confirm', async () => {
    await confirm('u1', 119133);
    await confirm('u1', 119133);
    expect(await mapping()).toMatchObject({ confirmations: 1, trusted: false });
  });

  it('follows the most-confirmed game, and keeps the current one on a tie', async () => {
    await confirm('u1', 119133);
    await confirm('u2', 2);
    // 1 vs 1: the first mapping stays.
    expect(await mapping()).toMatchObject({ igdbGameId: 119133, confirmations: 1 });
    await confirm('u3', 2);
    expect(await mapping()).toMatchObject({ igdbGameId: 2, confirmations: 2, trusted: true });
  });

  it('moves a vote when a user changes their mind', async () => {
    await confirm('u1', 119133);
    await confirm('u2', 119133);
    await confirm('u2', 2);
    expect(await mapping()).toMatchObject({ igdbGameId: 119133, confirmations: 1, trusted: false });
    expect((await db.doc(`barcodes/${EAN}/candidates/2_ps5`).get()).get('confirmations')).toBe(1);
  });

  it('keeps separate barcodes apart', async () => {
    await confirm('u1', 119133, 'ps5', EAN);
    await confirm('u1', 2, 'ps4', OTHER_EAN);
    expect(await mapping(EAN)).toMatchObject({ igdbGameId: 119133 });
    expect(await mapping(OTHER_EAN)).toMatchObject({ igdbGameId: 2, platform: 'ps4' });
  });

  it('rejects an unknown game or a platform the game is not on', async () => {
    await expect(confirm('u1', 999)).rejects.toMatchObject({ details: { reason: 'unknownGame' } });
    await expect(confirm('u1', 119133, 'switch')).rejects.toMatchObject({
      details: { reason: 'wrongPlatform' },
    });
    expect(await mapping()).toBeUndefined();
  });
});
