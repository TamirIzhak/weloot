import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

import { handleManageListing } from '../listings/manageListing';
import { handleDealAction, runDealReminders } from './deals';

jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const db = getFirestore(getApps()[0] ?? initializeApp());
const NOW = new Date('2026-10-25T12:00:00Z');
const DAY = 24 * 3_600_000;
const trader = (uid: string) =>
  ({
    uid,
    token: { phone_number: '+972541234567' },
    rawToken: 'raw',
  }) as unknown as CallableRequest['auth'];
let tick = 0;
const clock = () => new Date(NOW.getTime() + 1000 * tick++);
const deps = () => ({ db, now: clock });
const CONV = 'ownerGame_buyer';

function listing(userId: string, status = 'reserved', overrides: Record<string, unknown> = {}) {
  const ts = Timestamp.fromDate(NOW);
  return {
    userId,
    igdbGameId: 1,
    platform: 'ps5',
    gameTitle: `Game of ${userId}`,
    condition: 'good',
    hasCase: true,
    notes: '',
    isForTrade: true,
    isForSale: true,
    photoPaths: [],
    hasPhotos: false,
    status,
    location: { lat: 32, lng: 34.8, geohash: 'sv8', areaName: 'Holon' },
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

/** A conversation with an accepted offer: both games reserved, deal agreed. */
async function agreedDeal(overrides: Record<string, unknown> = {}, agreedAt = NOW) {
  await db.doc('listings/ownerGame').set(listing('owner'));
  await db.doc('listings/buyerGame').set(listing('buyer'));
  await db.doc(`conversations/${CONV}`).set({
    listingId: 'ownerGame',
    ownerId: 'owner',
    otherId: 'buyer',
    participants: ['owner', 'buyer'],
    openedWith: 'offer',
    unread: { owner: 0, buyer: 0 },
    deal: {
      status: 'agreed',
      offerId: 'o1',
      itemsOwner: ['ownerGame'],
      itemsOther: ['buyerGame'],
      cashAgorot: 0,
      confirmedBy: [],
      fulfillmentMethod: 'in_person',
      agreedAt: Timestamp.fromDate(agreedAt),
      ...overrides,
    },
  });
}

const act = (uid: string, action: string, reason?: string) =>
  handleDealAction(
    trader(uid),
    { conversationId: CONV, action, ...(reason ? { reason } : {}) },
    deps(),
  );
const swapped = (uid: string, listingId: string, withUid: string, action = 'closeTraded') =>
  handleManageListing(
    trader(uid),
    { listingId, action, closedWith: { kind: 'deal', userId: withUid, conversationId: CONV } },
    deps(),
  );
const conv = async () => (await db.doc(`conversations/${CONV}`).get()).data();
const status = async (id: string) => (await db.doc(`listings/${id}`).get()).get('status');
const trades = async (uid: string) => (await db.doc(`users/${uid}`).get()).get('completedTrades');
const events = async () =>
  (await db.collection(`conversations/${CONV}/messages`).orderBy('createdAt').get()).docs.map((d) =>
    d.get('event'),
  );

async function clear() {
  for (const name of ['conversations', 'listings', 'users', 'reports']) {
    await db.recursiveDelete(db.collection(name));
  }
}
beforeEach(async () => {
  tick = 0;
  await clear();
  await db.doc('users/owner').set({ username: 'owner', completedTrades: 3 });
  await db.doc('users/buyer').set({ username: 'buyer', completedTrades: 0 });
});
afterAll(clear);

describe('confirming a swap', () => {
  it('owner Swapped closes their game at once; the buyer’s Yes completes the deal for both', async () => {
    await agreedDeal();
    await expect(swapped('owner', 'ownerGame', 'buyer')).resolves.toEqual({ status: 'traded' });
    expect(await status('ownerGame')).toBe('traded');
    // The other game waits for its owner.
    expect(await status('buyerGame')).toBe('reserved');
    expect((await conv())?.deal).toMatchObject({
      status: 'awaiting_confirmation',
      confirmedBy: ['owner'],
    });
    expect(await trades('owner')).toBe(3);

    await expect(act('buyer', 'confirm')).resolves.toEqual({ status: 'completed' });
    expect(await status('buyerGame')).toBe('traded');
    expect((await db.doc('listings/buyerGame').get()).get('closedWith')).toEqual({
      kind: 'deal',
      userId: 'owner',
      conversationId: CONV,
    });
    expect((await conv())?.deal).toMatchObject({
      status: 'completed',
      confirmedBy: ['owner', 'buyer'],
    });
    expect(await trades('owner')).toBe(4);
    expect(await trades('buyer')).toBe(1);
    expect(await events()).toEqual(['deal_confirmed', 'deal_completed']);
  });

  it('either side may confirm first, from the deal header', async () => {
    await agreedDeal();
    await act('buyer', 'confirm');
    expect(await status('buyerGame')).toBe('traded');
    expect(await status('ownerGame')).toBe('reserved');
    // The owner's own Swapped doubles as the second confirmation.
    await swapped('owner', 'ownerGame', 'buyer');
    expect((await conv())?.deal).toMatchObject({ status: 'completed' });
    expect(await trades('buyer')).toBe(1);
  });

  it('closes a game sold for cash as Sold', async () => {
    await agreedDeal({ itemsOther: [], cashAgorot: 12000, cashPayerId: 'buyer' });
    await act('owner', 'confirm');
    expect(await status('ownerGame')).toBe('sold');
  });

  it('creates the deal when they agreed in chat (no accepted offer): the owner’s Swapped counts', async () => {
    await db.doc('listings/ownerGame').set(listing('owner', 'active'));
    await db.doc(`conversations/${CONV}`).set({
      listingId: 'ownerGame',
      ownerId: 'owner',
      otherId: 'buyer',
      participants: ['owner', 'buyer'],
      openedWith: 'question',
      unread: { owner: 0, buyer: 0 },
    });
    await swapped('owner', 'ownerGame', 'buyer');
    expect((await conv())?.deal).toMatchObject({
      status: 'awaiting_confirmation',
      confirmedBy: ['owner'],
      itemsOwner: ['ownerGame'],
      itemsOther: [],
      fulfillmentMethod: 'in_person',
    });
    await act('buyer', 'confirm');
    expect((await conv())?.deal).toMatchObject({ status: 'completed' });
    expect(await trades('buyer')).toBe(1);
  });

  it('confirms once per person, and only participants', async () => {
    await agreedDeal();
    await act('owner', 'confirm');
    await expect(act('owner', 'confirm')).rejects.toMatchObject({
      details: { reason: 'alreadyConfirmed' },
    });
    await expect(act('stranger', 'confirm')).rejects.toMatchObject({
      details: { reason: 'notParticipant' },
    });
    expect(await trades('owner')).toBe(3);
  });

  it('refuses closing "with" someone who isn’t in that conversation', async () => {
    await agreedDeal();
    await expect(swapped('owner', 'ownerGame', 'stranger')).rejects.toMatchObject({
      details: { reason: 'notInDeal' },
    });
    expect(await status('ownerGame')).toBe('reserved');
  });
});

describe('dispute and cancel', () => {
  it('"It didn’t happen" disputes the deal and opens a report; no trade counts', async () => {
    await agreedDeal();
    await act('owner', 'confirm');
    await expect(act('owner', 'dispute')).rejects.toMatchObject({
      details: { reason: 'alreadyConfirmed' },
    });
    await expect(act('buyer', 'dispute')).resolves.toEqual({ status: 'disputed' });
    expect((await db.doc(`reports/buyer_deal_${CONV}`).get()).data()).toMatchObject({
      reporterId: 'buyer',
      targetType: 'deal',
      targetId: CONV,
      reason: 'swap_didnt_happen',
    });
    expect(await trades('buyer')).toBe(0);
    await expect(act('buyer', 'confirm')).rejects.toMatchObject({
      details: { reason: 'invalidTransition' },
    });
  });

  it('cancel (with a reason) releases the reserved games, only before anyone confirmed', async () => {
    await agreedDeal();
    await expect(act('buyer', 'cancel')).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
    await expect(act('buyer', 'cancel', 'Changed my mind')).resolves.toEqual({
      status: 'cancelled',
    });
    expect(await status('ownerGame')).toBe('active');
    expect(await status('buyerGame')).toBe('active');
    expect((await conv())?.deal).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Changed my mind',
    });

    await agreedDeal();
    await act('owner', 'confirm');
    await expect(act('buyer', 'cancel', 'Too late')).rejects.toMatchObject({
      details: { reason: 'invalidTransition' },
    });
  });
});

