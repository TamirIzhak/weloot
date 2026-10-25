import { getApp } from '@react-native-firebase/app';
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
} from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { useEffect, useState } from 'react';

import {
  FIREBASE_REGION,
  listingSchema,
  matchSchema,
  type MatchDoc,
  type WantedNearYouInput,
  type WantedNearYouResult,
} from '@weloot/shared';

import type { Listing } from '@/features/listings/useListing';

export type Match = MatchDoc & { otherUserId: string };
export type Loadable<T> =
  { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' };

/** Matches computed for this user (#21), best first. */
export const MATCHES_SHOWN = 50;

/** `matches/{uid}/items`: who has games I want (and whether it's mutual), best first. */
export function useMatches(uid: string | undefined): Loadable<Match[]> {
  const [state, setState] = useState<{ uid: string; value: Loadable<Match[]> } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(
        collection(getFirestore(), 'matches', uid, 'items'),
        orderBy('score', 'desc'),
        limit(MATCHES_SHOWN),
      ),
      (snapshot) => {
        const matches = snapshot.docs.flatMap((d) => {
          const parsed = matchSchema.safeParse(d.data({ serverTimestamps: 'estimate' }));
          return parsed.success ? [{ ...parsed.data, otherUserId: d.id }] : [];
        });
        setState({ uid, value: { status: 'ready', value: matches } });
      },
      () => setState({ uid, value: { status: 'error' } }),
    );
  }, [uid]);

  if (!uid) return { status: 'ready', value: [] };
  return state?.uid === uid ? state.value : { status: 'loading' };
}

/**
 * Listings by ID, in the given order, active only: one a match points to may have been paused a moment ago (it
 * can't be read then, or isn't active), and is just left out.
 */
export function useListingsByIds(ids: readonly string[]): Loadable<Listing[]> {
  const key = ids.join(',');
  const [state, setState] = useState<{ key: string; value: Loadable<Listing[]> } | null>(null);

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    void Promise.all(
      key.split(',').map(async (id) => {
        try {
          const snapshot = await getDoc(doc(getFirestore(), 'listings', id));
          const parsed = listingSchema.safeParse(snapshot.data());
          return parsed.success && parsed.data.status === 'active' ? { ...parsed.data, id } : null;
        } catch {
          return null;
        }
      }),
    ).then((listings) => {
      if (!cancelled) {
        setState({
          key,
          value: { status: 'ready', value: listings.filter((l): l is Listing => l !== null) },
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (key === '') return { status: 'ready', value: [] };
  return state?.key === key ? state.value : { status: 'loading' };
}

/** "Wanted near you" counts from the server (want lists are private). */
export function useWantedNearYou(
  uid: string | undefined,
  area: WantedNearYouInput | null,
): Loadable<WantedNearYouResult['games']> {
  const key = uid && area ? JSON.stringify({ uid, ...area }) : '';
  const [state, setState] = useState<{
    key: string;
    value: Loadable<WantedNearYouResult['games']>;
  } | null>(null);

  useEffect(() => {
    if (key === '') return;
    const { lat, lng, radiusKm } = JSON.parse(key) as WantedNearYouInput;
    const input: WantedNearYouInput = { lat, lng, radiusKm };
    let cancelled = false;
    httpsCallable<WantedNearYouInput, WantedNearYouResult>(
      getFunctions(getApp(), FIREBASE_REGION),
      'wantedNearYou',
    )(input).then(
      ({ data }) => {
        if (!cancelled) setState({ key, value: { status: 'ready', value: data.games } });
      },
      () => {
        if (!cancelled) setState({ key, value: { status: 'error' } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (key === '') return { status: 'ready', value: [] };
  return state?.key === key ? state.value : { status: 'loading' };
}
