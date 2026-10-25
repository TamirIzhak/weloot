import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import {
  conversationIdFor,
  limitsConfigSchema,
  listingMachine,
  markReadInputSchema,
  OFFER_EXPIRY_HOURS,
  offerMachine,
  respondToOfferInputSchema,
  sendMessageInputSchema,
  sendOfferInputSchema,
  startConversationInputSchema,
  type ConversationError,
  type ListingStatus,
  type OfferInput,
  type OfferItem,
  type OfferStatus,
  type StartConversationResult,
  type SystemEvent,
} from '@weloot/shared';

import { requireTrader } from '../auth/requireTrader';

// Conversations, offers and deals (PRD W5, #23). Clients never write these docs (Security Rules); every change goes
// through these callables and the offer / listing state machines, in transactions that re-read what they check.

type Deps = { db: Firestore; now?: () => Date };
type Code = 'invalid-argument' | 'not-found' | 'permission-denied' | 'failed-precondition';

function fail(code: Code, reason: ConversationError): never {
  throw new HttpsError(code, `Conversation action failed: ${reason}`, { reason });
}

type Conversation = {
  listingId: string;
  ownerId: string;
  otherId: string;
  participants: [string, string];
  currentOfferId?: string;
  deal?: { status: string };
};

const conversations = (db: Firestore) => db.collection('conversations');

function conversationOf(snapshot: DocumentSnapshot): Conversation {
  if (!snapshot.exists) fail('not-found', 'notFound');
  return snapshot.data() as Conversation;
}

function otherParticipant(conversation: Conversation, uid: string): string {
  if (!conversation.participants.includes(uid)) fail('permission-denied', 'notParticipant');
  return conversation.participants[0] === uid
    ? conversation.participants[1]
    : conversation.participants[0];
}

/** Blocking either way stops conversations, messages and offers (PRD W9). */
async function assertNotBlocked(db: Firestore, a: string, b: string): Promise<void> {
  const [aSettings, bSettings] = await Promise.all(
    [a, b].map((uid) =>
      db.collection('users').doc(uid).collection('private').doc('settings').get(),
    ),
  );
  const blocks = (s: DocumentSnapshot, other: string) =>
    ((s.get('blockedUserIds') as string[] | undefined) ?? []).includes(other);
  if (aSettings && bSettings && (blocks(aSettings, b) || blocks(bSettings, a))) {
    fail('permission-denied', 'blocked');
  }
}

async function offerExpiryHours(db: Firestore): Promise<number> {
  const parsed = limitsConfigSchema
    .partial()
    .safeParse((await db.doc('config/limits').get()).data() ?? {});
  return (parsed.success ? parsed.data.offerExpiryHours : undefined) ?? OFFER_EXPIRY_HOURS;
}

/** A deal that's still on (agreed, or waiting for a confirmation) blocks new offers and accepts. */
function hasOpenDeal(conversation: Conversation): boolean {
  return (
    conversation.deal?.status === 'agreed' || conversation.deal?.status === 'awaiting_confirmation'
  );
}

type NewMessage = {
  senderId: string;
  type: 'text' | 'offer' | 'system' | 'safety_tips';
  text?: string;
  offerId?: string;
  event?: SystemEvent;
};

/** Appends a message and updates the conversation's preview, time and the recipients' unread counts. */
function writeMessage(
  tx: Transaction,
  conversationRef: DocumentReference,
  message: NewMessage,
  now: Timestamp,
  notify: readonly string[],
) {
  tx.set(conversationRef.collection('messages').doc(), { ...message, createdAt: now });
  const update: Record<string, unknown> = { lastMessageAt: now, updatedAt: now };
  if (message.type === 'text' && message.text) {
    update.lastMessagePreview = message.text.slice(0, 140);
  }
  for (const uid of notify) update[`unread.${uid}`] = FieldValue.increment(1);
  tx.update(conversationRef, update);
}

type ListingData = {
  userId: string;
  status: ListingStatus;
  igdbGameId: number;
  gameTitle: string;
  platform: OfferItem['platform'];
  coverImageId?: string;
  isForSale: boolean;
};

