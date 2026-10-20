import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import {
  getAdditionalUserInfo,
  getAuth,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from '@react-native-firebase/auth';
import { create } from 'zustand';

/** Seconds before "Resend code" becomes available (PRD §9-A). */
export const RESEND_COOLDOWN_SECONDS = 30;

type PendingVerification = {
  phoneE164: string;
  confirmation: ConfirmationResult;
  /** Epoch ms when the last code was sent, for the resend countdown. */
  sentAt: number;
};

type PhoneVerificationStore = {
  pending: PendingVerification | null;
  setPending: (pending: PendingVerification) => void;
  clear: () => void;
};

/** Holds the in-progress verification between the phone screen and the code screen (not persisted). */
export const usePhoneVerification = create<PhoneVerificationStore>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));

/** Sends (or re-sends) the SMS code and remembers the pending verification. */
export async function sendCode(phoneE164: string, now: () => number = Date.now): Promise<void> {
  const confirmation = await signInWithPhoneNumber(getAuth(), phoneE164);
  usePhoneVerification.getState().setPending({ phoneE164, confirmation, sentAt: now() });
}

/**
 * Confirms the 6-digit code. On a user's very first sign-in, logs `user_registered` once (PRD W1).
 * Auth state then changes and the route guard moves the user on.
 */
export async function confirmCode(code: string): Promise<{ isNewUser: boolean }> {
  const pending = usePhoneVerification.getState().pending;
  if (!pending)
    throw Object.assign(new Error('No verification in progress'), {
      code: 'weloot/no-pending-verification',
    });
  const credential = await pending.confirmation.confirm(code);
  const isNewUser = credential ? (getAdditionalUserInfo(credential)?.isNewUser ?? false) : false;
  if (isNewUser) {
    try {
      logEvent(getAnalytics(), 'user_registered', { method: 'phone' });
    } catch {
      // Analytics must never block sign-in.
    }
  }
  usePhoneVerification.getState().clear();
  return { isNewUser };
}
