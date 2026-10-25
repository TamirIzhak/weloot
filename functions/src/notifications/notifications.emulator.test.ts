import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

import {
  fcmSender,
  handleRegisterPushToken,
  handleUnregisterPushToken,
  notifyForMessage,
  type Push,
} from './notifications';

jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));
jest.mock('firebase-functions', () => ({ logger: { warn: jest.fn() } }));

const db = getFirestore(getApps()[0] ?? initializeApp());
const user = (uid: string) =>
  ({ uid, token: {}, rawToken: 'raw' }) as unknown as CallableRequest['auth'];
const CONV = 'l1_buyer';

const sent: { tokens: string[]; push: Push }[] = [];
let invalid: string[] = [];
const sender = {
  send: jest.fn(async (tokens: string[], push: Push) => {
    sent.push({ tokens, push });
    return { invalidTokens: invalid };
  }),
};
const deps = { db, sender };

async function person(uid: string, username: string, settings: Record<string, unknown> = {}) {
  await db.doc(`users/${uid}`).set({ username });
  await db.doc(`users/${uid}/private/settings`).set({
    fcmTokens: [`token-${uid}`],
    preferredLanguage: 'en',
    ...settings,
  });
}

async function clear() {
  for (const name of ['users', 'conversations']) await db.recursiveDelete(db.collection(name));
}

beforeEach(async () => {
  await clear();
  jest.clearAllMocks();
  sent.length = 0;
  invalid = [];
  await person('owner', 'dana');
  await person('buyer', 'yoni', { preferredLanguage: 'he' });
  await db.doc(`conversations/${CONV}`).set({
    listingId: 'l1',
    ownerId: 'owner',
    otherId: 'buyer',
    participants: ['owner', 'buyer'],
    listingTitle: 'Elden Ring',
  });
  await db.doc(`conversations/${CONV}/offers/o1`).set({ fromUid: 'buyer', toUid: 'owner' });
  await db.doc(`conversations/${CONV}/offers/o2`).set({
    fromUid: 'owner',
    toUid: 'buyer',
    supersedesOfferId: 'o1',
  });
});
afterAll(clear);

