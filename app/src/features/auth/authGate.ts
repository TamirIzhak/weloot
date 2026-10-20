import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { create } from 'zustand';

import { isProfileComplete, useAuth } from './AuthProvider';

/** Why the sign-in sheet opened: picks the sheet's message (`auth.reasons.<reason>`) and is logged. */
export const SIGN_IN_REASONS = [
  'offer',
  'question',
  'wantlist',
  'alert',
  'add',
  'inbox',
  'profile',
] as const;
export type SignInReason = (typeof SIGN_IN_REASONS)[number];

type AuthGateStore = {
  reason: SignInReason | null;
  /** The action to continue once the user is signed in and has a profile. */
  onSuccess: (() => void) | null;
  open: (reason: SignInReason, onSuccess: () => void) => void;
  /** Clears the gate and returns the pending action, if any. */
  take: () => (() => void) | null;
  cancel: () => void;
};

export const useAuthGate = create<AuthGateStore>((set, get) => ({
  reason: null,
  onSuccess: null,
  open: (reason, onSuccess) => set({ reason, onSuccess }),
  take: () => {
    const action = get().onSuccess;
    set({ reason: null, onSuccess: null });
    return action;
  },
  cancel: () => set({ reason: null, onSuccess: null }),
}));

/**
 * Guest-first sign-in (PRD W1): runs `action` right away for users who are signed in with a finished profile.
 * Anyone else gets the sign-in sheet with a reason: guests sign in, then set up their profile if it's their first
 * time; signed-in users who left setup unfinished go straight to it. `action` runs once that's done.
 */
export function useRequireAuth() {
  const complete = isProfileComplete(useAuth());
  const router = useRouter();
  return useCallback(
    (reason: SignInReason, action: () => void) => {
      if (complete) {
        action();
        return;
      }
      useAuthGate.getState().open(reason, action);
      try {
        logEvent(getAnalytics(), 'sign_in_prompted', { reason });
      } catch {
        // Analytics must never block the flow.
      }
      router.push('/sign-in');
    },
    [complete, router],
  );
}
