import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { getApp } from '@react-native-firebase/app';
import {
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  where,
} from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { useEffect, useState } from 'react';

import {
  FIREBASE_REGION,
  listingSchema,
  type ListingStatus,
  type ManageListingInput,
} from '@weloot/shared';

import type { Listing } from './useListing';

export type MyListingsState =
  { status: 'loading' } | { status: 'ready'; listings: Listing[] } | { status: 'error' };

/** The user's own listings in every status, newest first (Profile → My listings, #17). */
export function useMyListings(uid: string | undefined): MyListingsState {
  const [state, setState] = useState<{ uid: string; value: MyListingsState } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(
        collection(getFirestore(), 'listings'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
      ),
      (snapshot) => {
        const listings = snapshot.docs.flatMap((d) => {
          const parsed = listingSchema.safeParse(d.data({ serverTimestamps: 'estimate' }));
          return parsed.success ? [{ ...parsed.data, id: d.id }] : [];
        });
        setState({ uid, value: { status: 'ready', listings } });
      },
      () => setState({ uid, value: { status: 'error' } }),
    );
  }, [uid]);

  if (!uid) return { status: 'ready', listings: [] };
  return state?.uid === uid ? state.value : { status: 'loading' };
}

/** Pause, resume, remove or close a listing through the `manageListing` function (PRD W6). */
export async function manageListing(input: ManageListingInput): Promise<ListingStatus> {
  const call = httpsCallable<ManageListingInput, { status: ListingStatus }>(
    getFunctions(getApp(), FIREBASE_REGION),
    'manageListing',
  );
  const { data } = await call(input);
  if (input.action === 'closeTraded' || input.action === 'closeSold') {
    try {
      const analytics = getAnalytics();
      logEvent(analytics, 'listing_closed', { result: data.status });
      if (input.closedWith?.kind === 'outside') {
        logEvent(analytics, 'listing_closed_outside', { result: data.status });
      }
    } catch {
      // Analytics must never block the change.
    }
  }
  return data.status;
}
