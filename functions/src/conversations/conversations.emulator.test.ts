import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

import {
  expireOffers,
  handleMarkRead,
  handleRespondToOffer,
  handleSendMessage,
  handleSendOffer,
  handleStartConversation,
  invalidateOffersFor,
} from './conversations';

jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const db = getFirestore(getApps()[0] ?? initializeApp());
const NOW = new Date('2026-10-25T12:00:00Z');
const HOUR = 3_600_000;
const LATER = new Date(NOW.getTime() + HOUR);
const trader = (uid: string, phone = true) =>
  ({
    uid,
    token: phone ? { phone_number: '+972541234567' } : {},
    rawToken: 'raw',
  }) as unknown as CallableRequest['auth'];
// A clock that moves on with every call, so messages keep their order (as they do for real).
let tick = 0;
const clock = () => new Date(NOW.getTime() + 1000 * tick++);
const deps = (now?: Date) => ({ db, now: now ? () => now : clock });

function listing(userId: string, overrides: Record<string, unknown> = {}) {
  const ts = Timestamp.fromDate(NOW);
  return {
    userId,
    igdbGameId: 119388,
    platform: 'switch',
    gameTitle: `Game of ${userId}`,
    coverImageId: 'co1',
    condition: 'good',
    hasCase: true,
    notes: '',
    isForTrade: true,
    isForSale: true,
    askingPriceAgorot: 15000,
    photoPaths: [],
    hasPhotos: false,
    status: 'active',
    location: { lat: 32.08, lng: 34.78, geohash: 'sv8wr', areaName: 'Tel Aviv' },
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

const offer = (overrides: Record<string, unknown> = {}) => ({
  itemsFrom: ['buyerGame'],
  itemsTo: ['ownerGame'],
  cashAgorot: 0,
  ...overrides,
});

const start = (uid: string, data: Record<string, unknown>, now?: Date) =>
  handleStartConversation(trader(uid), data, deps(now));
const send = (uid: string, conversationId: string, data: Record<string, unknown>, now?: Date) =>
  handleSendOffer(trader(uid), { conversationId, offer: offer(data) }, deps(now));
const respond = (
  uid: string,
  conversationId: string,
  offerId: string,
  action: string,
  now?: Date,
) => handleRespondToOffer(trader(uid), { conversationId, offerId, action }, deps(now));

const CONV = 'ownerGame_buyer';
const conv = async (id = CONV) => (await db.doc(`conversations/${id}`).get()).data();
const offerDoc = async (id: string, conversationId = CONV) =>
  (await db.doc(`conversations/${conversationId}/offers/${id}`).get()).data();
const messages = async (conversationId = CONV) =>
  (
    await db.collection(`conversations/${conversationId}/messages`).orderBy('createdAt').get()
  ).docs.map((d) => d.data());
const status = async (listingId: string) =>
  (await db.doc(`listings/${listingId}`).get()).get('status');

async function clear() {
  for (const name of ['conversations', 'listings', 'users', 'config']) {
    await db.recursiveDelete(db.collection(name));
  }
}

beforeEach(async () => {
  tick = 0;
  await clear();
  await db.doc('listings/ownerGame').set(listing('owner'));
  await db.doc('listings/ownerTradeOnly').set(listing('owner', { isForSale: false }));
  await db.doc('listings/buyerGame').set(listing('buyer'));
  await db.doc('listings/otherGame').set(listing('buyer2'));
});
afterAll(clear);

describe('startConversation', () => {
  it('opens one conversation per listing and interested user with a question', async () => {
    await expect(
      start('buyer', { listingId: 'ownerGame', opener: 'question', text: '  Still available? ' }),
    ).resolves.toEqual({ conversationId: CONV, created: true });
    expect(await conv()).toMatchObject({
      listingId: 'ownerGame',
      ownerId: 'owner',
      otherId: 'buyer',
      participants: ['owner', 'buyer'],
      openedWith: 'question',
      unread: { owner: 1, buyer: 0 },
      lastMessagePreview: 'Still available?',
    });
    // Asking again reuses it.
    await expect(
      start('buyer', { listingId: 'ownerGame', opener: 'question', text: 'Hello?' }),
    ).resolves.toEqual({ conversationId: CONV, created: false });
    expect((await messages()).map((m) => m.text)).toEqual(['Still available?', 'Hello?']);
    expect(await conv()).toMatchObject({ unread: { owner: 2 } });
  });

  it('opens with an offer: pending for 72 h, with what each game looked like', async () => {
    await start(
      'buyer',
      { listingId: 'ownerGame', opener: 'offer', offer: offer({ note: ' Mint ' }) },
      NOW,
    );
    const c = await conv();
    expect(c).toMatchObject({
      openedWith: 'offer',
      pendingOfferTo: 'owner',
      listingTitle: 'Game of owner',
      listingCoverImageId: 'co1',
    });
    const sent = await offerDoc(c?.currentOfferId as string);
    expect(sent).toMatchObject({
      fromUid: 'buyer',
      toUid: 'owner',
      itemsFrom: ['buyerGame'],
      itemsTo: ['ownerGame'],
      listingIds: ['buyerGame', 'ownerGame'],
      cashAgorot: 0,
      note: 'Mint',
      status: 'pending',
      items: { ownerGame: { ownerId: 'owner', gameTitle: 'Game of owner', platform: 'switch' } },
    });
    expect((sent?.expiresAt as Timestamp).toMillis()).toBe(NOW.getTime() + 72 * HOUR);
    expect(await messages()).toMatchObject([{ senderId: 'buyer', type: 'offer' }]);
  });

  it('refuses your own listing, an inactive one, blocked users, no phone, bad input', async () => {
    await expect(
      start('owner', { listingId: 'ownerGame', opener: 'question', text: 'x' }),
    ).rejects.toMatchObject({
      details: { reason: 'ownListing' },
    });
    await db.doc('listings/ownerGame').update({ status: 'paused' });
    await expect(
      start('buyer', { listingId: 'ownerGame', opener: 'question', text: 'x' }),
    ).rejects.toMatchObject({
      details: { reason: 'listingUnavailable' },
    });
    await db.doc('users/owner/private/settings').set({ blockedUserIds: ['buyer'] });
    await expect(
      start('buyer', { listingId: 'ownerTradeOnly', opener: 'question', text: 'x' }),
    ).rejects.toMatchObject({ details: { reason: 'blocked' } });
    await expect(
      handleStartConversation(
        trader('buyer2', false),
        { listingId: 'ownerTradeOnly', opener: 'question', text: 'x' },
        deps(),
      ),
    ).rejects.toMatchObject({ details: { reason: 'phoneRequired' } });
    await expect(
      start('buyer2', { listingId: 'ownerTradeOnly', opener: 'question', text: '' }),
    ).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
  });
});

describe('offers', () => {
  beforeEach(async () => {
    await start('buyer', { listingId: 'ownerGame', opener: 'question', text: 'Hi' });
  });

  it('checks every game: yours on your side, theirs on theirs, all active, no repeats', async () => {
    await expect(send('buyer', CONV, { itemsFrom: ['otherGame'] })).rejects.toMatchObject({
      details: { reason: 'itemNotYours' },
    });
    await expect(send('buyer', CONV, { itemsTo: ['otherGame'] })).rejects.toMatchObject({
      details: { reason: 'itemNotTheirs' },
    });
    await db.doc('listings/buyerGame').update({ status: 'paused' });
    await expect(send('buyer', CONV, {})).rejects.toMatchObject({
      details: { reason: 'listingUnavailable' },
    });
    await expect(
      send('buyer', CONV, { itemsFrom: [], itemsTo: ['ownerGame', 'ownerGame'] }),
    ).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
    await expect(
      send('buyer', CONV, { itemsFrom: [], itemsTo: [], cashAgorot: 10000, cashPayerId: 'buyer' }),
    ).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
  });

  it('allows cash for a game only when it is for sale, paid by a participant', async () => {
    await expect(
      send('buyer', CONV, {
        itemsFrom: [],
        itemsTo: ['ownerTradeOnly'],
        cashAgorot: 10000,
        cashPayerId: 'buyer',
      }),
    ).rejects.toMatchObject({ details: { reason: 'notForSale' } });
    await expect(
      send('buyer', CONV, { itemsFrom: [], cashAgorot: 10000, cashPayerId: 'stranger' }),
    ).rejects.toMatchObject({ details: { reason: 'cashPayer' } });
    await expect(
      send('buyer', CONV, { itemsFrom: [], cashAgorot: 12000, cashPayerId: 'buyer' }),
    ).resolves.toHaveProperty('offerId');
    // A cash top-up with games is fine in either direction.
    await expect(
      send('owner', CONV, {
        itemsFrom: ['ownerGame'],
        itemsTo: ['buyerGame'],
        cashAgorot: 5000,
        cashPayerId: 'buyer',
      }),
    ).resolves.toHaveProperty('offerId');
  });

  it('only participants can send, and the input is validated (whole shekels, ≤ ₪2,000)', async () => {
    await expect(send('buyer2', CONV, {})).rejects.toMatchObject({
      details: { reason: 'notParticipant' },
    });
    await expect(
      send('buyer', CONV, { cashAgorot: 250000, cashPayerId: 'buyer' }),
    ).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
    await expect(
      send('buyer', CONV, { cashAgorot: 1050, cashPayerId: 'buyer' }),
    ).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
  });

  it('a counter-offer supersedes the pending one; only the latest can be accepted', async () => {
    const { offerId: first } = await send('buyer', CONV, {});
    const { offerId: counter } = await send('owner', CONV, {
      itemsFrom: ['ownerGame'],
      itemsTo: ['buyerGame'],
      cashAgorot: 5000,
      cashPayerId: 'buyer',
    });
    expect(await offerDoc(first)).toMatchObject({ status: 'superseded' });
    expect(await offerDoc(counter)).toMatchObject({ status: 'pending', supersedesOfferId: first });
    // Now the buyer has to answer.
    expect(await conv()).toMatchObject({ pendingOfferTo: 'buyer' });
    await expect(respond('owner', CONV, first, 'accept')).rejects.toMatchObject({
      details: { reason: 'offerNotPending' },
    });
    expect(await conv()).toMatchObject({ currentOfferId: counter });
  });

  it('accept: the recipient only; reserves every game, creates the deal, posts the safety tips', async () => {
    const { offerId } = await send('buyer', CONV, { cashAgorot: 2000, cashPayerId: 'buyer' });
    await expect(respond('buyer', CONV, offerId, 'accept')).rejects.toMatchObject({
      details: { reason: 'notRecipient' },
    });
    await expect(respond('owner', CONV, offerId, 'accept')).resolves.toEqual({
      status: 'accepted',
    });
    expect(await status('ownerGame')).toBe('reserved');
    expect(await status('buyerGame')).toBe('reserved');
    expect((await conv())?.deal).toMatchObject({
      status: 'agreed',
      offerId,
      itemsOwner: ['ownerGame'],
      itemsOther: ['buyerGame'],
      cashAgorot: 2000,
      cashPayerId: 'buyer',
      confirmedBy: [],
      fulfillmentMethod: 'in_person',
    });
    const all = await messages();
    expect(all.slice(-2)).toMatchObject([
      { senderId: 'system', type: 'system', event: 'offer_accepted', offerId },
      { senderId: 'system', type: 'safety_tips' },
    ]);
    // While the deal is on, no new offers.
    await expect(
      send('buyer', CONV, { itemsFrom: [], itemsTo: [], cashAgorot: 0 }),
    ).rejects.toBeDefined();
  });

  it('no new offer while a deal is on', async () => {
    await db.doc('listings/buyerGame2').set(listing('buyer'));
    const { offerId } = await send('buyer', CONV, {});
    await respond('owner', CONV, offerId, 'accept');
    await db.doc('listings/ownerGame3').set(listing('owner'));
    await expect(
      send('buyer', CONV, { itemsFrom: ['buyerGame2'], itemsTo: ['ownerGame3'] }),
    ).rejects.toMatchObject({ details: { reason: 'dealExists' } });
  });

  it('can’t accept after 72 h, or when a game is no longer active', async () => {
    const { offerId } = await send('buyer', CONV, {});
    await expect(
      respond('owner', CONV, offerId, 'accept', new Date(NOW.getTime() + 73 * HOUR)),
    ).rejects.toMatchObject({
      details: { reason: 'offerExpired' },
    });
    await db.doc('listings/buyerGame').update({ status: 'paused' });
    await expect(respond('owner', CONV, offerId, 'accept')).rejects.toMatchObject({
      details: { reason: 'listingUnavailable' },
    });
    expect(await status('ownerGame')).toBe('active');
  });

  it('decline (recipient) and withdraw (sender), each with a system message', async () => {
    const { offerId: a } = await send('buyer', CONV, {});
    await expect(respond('buyer', CONV, a, 'decline')).rejects.toMatchObject({
      details: { reason: 'notRecipient' },
    });
    await expect(respond('owner', CONV, a, 'decline')).resolves.toEqual({ status: 'declined' });
    expect(await conv()).not.toHaveProperty('pendingOfferTo');
    const { offerId: b } = await send('buyer', CONV, {});
    await expect(respond('owner', CONV, b, 'withdraw')).rejects.toMatchObject({
      details: { reason: 'notSender' },
    });
    await expect(respond('buyer', CONV, b, 'withdraw')).resolves.toEqual({ status: 'withdrawn' });
    expect((await messages()).filter((m) => m.type === 'system').map((m) => m.event)).toEqual([
      'offer_declined',
      'offer_withdrawn',
    ]);
  });
});

describe('system changes to pending offers', () => {
  it('declines other pending offers that include a game once it’s reserved, closed or removed', async () => {
    await start('buyer', { listingId: 'ownerGame', opener: 'offer', offer: offer() });
    await start('buyer2', {
      listingId: 'ownerGame',
      opener: 'offer',
      offer: { itemsFrom: ['otherGame'], itemsTo: ['ownerGame'], cashAgorot: 0 },
    });
    const accepted = (await conv())?.currentOfferId as string;
    await respond('owner', CONV, accepted, 'accept');
    await expect(
      invalidateOffersFor(
        db,
        'ownerGame',
        listing('owner'),
        listing('owner', { status: 'reserved' }),
        LATER,
      ),
    ).resolves.toBe(1);
    const other = 'ownerGame_buyer2';
    const otherOffer = (await conv(other))?.currentOfferId as string;
    expect(await offerDoc(otherOffer, other)).toMatchObject({ status: 'declined' });
    expect((await messages(other)).at(-1)).toMatchObject({
      type: 'system',
      event: 'offer_invalidated',
    });
    expect(await conv(other)).toMatchObject({ unread: { owner: 2, buyer2: 1 } });
    // The accepted offer isn't touched, and a repeat does nothing.
    expect(await offerDoc(accepted)).toMatchObject({ status: 'accepted' });
    await expect(
      invalidateOffersFor(
        db,
        'ownerGame',
        listing('owner'),
        listing('owner', { status: 'reserved' }),
        LATER,
      ),
    ).resolves.toBe(0);
    // A pause or an edit doesn't decline anything.
    await expect(
      invalidateOffersFor(
        db,
        'buyerGame',
        listing('buyer'),
        listing('buyer', { status: 'paused' }),
      ),
    ).resolves.toBe(0);
  });

  it('expires pending offers after 72 h, not before', async () => {
    await start('buyer', { listingId: 'ownerGame', opener: 'offer', offer: offer() }, NOW);
    const id = (await conv())?.currentOfferId as string;
    await expect(expireOffers(db, new Date(NOW.getTime() + 71 * HOUR))).resolves.toBe(0);
    await expect(expireOffers(db, new Date(NOW.getTime() + 72 * HOUR))).resolves.toBe(1);
    expect(await offerDoc(id)).toMatchObject({ status: 'expired' });
    expect(await conv()).not.toHaveProperty('pendingOfferTo');
    expect((await messages()).at(-1)).toMatchObject({ event: 'offer_expired' });
  });

  it('follows the offer expiry from config', async () => {
    await db.doc('config/limits').set({ offerExpiryHours: 24 });
    await start('buyer', { listingId: 'ownerGame', opener: 'offer', offer: offer() }, NOW);
    const sent = await offerDoc((await conv())?.currentOfferId as string);
    expect((sent?.expiresAt as Timestamp).toMillis()).toBe(NOW.getTime() + 24 * HOUR);
  });
});

describe('messages and read state', () => {
  beforeEach(async () => {
    await start('buyer', { listingId: 'ownerGame', opener: 'question', text: 'Hi' });
  });

  it('sends a message between participants only, unless blocked', async () => {
    await expect(
      handleSendMessage(trader('owner'), { conversationId: CONV, text: 'Yes!' }, deps()),
    ).resolves.toEqual({ ok: true });
    expect(await conv()).toMatchObject({
      lastMessagePreview: 'Yes!',
      unread: { buyer: 1, owner: 1 },
    });
    await expect(
      handleSendMessage(trader('buyer2'), { conversationId: CONV, text: 'Me too' }, deps()),
    ).rejects.toMatchObject({
      details: { reason: 'notParticipant' },
    });
    await db.doc('users/buyer/private/settings').set({ blockedUserIds: ['owner'] });
    await expect(
      handleSendMessage(trader('owner'), { conversationId: CONV, text: 'Hello?' }, deps()),
    ).rejects.toMatchObject({
      details: { reason: 'blocked' },
    });
  });

  it('clears the reader’s unread count', async () => {
    await handleMarkRead(trader('owner'), { conversationId: CONV }, deps());
    expect(await conv()).toMatchObject({ unread: { owner: 0 } });
    await expect(
      handleMarkRead(trader('buyer2'), { conversationId: CONV }, deps()),
    ).rejects.toMatchObject({
      details: { reason: 'notParticipant' },
    });
  });
});
