import {
  deleteField,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import { userSettingsSchema, type LanguageCode, type UserSettings } from '@weloot/shared';

// `users/{uid}/private/settings` (owner-only): what Settings shows and changes (PRD §9-D). Security Rules allow
// the owner to change only the language, the search radius and the promotions opt-in.

export type SettingsState =
  { status: 'loading' } | { status: 'ready'; settings: UserSettings } | { status: 'error' };

const settingsDoc = (uid: string) => doc(getFirestore(), 'users', uid, 'private', 'settings');

export function useUserSettings(uid: string | undefined): SettingsState {
  const [state, setState] = useState<{ uid: string; value: SettingsState } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      settingsDoc(uid),
      (snapshot) => {
        const parsed = userSettingsSchema.safeParse(
          snapshot.data({ serverTimestamps: 'estimate' }),
        );
        setState({
          uid,
          value: parsed.success ? { status: 'ready', settings: parsed.data } : { status: 'error' },
        });
      },
      () => setState({ uid, value: { status: 'error' } }),
    );
  }, [uid]);

  if (!uid) return { status: 'loading' };
  return state?.uid === uid ? state.value : { status: 'loading' };
}

export type SettingsChange =
  { preferredLanguage: LanguageCode } | { searchRadiusKm: number } | { marketingOptIn: boolean };

/** Applies one change. Opting in to promotions records the server time; opting out removes it. */
export async function updateSettings(uid: string, change: SettingsChange): Promise<void> {
  const extra =
    'marketingOptIn' in change
      ? { marketingOptInAt: change.marketingOptIn ? serverTimestamp() : deleteField() }
      : {};
  await updateDoc(settingsDoc(uid), { ...change, ...extra, updatedAt: serverTimestamp() });
}
