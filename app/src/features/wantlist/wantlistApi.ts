import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import { wantKey, wantlistItemSchema, type PlatformKey, type WantlistItem } from '@weloot/shared';

// `wantlist/{uid}/items/{wantKey}` (PRD W3): owner only. Security Rules check each item is a real catalog game, on
// one of its consoles (or any), with its catalog title.

export type Want = WantlistItem & { id: string };

export type WantlistState =
  { status: 'loading' } | { status: 'ready'; items: Want[] } | { status: 'error' };

const items = (uid: string) => collection(getFirestore(), 'wantlist', uid, 'items');

/** The user's want list, newest first. */
export function useWantlist(uid: string | undefined): WantlistState {
  const [state, setState] = useState<{ uid: string; value: WantlistState } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(items(uid), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const list = snapshot.docs.flatMap((d) => {
          const parsed = wantlistItemSchema.safeParse(d.data({ serverTimestamps: 'estimate' }));
          return parsed.success ? [{ ...parsed.data, id: d.id }] : [];
        });
        setState({ uid, value: { status: 'ready', items: list } });
      },
      () => setState({ uid, value: { status: 'error' } }),
    );
  }, [uid]);

  if (!uid) return { status: 'ready', items: [] };
  return state?.uid === uid ? state.value : { status: 'loading' };
}

export type NewWant = { igdbGameId: number; platform?: PlatformKey; gameTitle: string };

export async function addWant(uid: string, want: NewWant): Promise<void> {
  await setDoc(doc(items(uid), wantKey(want.igdbGameId, want.platform)), {
    igdbGameId: want.igdbGameId,
    ...(want.platform ? { platform: want.platform } : {}),
    gameTitle: want.gameTitle,
    createdAt: serverTimestamp(),
  });
  try {
    logEvent(getAnalytics(), 'wantlist_added', {
      igdb_game_id: want.igdbGameId,
      platform: want.platform ?? 'any',
    });
  } catch {
    // Analytics never blocks the change.
  }
}

export function removeWant(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(items(uid), id));
}
