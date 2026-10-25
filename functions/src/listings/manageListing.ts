import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import {
  LISTING_STATUSES,
  listingMachine,
  manageListingInputSchema,
  TransitionError,
  type ListingStatus,
  type ManageListingError,
} from '@weloot/shared';

import { requireTrader } from '../auth/requireTrader';
import { readDeal, writeConfirmation } from '../conversations/deals';

// Owner actions on a listing (PRD W6, #17): pause, resume, remove, and close as Swapped/Sold. Every change goes
// through the listing state machine; closing happens at once, on the owner's word alone.

function fail(
  code: 'invalid-argument' | 'not-found' | 'permission-denied' | 'failed-precondition',
  reason: ManageListingError,
): never {
  throw new HttpsError(code, `Listing change failed: ${reason}`, { reason });
}

export async function handleManageListing(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: { db: Firestore; now?: () => Date },
): Promise<{ status: ListingStatus }> {
  const uid = requireTrader(auth);
  const input = manageListingInputSchema.safeParse(data);
  if (!input.success) fail('invalid-argument', 'invalidInput');
  const { listingId, action, closedWith } = input.data;

  // Closing with a WeLoot user (PRD W6) also records the owner's confirmation on that conversation's deal.
  const withDeal = closedWith?.kind === 'deal' ? closedWith : null;

  const ref = deps.db.collection('listings').doc(listingId);
  return deps.db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const dealRead = withDeal ? await readDeal(tx, deps.db, withDeal.conversationId, uid) : null;
    if (dealRead && withDeal) {
      const { conversation } = dealRead;
      const inDeal =
        conversation.listingId === listingId ||
        (conversation.deal?.itemsOwner ?? []).includes(listingId) ||
        (conversation.deal?.itemsOther ?? []).includes(listingId);
      if (
        !conversation.participants.includes(withDeal.userId) ||
        withDeal.userId === uid ||
        !inDeal
      ) {
        fail('failed-precondition', 'notInDeal');
      }
    }
    if (!snapshot.exists) fail('not-found', 'notFound');
    if (snapshot.get('userId') !== uid) fail('permission-denied', 'notOwner');
    const current = snapshot.get('status') as unknown;
    if (!LISTING_STATUSES.includes(current as ListingStatus))
      fail('failed-precondition', 'invalidTransition');
    if (action === 'closeTraded' && snapshot.get('isForTrade') !== true) {
      fail('failed-precondition', 'notForTrade');
    }
    if (action === 'closeSold' && snapshot.get('isForSale') !== true) {
      fail('failed-precondition', 'notForSale');
    }

    let next: ListingStatus;
    try {
      next = listingMachine.transition(current as ListingStatus, action);
    } catch (error) {
      if (error instanceof TransitionError) fail('failed-precondition', 'invalidTransition');
      throw error;
    }
    tx.update(ref, {
      status: next,
      updatedAt: FieldValue.serverTimestamp(),
      ...(closedWith ? { closedWith, closedAt: FieldValue.serverTimestamp() } : {}),
    });
    if (dealRead) {
      writeConfirmation(tx, dealRead, uid, Timestamp.fromDate(deps.now?.() ?? new Date()), {
        listingId,
        alreadyClosed: listingId,
        ignoreRepeat: true,
      });
    }
    return { status: next };
  });
}
