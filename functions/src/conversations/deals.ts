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
  applyConfirmation,
  applyDispute,
  dealActionInputSchema,
  DealActionError,
  dealMachine,
  initialDeal,
  listingMachine,
  TransitionError,
  type ConversationError,
  type DealStatus,
  type ListingStatus,
  type SystemEvent,
} from '@weloot/shared';

import { requireTrader } from '../auth/requireTrader';

// Deals (PRD W6, #47). Listings close on their owner's word alone; trust (trade counts, ratings) needs both people:
// the first "Swapped" moves the deal to awaiting_confirmation, the other's "Yes" completes it. Everything happens
// in transactions through the deal and listing state machines.

const DAY_MS = 24 * 60 * 60 * 1000;

function fail(
  code: 'invalid-argument' | 'not-found' | 'permission-denied' | 'failed-precondition',
  reason: ConversationError,
): never {
  throw new HttpsError(code, `Deal action failed: ${reason}`, { reason });
}

export type Deal = {
  status: DealStatus;
  offerId?: string;
  itemsOwner: string[];
  itemsOther: string[];
  cashAgorot: number;
  cashPayerId?: string;
  confirmedBy: string[];
  awaitingSince?: Timestamp;
  agreedAt: Timestamp;
  swapReminderAt?: Timestamp;
  confirmRemindersSent?: number;
};

type ConversationData = {
  listingId: string;
  ownerId: string;
  otherId: string;
  participants: [string, string];
  deal?: Deal;
};

/** A deal that's still on: listings can be confirmed into it. */
export const isOpenDeal = (deal: Deal | undefined): boolean =>
  deal?.status === 'agreed' || deal?.status === 'awaiting_confirmation';

function systemMessage(
  tx: Transaction,
  conversationRef: DocumentReference,
  event: SystemEvent,
  now: Timestamp,
  notify: readonly string[],
) {
  tx.set(conversationRef.collection('messages').doc(), {
    senderId: 'system',
    type: 'system',
    event,
    createdAt: now,
  });
  const update: Record<string, unknown> = { lastMessageAt: now, updatedAt: now };
  for (const uid of notify) update[`unread.${uid}`] = FieldValue.increment(1);
  tx.update(conversationRef, update);
}

/** A swapped listing closes as Sold when the other side only paid cash, as Swapped otherwise. */
function closeEvent(deal: Deal, conversation: ConversationData, ownerOfListing: string) {
  const otherSideGames =
    ownerOfListing === conversation.ownerId ? deal.itemsOther : deal.itemsOwner;
  return otherSideGames.length === 0 && deal.cashAgorot > 0 ? 'closeSold' : 'closeTraded';
}

type ReadDeal = {
  ref: DocumentReference;
  conversation: ConversationData;
  /** Every listing in the deal, by ID. */
  listings: Map<string, DocumentSnapshot>;
};

/** Reads a conversation and its deal's listings (all reads before any write, as transactions require). */
export async function readDeal(
  tx: Transaction,
  db: Firestore,
  conversationId: string,
  uid: string,
): Promise<ReadDeal> {
  const ref = db.collection('conversations').doc(conversationId);
  const snapshot = await tx.get(ref);
  if (!snapshot.exists) fail('not-found', 'notFound');
  const conversation = snapshot.data() as ConversationData;
  if (!conversation.participants.includes(uid)) fail('permission-denied', 'notParticipant');
  const ids = conversation.deal
    ? [...conversation.deal.itemsOwner, ...conversation.deal.itemsOther]
    : [];
  const listings = new Map<string, DocumentSnapshot>();
  const snapshots = await Promise.all(ids.map((id) => tx.get(db.collection('listings').doc(id))));
  snapshots.forEach((s) => listings.set(s.id, s));
  return { ref, conversation, listings };
}

/** Closes a reserved deal listing (system side of a confirmation). */
function closeListing(
  tx: Transaction,
  listing: DocumentSnapshot,
  read: ReadDeal,
  deal: Deal,
  now: Timestamp,
) {
  const status = listing.get('status') as ListingStatus;
  if (status !== 'reserved') return;
  const owner = listing.get('userId') as string;
  const other = read.conversation.participants.find((p) => p !== owner) as string;
  tx.update(listing.ref, {
    status: listingMachine.transition(status, closeEvent(deal, read.conversation, owner)),
    closedWith: { kind: 'deal', userId: other, conversationId: read.ref.id },
    closedAt: now,
    updatedAt: now,
  });
}