describe('reminders', () => {
  it('asks "Did the swap happen?" once, 2 days after acceptance', async () => {
    await agreedDeal();
    await expect(runDealReminders(db, new Date(NOW.getTime() + DAY))).resolves.toBe(0);
    await expect(runDealReminders(db, new Date(NOW.getTime() + 2 * DAY))).resolves.toBe(1);
    await expect(runDealReminders(db, new Date(NOW.getTime() + 3 * DAY))).resolves.toBe(0);
    expect(await events()).toEqual(['deal_swap_reminder']);
  });

  it('reminds on day 1 and 3 of waiting, then marks the deal unconfirmed after 7 days (no trade count)', async () => {
    await agreedDeal({
      status: 'awaiting_confirmation',
      confirmedBy: ['owner'],
      awaitingSince: Timestamp.fromDate(NOW),
      confirmRemindersSent: 0,
    });
    const after = (days: number) => runDealReminders(db, new Date(NOW.getTime() + days * DAY));
    await expect(after(0.5)).resolves.toBe(0);
    await expect(after(1)).resolves.toBe(1);
    await expect(after(2)).resolves.toBe(0);
    await expect(after(3)).resolves.toBe(1);
    await expect(after(5)).resolves.toBe(0);
    await expect(after(7)).resolves.toBe(1);
    expect((await conv())?.deal).toMatchObject({ status: 'unconfirmed' });
    expect(await events()).toEqual([
      'deal_confirm_reminder',
      'deal_confirm_reminder',
      'deal_unconfirmed',
    ]);
    expect(await trades('owner')).toBe(3);
    expect(await trades('buyer')).toBe(0);
  });
});
