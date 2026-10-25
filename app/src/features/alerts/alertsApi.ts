import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import {
  alertSchema,
  newForYouSchema,
  wantKey,
  type Alert,
  type NewForYou,
  type PlatformKey,
} from '@weloot/shared';

// "Notify me" alerts (`alerts/{uid}/items`, owner only) and what they found (`newForYou/{uid}/items`, written by the
// alert function). PRD W8.

export type AlertItem = Alert & { id: string };
export type NewForYouItem = NewForYou & { id: string };
type ListState<T> = { status: 'loading' } | { status: 'ready'; items: T[] } | { status: 'error' };

/** "New for you" shown on Home, newest first. */
export const NEW_FOR_YOU_SHOWN = 20;

function useOwnList<T>(
  uid: string | undefined,
  path: 'alerts' | 'newForYou',
  parse: (data: unknown) => T | null,
  max?: number,
): ListState<T & { id: string }> {
  const [state, setState] = useState<{ uid: string; value: ListState<T & { id: string }> } | null>(
    null,
  );

  useEffect(() => {
    if (!uid) return;
    const ref = collection(getFirestore(), path, uid, 'items');
    return onSnapshot(
      max
        ? query(ref, orderBy('createdAt', 'desc'), limit(max))
        : query(ref, orderBy('createdAt', 'desc')),
      (snapshot) => {
        const items = snapshot.docs.flatMap((d) => {
          const parsed = parse(d.data({ serverTimestamps: 'estimate' }));
          return parsed ? [{ ...parsed, id: d.id }] : [];
        });
        setState({ uid, value: { status: 'ready', items } });
      },
      () => setState({ uid, value: { status: 'error' } }),
    );
  }, [uid, path, parse, max]);

  if (!uid) return { status: 'ready', items: [] };
  return state?.uid === uid ? state.value : { status: 'loading' };
}

const parseAlert = (data: unknown) => {
  const parsed = alertSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
};
const parseNewForYou = (data: unknown) => {
  const parsed = newForYouSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
};

export function useAlerts(uid: string | undefined) {
  return useOwnList(uid, 'alerts', parseAlert);
}

export function useNewForYou(uid: string | undefined) {
  return useOwnList(uid, 'newForYou', parseNewForYou, NEW_FOR_YOU_SHOWN);
}

export type NewAlert = {
  igdbGameId: number;
  platform?: PlatformKey;
  gameTitle: string;
  radiusKm: number;
  /** The browsing location (area level); none = anywhere in Israel. */
  center?: { lat: number; lng: number };
};

/** "Notify me when it's listed" (from an empty search). Same game and console twice is one alert. */
export async function createAlert(uid: string, alert: NewAlert): Promise<void> {
  await setDoc(
    doc(getFirestore(), 'alerts', uid, 'items', wantKey(alert.igdbGameId, alert.platform)),
    {
      igdbGameId: alert.igdbGameId,
      ...(alert.platform ? { platform: alert.platform } : {}),
      gameTitle: alert.gameTitle,
      radiusKm: alert.radiusKm,
      ...(alert.center ? { lat: alert.center.lat, lng: alert.center.lng } : {}),
      source: 'search',
      createdAt: serverTimestamp(),
    },
  );
  track('alert_created', { igdb_game_id: alert.igdbGameId, platform: alert.platform ?? 'any' });
}

export function deleteAlert(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(getFirestore(), 'alerts', uid, 'items', id));
}

/** Marks "New for you" items as seen the first time they're shown (`alert_notified`). */
export function markSeen(uid: string, items: readonly NewForYouItem[]): void {
  for (const item of items) {
    if (item.seenAt) continue;
    updateDoc(doc(getFirestore(), 'newForYou', uid, 'items', item.id), {
      seenAt: serverTimestamp(),
    }).catch(() => undefined);
    track('alert_notified', { igdb_game_id: item.igdbGameId, pushed: item.pushed });
  }
}

/** Opening a "New for you" listing (`alert_opened`). */
export function markOpened(uid: string, item: NewForYouItem): void {
  if (!item.openedAt) {
    updateDoc(doc(getFirestore(), 'newForYou', uid, 'items', item.id), {
      openedAt: serverTimestamp(),
    }).catch(() => undefined);
  }
  track('alert_opened', { igdb_game_id: item.igdbGameId });
}

function track(event: string, params: Record<string, string | number | boolean>) {
  try {
    logEvent(getAnalytics(), event, params);
  } catch {
    // Analytics never blocks the flow.
  }
}
