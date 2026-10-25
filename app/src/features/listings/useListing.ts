import { doc, getFirestore, onSnapshot } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import { listingSchema, type ListingDoc } from '@weloot/shared';

export type Listing = ListingDoc & { id: string };

export type ListingState =
  | { status: 'loading' }
  | { status: 'ready'; listing: Listing }
  | { status: 'missing' }
  | { status: 'error' };

/** Follows `listings/{id}` (Security Rules: active listings for everyone, any status for the owner). */
export function useListing(listingId: string | undefined): ListingState {
  const [state, setState] = useState<{ id: string; value: ListingState } | null>(null);

  useEffect(() => {
    if (!listingId) return;
    return onSnapshot(
      doc(getFirestore(), 'listings', listingId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setState({ id: listingId, value: { status: 'missing' } });
          return;
        }
        const parsed = listingSchema.safeParse(snapshot.data({ serverTimestamps: 'estimate' }));
        setState({
          id: listingId,
          value: parsed.success
            ? { status: 'ready', listing: { ...parsed.data, id: listingId } }
            : { status: 'error' },
        });
      },
      () => setState({ id: listingId, value: { status: 'error' } }),
    );
  }, [listingId]);

  if (!listingId) return { status: 'missing' };
  return state?.id === listingId ? state.value : { status: 'loading' };
}