describe('notifyForMessage', () => {
  it('pushes a chat message to the other participant, collapsed per conversation', async () => {
    await expect(
      notifyForMessage(deps, CONV, { senderId: 'owner', type: 'text', text: 'Hi there' }),
    ).resolves.toBe(1);
    expect(sent).toEqual([
      {
        tokens: ['token-buyer'],
        push: {
          title: 'dana',
          body: 'Hi there',
          data: { type: 'conversation', conversationId: CONV },
          collapseKey: CONV,
        },
      },
    ]);
  });

  it('pushes offers and counter-offers to their recipient, in the recipient’s language', async () => {
    await notifyForMessage(deps, CONV, { senderId: 'buyer', type: 'offer', offerId: 'o1' });
    await notifyForMessage(deps, CONV, { senderId: 'owner', type: 'offer', offerId: 'o2' });
    expect(sent.map((s) => [s.tokens[0], s.push.title])).toEqual([
      ['token-owner', 'New offer from yoni'],
      ['token-buyer', 'הצעה נגדית מ־dana'],
    ]);
    expect(sent[0]?.push.body).toBe('For Elden Ring. Tap to see it.');
  });

  it('tells the offer’s sender when it’s accepted, declined or expired, and the recipient when withdrawn', async () => {
    await notifyForMessage(deps, CONV, {
      senderId: 'system',
      type: 'system',
      event: 'offer_accepted',
      offerId: 'o1',
    });
    await notifyForMessage(deps, CONV, {
      senderId: 'system',
      type: 'system',
      event: 'offer_withdrawn',
      offerId: 'o1',
    });
    expect(sent.map((s) => [s.tokens[0], s.push.body])).toEqual([
      ['token-buyer', 'dana אישר/ה את ההצעה שלך. יש עסקה!'],
      ['token-owner', 'yoni withdrew their offer.'],
    ]);
  });

  it('asks only the person who still has to confirm "Did you swap?", and tells both when it completes', async () => {
    await db
      .doc(`conversations/${CONV}`)
      .update({ deal: { status: 'awaiting_confirmation', confirmedBy: ['owner'] } });
    await notifyForMessage(deps, CONV, {
      senderId: 'system',
      type: 'system',
      event: 'deal_confirmed',
    });
    expect(sent.map((s) => [s.tokens[0], s.push.body])).toEqual([
      ['token-buyer', 'החלפת את Elden Ring עם dana?'],
    ]);
    await notifyForMessage(deps, CONV, {
      senderId: 'system',
      type: 'system',
      event: 'deal_completed',
    });
    expect(sent.slice(1).map((s) => s.tokens[0])).toEqual(['token-owner', 'token-buyer']);
  });

  it('respects switched-off kinds, skips users without devices, and nothing for the safety tips', async () => {
    await db.doc('users/buyer/private/settings').update({ notificationPrefs: { messages: false } });
    await db.doc('users/owner/private/settings').update({ fcmTokens: [] });
    await expect(
      notifyForMessage(deps, CONV, { senderId: 'owner', type: 'text', text: 'Hi' }),
    ).resolves.toBe(0);
    await expect(
      notifyForMessage(deps, CONV, { senderId: 'buyer', type: 'text', text: 'Hi' }),
    ).resolves.toBe(0);
    await expect(
      notifyForMessage(deps, CONV, { senderId: 'system', type: 'safety_tips' }),
    ).resolves.toBe(0);
    // Offers are still on for the buyer.
    await expect(
      notifyForMessage(deps, CONV, { senderId: 'owner', type: 'offer', offerId: 'o2' }),
    ).resolves.toBe(1);
  });

  it('forgets devices the push service no longer knows', async () => {
    await db.doc('users/buyer/private/settings').update({ fcmTokens: ['dead', 'alive'] });
    invalid = ['dead'];
    await notifyForMessage(deps, CONV, { senderId: 'owner', type: 'text', text: 'Hi' });
    expect((await db.doc('users/buyer/private/settings').get()).get('fcmTokens')).toEqual([
      'alive',
    ]);
  });
});

describe('device registration', () => {
  it('keeps the newest devices first, without repeats, at most 10, and forgets one on sign-out', async () => {
    await handleRegisterPushToken(user('owner'), { token: 'phone-2' }, { db });
    await handleRegisterPushToken(user('owner'), { token: 'token-owner' }, { db });
    expect((await db.doc('users/owner/private/settings').get()).get('fcmTokens')).toEqual([
      'token-owner',
      'phone-2',
    ]);
    for (let i = 0; i < 12; i++)
      await handleRegisterPushToken(user('owner'), { token: `t${i}` }, { db });
    const tokens = (await db.doc('users/owner/private/settings').get()).get(
      'fcmTokens',
    ) as string[];
    expect(tokens).toHaveLength(10);
    expect(tokens[0]).toBe('t11');
    await handleUnregisterPushToken(user('owner'), { token: 't11' }, { db });
    expect((await db.doc('users/owner/private/settings').get()).get('fcmTokens')).not.toContain(
      't11',
    );
  });

  it('needs sign-in and a token', async () => {
    await expect(handleRegisterPushToken(undefined, { token: 'x' }, { db })).rejects.toMatchObject({
      details: { reason: 'signInRequired' },
    });
    await expect(
      handleRegisterPushToken(user('owner'), { token: '' }, { db }),
    ).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
  });
});

describe('fcmSender', () => {
  it('collapses per conversation on both platforms and reports dead tokens', async () => {
    const send = jest.fn(async () => ({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { code: 'messaging/internal-error' } },
      ],
    }));
    const result = await fcmSender({ sendEachForMulticast: send }).send(['a', 'b', 'c'], {
      title: 'T',
      body: 'B',
      data: { type: 'conversation', conversationId: 'c1' },
      collapseKey: 'c1',
    });
    expect(result).toEqual({ invalidTokens: ['b'] });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        android: { collapseKey: 'c1', notification: { tag: 'c1' } },
        apns: { headers: { 'apns-collapse-id': 'c1' }, payload: { aps: { threadId: 'c1' } } },
      }),
    );
  });
});