/** Reads an offer's listings (in a transaction): each must be active and belong to the right side. */
async function readOfferItems(
  tx: Transaction,
  db: Firestore,
  offer: OfferInput,
  fromUid: string,
  toUid: string,
) {
  const ids = [...offer.itemsFrom, ...offer.itemsTo];
  // Cash alone isn't a swap: at least one game, each once.
  if (ids.length === 0 || new Set(ids).size !== ids.length)
    fail('invalid-argument', 'invalidInput');
  const snapshots = await Promise.all(ids.map((id) => tx.get(db.collection('listings').doc(id))));
  const listings = new Map<string, ListingData>();
  snapshots.forEach((snapshot, i) => {
    const id = ids[i] as string;
    if (!snapshot.exists) fail('failed-precondition', 'listingUnavailable');
    const data = snapshot.data() as ListingData;
    if (data.status !== 'active') fail('failed-precondition', 'listingUnavailable');
    listings.set(id, data);
  });
  for (const id of offer.itemsFrom) {
    if (listings.get(id)?.userId !== fromUid) fail('permission-denied', 'itemNotYours');
  }
  for (const id of offer.itemsTo) {
    if (listings.get(id)?.userId !== toUid) fail('invalid-argument', 'itemNotTheirs');
  }
  // Cash for games only buys games that are for sale (PRD W5: cash-only offers for For Sale listings).
  const forSale = (list: string[]) => list.every((id) => listings.get(id)?.isForSale === true);
  if (offer.itemsFrom.length === 0 && !forSale(offer.itemsTo))
    fail('failed-precondition', 'notForSale');
  if (offer.itemsTo.length === 0 && !forSale(offer.itemsFrom))
    fail('failed-precondition', 'notForSale');
  if (offer.cashAgorot > 0 && offer.cashPayerId !== fromUid && offer.cashPayerId !== toUid) {
    fail('invalid-argument', 'cashPayer');
  }
  const items: Record<string, OfferItem> = {};
  for (const [id, l] of listings) {
    items[id] = {
      ownerId: l.userId,
      igdbGameId: l.igdbGameId,
      gameTitle: l.gameTitle,
      platform: l.platform,
      ...(l.coverImageId ? { coverImageId: l.coverImageId } : {}),
    };
  }
  return { items, listingIds: ids };
}

type PendingOffer = { ref: DocumentReference; fromUid: string; toUid: string; status: OfferStatus };

async function currentPendingOffer(
  tx: Transaction,
  conversationRef: DocumentReference,
  conversation: Conversation | null,
): Promise<PendingOffer | null> {
  if (!conversation?.currentOfferId) return null;
  const ref = conversationRef.collection('offers').doc(conversation.currentOfferId);
  const snapshot = await tx.get(ref);
  if (!snapshot.exists || snapshot.get('status') !== 'pending') return null;
  return {
    ref,
    fromUid: snapshot.get('fromUid') as string,
    toUid: snapshot.get('toUid') as string,
    status: 'pending',
  };
}

/** Writes a new offer (and its chat card); a pending one is superseded (a counter-offer, PRD W5). */
function writeOffer(
  tx: Transaction,
  conversationRef: DocumentReference,
  args: {
    fromUid: string;
    toUid: string;
    offer: OfferInput;
    items: Record<string, OfferItem>;
    listingIds: string[];
    previous: PendingOffer | null;
    now: Timestamp;
    expiryHours: number;
  },
): string {
  const ref = conversationRef.collection('offers').doc();
  const { offer, now } = args;
  if (args.previous) {
    tx.update(args.previous.ref, {
      status: offerMachine.transition('pending', 'counter'),
      updatedAt: now,
    });
  }
  tx.set(ref, {
    fromUid: args.fromUid,
    toUid: args.toUid,
    itemsFrom: offer.itemsFrom,
    itemsTo: offer.itemsTo,
    listingIds: args.listingIds,
    items: args.items,
    cashAgorot: offer.cashAgorot,
    ...(offer.cashAgorot > 0 && offer.cashPayerId ? { cashPayerId: offer.cashPayerId } : {}),
    ...(offer.note?.trim() ? { note: offer.note.trim() } : {}),
    status: 'pending',
    ...(args.previous ? { supersedesOfferId: args.previous.ref.id } : {}),
    expiresAt: Timestamp.fromMillis(now.toMillis() + args.expiryHours * 3_600_000),
    createdAt: now,
    updatedAt: now,
  });
  tx.update(conversationRef, { currentOfferId: ref.id, pendingOfferTo: args.toUid });
  writeMessage(
    tx,
    conversationRef,
    { senderId: args.fromUid, type: 'offer', offerId: ref.id },
    now,
    [args.toUid],
  );
  return ref.id;
}

