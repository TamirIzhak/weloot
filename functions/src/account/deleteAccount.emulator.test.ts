import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

import { DELETED_USERNAME, firestoreAccountStore, handleDeleteAccount } from './deleteAccount';

// Runs the real Admin SDK against the Firestore emulator (started by `npm test` via emulators:exec).

jest.mock('firebase-functions', () => ({ logger: { info: jest.fn() } }));
jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

// Firestore only (firebase-admin/auth loads an ESM-only module Jest can't require); the project and emulator host
// come from emulators:exec.
const db = getFirestore(getApps()[0] ?? initializeApp());
const auth = { deleteUser: jest.fn(async () => undefined) };
const callerFor = (uid: string) =>
  ({ uid, token: {}, rawToken: 'raw' }) as unknown as CallableRequest['auth'];

async function seed(uid: string, username: string) {
  const lower = username.toLowerCase();
  const now = new Date();
  await db.doc(`usernames/${lower}`).set({ uid });
  await db.doc(`users/${uid}`).set({
    username,
    usernameLower: lower,
    ratingAvg: 4.5,
    ratingCount: 2,
    completedTrades: 3,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .doc(`users/${uid}/private/settings`)
    .set({ email: 'dana@example.com', firstName: 'Dana' });
  await db.doc(`users/${uid}/locations/home`).set({ label: 'Home', address: 'Dizengoff 50' });
  await db.doc(`users/${uid}/locations/work`).set({ label: 'Work', address: 'Rothschild 1' });
  await db
    .doc(`wantlist/${uid}/items/119133_ps5`)
    .set({ igdbGameId: 119133, gameTitle: 'Elden Ring' });
}

async function clear() {
  await db.recursiveDelete(db.collection('users'));
  await db.recursiveDelete(db.collection('usernames'));
  await db.recursiveDelete(db.collection('wantlist'));
}

beforeEach(async () => {
  jest.clearAllMocks();
  await clear();
});

afterAll(async () => {
  await clear();
});

describe('deleteAccount on Firestore', () => {
  it('frees the username, deletes private data and leaves an anonymous tombstone', async () => {
    await seed('u1', 'Gamer_1');
    await handleDeleteAccount(callerFor('u1'), { store: firestoreAccountStore(db), auth });

    expect((await db.doc('usernames/gamer_1').get()).exists).toBe(false);
    expect((await db.doc('users/u1/private/settings').get()).exists).toBe(false);
    expect((await db.collection('users/u1/locations').get()).empty).toBe(true);
    expect((await db.collection('wantlist/u1/items').get()).empty).toBe(true);

    const profile = (await db.doc('users/u1').get()).data();
    expect(profile).toMatchObject({
      username: DELETED_USERNAME,
      usernameLower: '',
      ratingAvg: 4.5,
      completedTrades: 3,
    });
    expect(profile?.deletedAt).toBeDefined();
    expect(JSON.stringify(profile)).not.toMatch(/Gamer_1|dana|Dizengoff/i);
    expect(auth.deleteUser).toHaveBeenCalledWith('u1');
  });

  it('never frees a username that now belongs to someone else', async () => {
    await seed('u1', 'Gamer_1');
    await db.doc('usernames/gamer_1').set({ uid: 'u2' });
    await handleDeleteAccount(callerFor('u1'), { store: firestoreAccountStore(db), auth });
    expect((await db.doc('usernames/gamer_1').get()).get('uid')).toBe('u2');
  });

  it('can run twice (a retry after a partial failure) and keeps the first deletion time', async () => {
    await seed('u1', 'Gamer_1');
    const store = firestoreAccountStore(db);
    await handleDeleteAccount(callerFor('u1'), { store, auth });
    const first = (await db.doc('users/u1').get()).get('deletedAt');
    await handleDeleteAccount(callerFor('u1'), { store, auth });
    expect((await db.doc('users/u1').get()).get('deletedAt')).toEqual(first);
  });

  it('handles an account that never finished profile setup', async () => {
    await handleDeleteAccount(callerFor('u3'), { store: firestoreAccountStore(db), auth });
    expect((await db.doc('users/u3').get()).exists).toBe(false);
    expect(auth.deleteUser).toHaveBeenCalledWith('u3');
  });
});
