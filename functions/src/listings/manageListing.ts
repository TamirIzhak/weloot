import { FieldValue, type Firestore } from 'firebase-admin/firestore';
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
  deps: { db: Firestore },
): Promise<{ status: ListingStatus }> {
  const uid = requireTrader(auth);
  const input = manageListingInputSchema.safeParse(data);
  if (!input.success) fail('invalid-argument', 'invalidInput');
  const { listingId, action, closedWith } = input.data;

  // TODO(#47): closing with a WeLoot user records their deal confirmation; until deals exist only "Someone outside
  // WeLoot" is accepted.
  if (closedWith?.kind === 'deal') fail('failed-precondition', 'dealNotAvailable');

  const ref = deps.db.collection('listings').doc(listingId);
  return deps.db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
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
    return { status: next };
  });
}