/**
 * "Make an offer" / "Ask a question" on a game page (PRD W5). One conversation per listing and interested user:
 * starting again reuses it (the question or offer is added to it). Needs a verified phone.
 */
export async function handleStartConversation(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: Deps,
): Promise<StartConversationResult> {
  const uid = requireTrader(auth);
  const parsed = startConversationInputSchema.safeParse(data);
  if (!parsed.success) fail('invalid-argument', 'invalidInput');
  const input = parsed.data;
  const { db } = deps;

  const listingRef = db.collection('listings').doc(input.listingId);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) fail('failed-precondition', 'listingUnavailable');
  const ownerId = listingSnap.get('userId') as string;
  if (ownerId === uid) fail('failed-precondition', 'ownListing');
  await assertNotBlocked(db, uid, ownerId);
  const expiryHours = input.opener === 'offer' ? await offerExpiryHours(db) : 0;

  const conversationId = conversationIdFor(input.listingId, uid);
  const conversationRef = conversations(db).doc(conversationId);
  return db.runTransaction(async (tx) => {
    const [listing, existing] = await Promise.all([tx.get(listingRef), tx.get(conversationRef)]);
    if (listing.get('status') !== 'active') fail('failed-precondition', 'listingUnavailable');
    const conversation = existing.exists ? (existing.data() as Conversation) : null;
    const offerReads =
      input.opener === 'offer'
        ? {
            items: await readOfferItems(tx, db, input.offer, uid, ownerId),
            previous: await currentPendingOffer(tx, conversationRef, conversation),
          }
        : null;
    if (offerReads && conversation && hasOpenDeal(conversation))
      fail('failed-precondition', 'dealExists');

    const now = Timestamp.fromDate(deps.now?.() ?? new Date());
    if (!conversation) {
      tx.set(conversationRef, {
        listingId: input.listingId,
        ownerId,
        otherId: uid,
        participants: [ownerId, uid],
        openedWith: input.opener,
        // What the inbox shows, even once the listing is reserved or closed (others can't read it then).
        listingTitle: listing.get('gameTitle') as string,
        ...(listing.get('coverImageId')
          ? { listingCoverImageId: listing.get('coverImageId') as string }
          : {}),
        unread: { [ownerId]: 0, [uid]: 0 },
        createdAt: now,
        updatedAt: now,
      });
    }
    if (input.opener === 'question') {
      writeMessage(tx, conversationRef, { senderId: uid, type: 'text', text: input.text }, now, [
        ownerId,
      ]);
    } else if (offerReads) {
      writeOffer(tx, conversationRef, {
        fromUid: uid,
        toUid: ownerId,
        offer: input.offer,
        ...offerReads.items,
        previous: offerReads.previous,
        now,
        expiryHours,
      });
    }
    return { conversationId, created: !conversation };
  });
}

/** A chat message (PRD W5). Participants only; blocked users can't message each other. */
export async function handleSendMessage(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: Deps,
): Promise<{ ok: true }> {
  const uid = requireTrader(auth);
  const parsed = sendMessageInputSchema.safeParse(data);
  if (!parsed.success) fail('invalid-argument', 'invalidInput');
  const { db } = deps;
  const ref = conversations(db).doc(parsed.data.conversationId);
  const other = otherParticipant(conversationOf(await ref.get()), uid);
  await assertNotBlocked(db, uid, other);
  await db.runTransaction(async (tx) => {
    otherParticipant(conversationOf(await tx.get(ref)), uid);
    const now = Timestamp.fromDate(deps.now?.() ?? new Date());
    writeMessage(tx, ref, { senderId: uid, type: 'text', text: parsed.data.text }, now, [other]);
  });
  return { ok: true };
}

/** An offer (or a counter-offer) from either participant, at any time while no deal is on (PRD W5). */
export async function handleSendOffer(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: Deps,
): Promise<{ offerId: string }> {
  const uid = requireTrader(auth);
  const parsed = sendOfferInputSchema.safeParse(data);
  if (!parsed.success) fail('invalid-argument', 'invalidInput');
  const { db } = deps;
  const ref = conversations(db).doc(parsed.data.conversationId);
  const other = otherParticipant(conversationOf(await ref.get()), uid);
  await assertNotBlocked(db, uid, other);
  const expiryHours = await offerExpiryHours(db);
  return db.runTransaction(async (tx) => {
    const conversation = conversationOf(await tx.get(ref));
    otherParticipant(conversation, uid);
    const items = await readOfferItems(tx, db, parsed.data.offer, uid, other);
    const previous = await currentPendingOffer(tx, ref, conversation);
    if (hasOpenDeal(conversation)) fail('failed-precondition', 'dealExists');
    const now = Timestamp.fromDate(deps.now?.() ?? new Date());
    const offerId = writeOffer(tx, ref, {
      fromUid: uid,
      toUid: other,
      offer: parsed.data.offer,
      ...items,
      previous,
      now,
      expiryHours,
    });
    return { offerId };
  });
}