/**
 * Records `uid`'s confirmation that the swap happened (PRD W6). Closes the caller's games still reserved in the
 * deal (except `alreadyClosed`, which the caller closes itself). With no open deal (e.g. they agreed in chat), an
 * owner's "Swapped" creates one that already counts as their confirmation. The second confirmation completes the
 * deal: trade counts +1 for both, and any game still reserved in it closes.
 */
export function writeConfirmation(
  tx: Transaction,
  read: ReadDeal,
  uid: string,
  now: Timestamp,
  options: { listingId?: string; alreadyClosed?: string; ignoreRepeat?: boolean } = {},
): DealStatus | null {
  const { conversation } = read;
  const other = conversation.participants.find((p) => p !== uid) as string;
  let deal = conversation.deal;

  if (!isOpenDeal(deal)) {
    // A finished deal (completed, disputed) keeps its history; a fresh "Swapped" after a cancelled or unconfirmed
    // one, or without any, starts a new deal holding the owner's game.
    if (deal && (deal.status === 'completed' || deal.status === 'disputed')) return null;
    if (!options.listingId) fail('failed-precondition', 'noDeal');
    const mineIsOwner = uid === conversation.ownerId;
    const fresh: Deal = {
      ...initialDeal('ownerSwap', uid),
      confirmedBy: [uid],
      itemsOwner: mineIsOwner ? [options.listingId] : [],
      itemsOther: mineIsOwner ? [] : [options.listingId],
      cashAgorot: 0,
      agreedAt: now,
      awaitingSince: now,
      confirmRemindersSent: 0,
    } as Deal;
    tx.update(read.ref, { deal: { ...fresh, fulfillmentMethod: 'in_person' }, updatedAt: now });
    systemMessage(tx, read.ref, 'deal_confirmed', now, [other]);
    return fresh.status;
  }

  let next;
  try {
    next = applyConfirmation(deal as Deal, conversation.participants, uid);
  } catch (error) {
    if (error instanceof DealActionError && error.reason === 'already_confirmed') {
      if (options.ignoreRepeat) return (deal as Deal).status;
      fail('failed-precondition', 'alreadyConfirmed');
    }
    throw error;
  }
  deal = { ...(deal as Deal), ...next, confirmedBy: [...next.confirmedBy] };
  for (const listing of read.listings.values()) {
    const mine = listing.get('userId') === uid;
    if (listing.id === options.alreadyClosed) continue;
    // My games close with my confirmation; everything still reserved closes once the deal completes.
    if (mine || deal.status === 'completed') closeListing(tx, listing, read, deal, now);
  }
  const update: Record<string, unknown> = {
    'deal.status': deal.status,
    'deal.confirmedBy': deal.confirmedBy,
    updatedAt: now,
  };
  if (deal.status === 'awaiting_confirmation') {
    update['deal.awaitingSince'] = now;
    update['deal.confirmRemindersSent'] = 0;
  }
  if (deal.status === 'completed') {
    update['deal.completedAt'] = now;
    for (const participant of conversation.participants) {
      tx.set(
        read.ref.firestore.collection('users').doc(participant),
        { completedTrades: FieldValue.increment(1) },
        { merge: true },
      );
    }
  }
  tx.update(read.ref, update);
  systemMessage(
    tx,
    read.ref,
    deal.status === 'completed' ? 'deal_completed' : 'deal_confirmed',
    now,
    deal.status === 'completed' ? conversation.participants : [other],
  );
  return deal.status;
}

/**
 * The deal header / banner actions: confirm ("Swapped", "Yes, we swapped"), dispute ("No, it didn't happen": a
 * report for support), cancel (before anyone confirmed; the reserved games go back to active).
 */
