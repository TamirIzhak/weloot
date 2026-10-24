import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { create } from 'zustand';

import { canTrade, isProfileComplete, useAuth, type AuthState } from './AuthProvider';

/** Why the sign-in sheet opened: picks the sheet's message (`auth.reasons.<reason>`) and is logged. */
export const SIGN_IN_REASONS = [
  'offer',
  'question',
  'message',
  'wantlist',
  'alert',
  'add',
  'inbox',
  'profile',
] as const;
export type SignInReason = (typeof SIGN_IN_REASONS)[number];

/** Trading actions: they also need a verified phone, asked once per account (PRD W1). */
export const PHONE_REASONS: ReadonlySet<SignInReason> = new Set<SignInReason>([
  'offer',
  'question',
  'message',
  'add',
]);

/** Whether the user can go ahead with an action opened for `reason` without the sheet. */
export function isReadyFor(auth: AuthState, reason: SignInReason): boolean {
  return PHONE_REASONS.has(reason) ? canTrade(auth) : isProfileComplete(auth);
}

type AuthGateStore = {
  reason: SignInReason | null;
  /** The action to continue once the user is signed in, has a profile and (for trading) a verified phone. */
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
 * Guest-first sign-in (PRD W1): runs `action` right away when the user is ready for it (`isReadyFor`). Anyone
 * else gets the sign-in sheet with a reason: guests sign in, then set up their profile if it's their first time;
 * signed-in users who left setup unfinished go straight to it; trading actions also verify the phone once.
 * `action` runs once that's done.
 */
export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();
  return useCallback(
    (reason: SignInReason, action: () => void) => {
      if (isReadyFor(auth, reason)) {
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
    [auth, router],
  );
}