/**
 * Accept / decline (the recipient) or withdraw (the sender) the conversation's pending offer (PRD W5). Accepting
 * the latest pending offer reserves every listing in it and creates the deal; other pending offers that include
 * those listings are then declined by `invalidateOffersFor` (listing trigger).
 */
export async function handleRespondToOffer(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: Deps,
): Promise<{ status: OfferStatus }> {
  const uid = requireTrader(auth);
  const parsed = respondToOfferInputSchema.safeParse(data);
  if (!parsed.success) fail('invalid-argument', 'invalidInput');
  const { conversationId, offerId, action } = parsed.data;
  const { db } = deps;
  const ref = conversations(db).doc(conversationId);
  const offerRef = ref.collection('offers').doc(offerId);

  return db.runTransaction(async (tx) => {
    const conversation = conversationOf(await tx.get(ref));
    const other = otherParticipant(conversation, uid);
    const offerSnap = await tx.get(offerRef);
    if (!offerSnap.exists) fail('not-found', 'notFound');
    const offer = offerSnap.data() as {
      fromUid: string;
      toUid: string;
      status: OfferStatus;
      listingIds: string[];
      cashAgorot: number;
      cashPayerId?: string;
      expiresAt: Timestamp;
    };
    if (offer.status !== 'pending') fail('failed-precondition', 'offerNotPending');
    const now = Timestamp.fromDate(deps.now?.() ?? new Date());

    if (action === 'withdraw') {
      if (offer.fromUid !== uid) fail('permission-denied', 'notSender');
      const status = offerMachine.transition('pending', 'withdraw');
      tx.update(offerRef, { status, updatedAt: now });
      // The inbox's "needs action" marker goes with the offer.
      if (conversation.currentOfferId === offerId)
        tx.update(ref, { pendingOfferTo: FieldValue.delete() });
      writeMessage(
        tx,
        ref,
        { senderId: 'system', type: 'system', event: 'offer_withdrawn', offerId },
        now,
        [other],
      );
      return { status };
    }
    if (offer.toUid !== uid) fail('permission-denied', 'notRecipient');
    if (action === 'decline') {
      const status = offerMachine.transition('pending', 'decline');
      tx.update(offerRef, { status, updatedAt: now });
      // The inbox's "needs action" marker goes with the offer.
      if (conversation.currentOfferId === offerId)
        tx.update(ref, { pendingOfferTo: FieldValue.delete() });
      writeMessage(
        tx,
        ref,
        { senderId: 'system', type: 'system', event: 'offer_declined', offerId },
        now,
        [other],
      );
      return { status };
    }

    // Accept: only the latest pending offer, before it expires, while no deal is on, with every game still active.
    if (conversation.currentOfferId !== offerId) fail('failed-precondition', 'notLatestOffer');
    if (offer.expiresAt.toMillis() <= now.toMillis()) fail('failed-precondition', 'offerExpired');
    if (hasOpenDeal(conversation)) fail('failed-precondition', 'dealExists');
    const listingRefs = offer.listingIds.map((id) => db.collection('listings').doc(id));
    const listings = await Promise.all(listingRefs.map((r) => tx.get(r)));
    for (const listing of listings) {
      if (!listing.exists || listing.get('status') !== 'active') {
        fail('failed-precondition', 'listingUnavailable');
      }
    }
    const status = offerMachine.transition('pending', 'accept');
    tx.update(offerRef, { status, updatedAt: now });
    if (conversation.currentOfferId === offerId)
      tx.update(ref, { pendingOfferTo: FieldValue.delete() });
    listings.forEach((listing, i) => {
      tx.update(listingRefs[i] as DocumentReference, {
        status: listingMachine.transition(listing.get('status') as ListingStatus, 'reserve'),
        updatedAt: now,
      });
    });
    const owned = (owner: string) =>
      listings.filter((l) => l.get('userId') === owner).map((l) => l.id);
    tx.update(ref, {
      deal: {
        status: 'agreed',
        offerId,
        itemsOwner: owned(conversation.ownerId),
        itemsOther: owned(conversation.otherId),
        cashAgorot: offer.cashAgorot,
        ...(offer.cashAgorot > 0 && offer.cashPayerId ? { cashPayerId: offer.cashPayerId } : {}),
        confirmedBy: [],
        fulfillmentMethod: 'in_person',
        agreedAt: now,
      },
    });
    writeMessage(
      tx,
      ref,
      { senderId: 'system', type: 'system', event: 'offer_accepted', offerId },
      now,
      [other],
    );
    // The safety tips card, once per deal (PRD W6); a millisecond later so it always shows after the acceptance.
    writeMessage(
      tx,
      ref,
      { senderId: 'system', type: 'safety_tips' },
      Timestamp.fromMillis(now.toMillis() + 1),
      [],
    );
    return { status };
  });
}

