import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

import { handleRateUser } from './ratings';

jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const db = getFirestore(getApps()[0] ?? initializeApp());
const user = (uid: string) =>
  ({ uid, token: {}, rawToken: 'raw' }) as unknown as CallableRequest['auth'];
const rate = (uid: string, data: Record<string, unknown>) =>
  handleRateUser(user(uid), { conversationId: 'c1', ...data }, { db });

async function conversation(status: string) {
  await db.doc('conversations/c1').set({ participants: ['owner', 'buyer'], deal: { status } });
}

async function clear() {
  for (const name of ['conversations', 'users', 'ratings'])
    await db.recursiveDelete(db.collection(name));
}
beforeEach(async () => {
  await clear();
  await db.doc('users/owner').set({ username: 'dana', ratingAvg: 4, ratingCount: 1 });
  await db.doc('users/buyer').set({ username: 'yoni', ratingAvg: 0, ratingCount: 0 });
});
afterAll(clear);

describe('rateUser', () => {
  it('rates the other trader once after a completed deal and updates their average', async () => {
    await conversation('completed');
    await expect(rate('buyer', { stars: 5, comment: '  Smooth swap ' })).resolves.toEqual({
      ratingId: 'c1_buyer',
    });
    expect((await db.doc('ratings/c1_buyer').get()).data()).toMatchObject({
      raterId: 'buyer',
      rateeId: 'owner',
      stars: 5,
      comment: 'Smooth swap',
    });
    expect((await db.doc('users/owner').get()).data()).toMatchObject({
      ratingAvg: 4.5,
      ratingCount: 2,
    });
    await expect(rate('buyer', { stars: 1 })).rejects.toMatchObject({
      details: { reason: 'alreadyRated' },
    });
    expect((await db.doc('users/owner').get()).data()).toMatchObject({ ratingCount: 2 });

    await rate('owner', { stars: 4 });
    expect((await db.doc('users/buyer').get()).data()).toMatchObject({
      ratingAvg: 4,
      ratingCount: 1,
    });
  });

  it.each(['agreed', 'awaiting_confirmation', 'cancelled', 'unconfirmed', 'disputed'])(
    'refuses a deal that is %s (ratings only exist for completed deals)',
    async (status) => {
      await conversation(status);
      await expect(rate('buyer', { stars: 5 })).rejects.toMatchObject({
        details: { reason: 'notCompleted' },
      });
    },
  );

  it('refuses outsiders, a missing chat, bad stars and guests', async () => {
    await conversation('completed');
    await expect(rate('stranger', { stars: 5 })).rejects.toMatchObject({
      details: { reason: 'notParticipant' },
    });
    await expect(
      handleRateUser(user('buyer'), { conversationId: 'nope', stars: 5 }, { db }),
    ).rejects.toMatchObject({ details: { reason: 'notFound' } });
    await expect(rate('buyer', { stars: 6 })).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
    await expect(
      handleRateUser(undefined, { conversationId: 'c1', stars: 5 }, { db }),
    ).rejects.toMatchObject({
      details: { reason: 'signInRequired' },
    });
  });
});
