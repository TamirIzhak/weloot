import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  consume,
  DEFAULT_NEW_ACCOUNT_CONVERSATIONS_PER_DAY,
  LIMITS,
  limitFor,
  rateLimit,
} from './rateLimit';

jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const db = getFirestore(getApps()[0] ?? initializeApp());
const NOW = new Date('2026-10-25T12:00:00Z');
const DAY = 24 * 3_600_000;

async function clear() {
  for (const name of ['rateLimits', 'users', 'config'])
    await db.recursiveDelete(db.collection(name));
}
beforeEach(clear);
afterAll(clear);

describe('consume', () => {
  it('allows up to the limit in the window, then refuses, and frees up as time passes', async () => {
    const limit = { max: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++)
      await consume(db, 'u1', 'test', limit, new Date(NOW.getTime() + i * 1000));
    await expect(
      consume(db, 'u1', 'test', limit, new Date(NOW.getTime() + 3000)),
    ).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { reason: 'rateLimited' },
    });
    // Another user, or another action, isn't affected.
    await expect(consume(db, 'u2', 'test', limit, NOW)).resolves.toBeUndefined();
    await expect(consume(db, 'u1', 'other', limit, NOW)).resolves.toBeUndefined();
    // A minute after the first hit, there's room again; old hits are dropped from the doc.
    await expect(
      consume(db, 'u1', 'test', limit, new Date(NOW.getTime() + 60_500)),
    ).resolves.toBeUndefined();
    expect(((await db.doc('rateLimits/u1_test').get()).get('hits') as number[]).length).toBe(3);
  });
});

describe('limits per user', () => {
  it('gives new accounts fewer new conversations a day (config/limits), established ones the normal limit', async () => {
    await db.doc('users/new').set({ createdAt: Timestamp.fromMillis(NOW.getTime() - DAY) });
    await db.doc('users/old').set({ createdAt: Timestamp.fromMillis(NOW.getTime() - 30 * DAY) });
    expect(await limitFor(db, 'new', 'startConversation', NOW)).toEqual({
      max: DEFAULT_NEW_ACCOUNT_CONVERSATIONS_PER_DAY,
      windowMs: DAY,
    });
    expect(await limitFor(db, 'old', 'startConversation', NOW)).toEqual(LIMITS.startConversation);
    await db.doc('config/limits').set({ newAccountConversationsPerDay: 2 });
    expect((await limitFor(db, 'new', 'startConversation', NOW)).max).toBe(2);
    expect(await limitFor(db, 'new', 'sendOffer', NOW)).toEqual(LIMITS.sendOffer);
  });

  it('stops a new account after its daily conversations', async () => {
    await db.doc('users/new').set({ createdAt: Timestamp.fromMillis(NOW.getTime() - DAY) });
    await db.doc('config/limits').set({ newAccountConversationsPerDay: 2 });
    await rateLimit(db, 'new', 'startConversation', NOW);
    await rateLimit(db, 'new', 'startConversation', NOW);
    await expect(rateLimit(db, 'new', 'startConversation', NOW)).rejects.toMatchObject({
      details: { reason: 'rateLimited' },
    });
  });
});