/** Opening a conversation clears the reader's unread count. */
export async function handleMarkRead(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: Deps,
): Promise<{ ok: true }> {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first', { reason: 'signInRequired' });
  const parsed = markReadInputSchema.safeParse(data);
  if (!parsed.success) fail('invalid-argument', 'invalidInput');
  const ref = conversations(deps.db).doc(parsed.data.conversationId);
  await deps.db.runTransaction(async (tx) => {
    otherParticipant(conversationOf(await tx.get(ref)), auth.uid);
    tx.update(ref, { [`unread.${auth.uid}`]: 0 });
  });
  return { ok: true };
}

/** Moves one pending offer to a final state with a system message, if it's still pending. */
async function closeOffer(
  db: Firestore,
  offerRef: DocumentReference,
  event: 'expire' | 'invalidate',
  now: Timestamp,
): Promise<boolean> {
  const conversationRef = offerRef.parent.parent;
  if (!conversationRef) return false;
  return db.runTransaction(async (tx) => {
    const [offer, conversation] = await Promise.all([tx.get(offerRef), tx.get(conversationRef)]);
    if (offer.get('status') !== 'pending' || !conversation.exists) return false;
    tx.update(offerRef, { status: offerMachine.transition('pending', event), updatedAt: now });
    if (conversation.get('currentOfferId') === offerRef.id) {
      tx.update(conversationRef, { pendingOfferTo: FieldValue.delete() });
    }
    const participants = (conversation.get('participants') as string[] | undefined) ?? [];
    writeMessage(
      tx,
      conversationRef,
      {
        senderId: 'system',
        type: 'system',
        event: event === 'expire' ? 'offer_expired' : 'offer_invalidated',
        offerId: offerRef.id,
      },
      now,
      participants,
    );
    return true;
  });
}

/** Scheduled: pending offers past their 72 h (PRD W5). */
export async function expireOffers(db: Firestore, now = new Date()): Promise<number> {
  const due = await db
    .collectionGroup('offers')
    .where('status', '==', 'pending')
    .where('expiresAt', '<=', Timestamp.fromDate(now))
    .limit(500)
    .get();
  let count = 0;
  for (const offer of due.docs) {
    if (await closeOffer(db, offer.ref, 'expire', Timestamp.fromDate(now))) count++;
  }
  return count;
}

const GONE: readonly unknown[] = ['reserved', 'traded', 'sold', 'removed'];

/**
 * Listing trigger: once a listing is reserved by a deal, closed or removed, pending offers that include it can't
 * happen; they're declined with a system message (PRD W5: "auto-declined").
 */
export async function invalidateOffersFor(
  db: Firestore,
  listingId: string,
  before: unknown,
  after: unknown,
  now = new Date(),
): Promise<number> {
  const statusOf = (d: unknown) => (d as { status?: unknown } | undefined)?.status;
  const gone = after === undefined || GONE.includes(statusOf(after));
  if (!gone || statusOf(before) === statusOf(after)) return 0;
  const pending = await db
    .collectionGroup('offers')
    .where('listingIds', 'array-contains', listingId)
    .where('status', '==', 'pending')
    .get();
  let count = 0;
  for (const offer of pending.docs) {
    if (await closeOffer(db, offer.ref, 'invalidate', Timestamp.fromDate(now))) count++;
  }
  return count;
}