export async function handleDealAction(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: { db: Firestore; now?: () => Date },
): Promise<{ status: DealStatus }> {
  const uid = requireTrader(auth);
  const parsed = dealActionInputSchema.safeParse(data);
  if (!parsed.success) fail('invalid-argument', 'invalidInput');
  const { conversationId, action, reason } = parsed.data;
  const { db } = deps;

  return db.runTransaction(async (tx) => {
    const read = await readDeal(tx, db, conversationId, uid);
    const deal = read.conversation.deal;
    if (!deal) fail('failed-precondition', 'noDeal');
    const now = Timestamp.fromDate(deps.now?.() ?? new Date());
    const other = read.conversation.participants.find((p) => p !== uid) as string;

    try {
      if (action === 'confirm') {
        if (!isOpenDeal(deal)) fail('failed-precondition', 'invalidTransition');
        return { status: writeConfirmation(tx, read, uid, now) as DealStatus };
      }
      if (action === 'dispute') {
        const next = applyDispute(deal, read.conversation.participants, uid);
        tx.update(read.ref, { 'deal.status': next.status, updatedAt: now });
        // Support resolves it from the console (PRD W9).
        tx.set(db.collection('reports').doc(`${uid}_deal_${conversationId}`), {
          reporterId: uid,
          targetType: 'deal',
          targetId: conversationId,
          reason: 'swap_didnt_happen',
          createdAt: now,
        });
        systemMessage(tx, read.ref, 'deal_disputed', now, [other]);
        return { status: next.status };
      }
      const status = dealMachine.transition(deal.status, 'cancel');
      for (const listing of read.listings.values()) {
        if (listing.get('status') === 'reserved') {
          tx.update(listing.ref, {
            status: listingMachine.transition('reserved', 'release'),
            updatedAt: now,
          });
        }
      }
      tx.update(read.ref, { 'deal.status': status, 'deal.cancelReason': reason, updatedAt: now });
      systemMessage(tx, read.ref, 'deal_cancelled', now, [other]);
      return { status };
    } catch (error) {
      if (error instanceof TransitionError) fail('failed-precondition', 'invalidTransition');
      if (error instanceof DealActionError) {
        fail(
          'failed-precondition',
          error.reason === 'own_confirmation' ? 'alreadyConfirmed' : 'notParticipant',
        );
      }
      throw error;
    }
  });
}

/**
 * Scheduled (PRD W6): "Did the swap happen?" 2 days after acceptance; confirmation reminders on day 1 and 3 of
 * waiting; after 7 days without the second confirmation the deal is `unconfirmed` (no trade count, no ratings).
 */
export async function runDealReminders(db: Firestore, now = new Date()): Promise<number> {
  const at = Timestamp.fromDate(now);
  let changed = 0;
  const conversations = db.collection('conversations');

  const agreed = await conversations
    .where('deal.status', '==', 'agreed')
    .where('deal.agreedAt', '<=', Timestamp.fromMillis(now.getTime() - 2 * DAY_MS))
    .get();
  for (const doc of agreed.docs) {
    if (doc.get('deal.swapReminderAt')) continue;
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (fresh.get('deal.status') !== 'agreed' || fresh.get('deal.swapReminderAt')) return;
      tx.update(doc.ref, { 'deal.swapReminderAt': at });
      systemMessage(tx, doc.ref, 'deal_swap_reminder', at, fresh.get('participants') as string[]);
      changed++;
    });
  }

  const waiting = await conversations.where('deal.status', '==', 'awaiting_confirmation').get();
  for (const doc of waiting.docs) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const deal = fresh.get('deal') as Deal | undefined;
      if (deal?.status !== 'awaiting_confirmation' || !deal.awaitingSince) return;
      const waited = now.getTime() - deal.awaitingSince.toMillis();
      const sent = deal.confirmRemindersSent ?? 0;
      const participants = fresh.get('participants') as string[];
      const pending = participants.filter((p) => !deal.confirmedBy.includes(p));
      if (waited >= 7 * DAY_MS) {
        tx.update(doc.ref, { 'deal.status': dealMachine.transition(deal.status, 'expire') });
        systemMessage(tx, doc.ref, 'deal_unconfirmed', at, participants);
        changed++;
      } else if ((sent === 0 && waited >= DAY_MS) || (sent === 1 && waited >= 3 * DAY_MS)) {
        tx.update(doc.ref, { 'deal.confirmRemindersSent': sent + 1 });
        systemMessage(tx, doc.ref, 'deal_confirm_reminder', at, pending);
        changed++;
      }
    });
  }
  return changed;
}
