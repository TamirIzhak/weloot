import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

import { handleSetBlocked } from './block';

jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const db = getFirestore(getApps()[0] ?? initializeApp());
const user = (uid: string) =>
  ({ uid, token: {}, rawToken: 'raw' }) as unknown as CallableRequest['auth'];
const recompute = jest.fn(async () => undefined);
const block = (uid: string, userId: string, blocked = true) =>
  handleSetBlocked(user(uid), { userId, blocked }, { db, recompute });
const settings = async (uid: string) =>
  (await db.doc(`users/${uid}/private/settings`).get()).data();

beforeEach(async () => {
  await db.recursiveDelete(db.collection('users'));
  jest.clearAllMocks();
  for (const uid of ['alice', 'bob']) {
    await db.doc(`users/${uid}`).set({ username: uid });
    await db.doc(`users/${uid}/private/settings`).set({ blockedUserIds: [] });
  }
});
afterAll(async () => {
  await db.recursiveDelete(db.collection('users'));
});

describe('setBlocked', () => {
  it('blocks both ways in effect: my list, their blocked-by list, and the pair’s matches recomputed', async () => {
    await expect(block('alice', 'bob')).resolves.toEqual({ blocked: true });
    expect(await settings('alice')).toMatchObject({ blockedUserIds: ['bob'] });
    expect(await settings('bob')).toMatchObject({ blockedByUserIds: ['alice'] });
    expect(recompute).toHaveBeenCalledWith('alice', 'bob');
    // Blocking twice keeps one entry.
    await block('alice', 'bob');
    expect(await settings('alice')).toMatchObject({ blockedUserIds: ['bob'] });
  });

  it('unblocks', async () => {
    await block('alice', 'bob');
    await expect(block('alice', 'bob', false)).resolves.toEqual({ blocked: false });
    expect(await settings('alice')).toMatchObject({ blockedUserIds: [] });
    expect(await settings('bob')).toMatchObject({ blockedByUserIds: [] });
  });

  it('refuses yourself, unknown users, and guests', async () => {
    await expect(block('alice', 'alice')).rejects.toMatchObject({
      details: { reason: 'ownTarget' },
    });
    await expect(block('alice', 'ghost')).rejects.toMatchObject({
      details: { reason: 'notFound' },
    });
    await expect(
      handleSetBlocked(undefined, { userId: 'bob', blocked: true }, { db }),
    ).rejects.toMatchObject({
      details: { reason: 'signInRequired' },
    });
  });
});
