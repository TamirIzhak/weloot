import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import {
  getAdditionalUserInfo,
  getAuth,
  getIdToken,
  linkWithCredential,
  PhoneAuthProvider,
  signInWithPhoneNumber,
  verifyPhoneNumber,
} from '@react-native-firebase/auth';
import { create } from 'zustand';

/** Seconds before "Resend code" becomes available (PRD §9-A). */
export const RESEND_COOLDOWN_SECONDS = 30;

/**
 * `signIn`: the phone signs the user in (a guest choosing "Continue with phone").
 * `link`: a signed-in user (Google, Facebook, Discord) verifies their phone once; the number is linked to the
 * same account (PRD W1).
 */
export type PhoneVerificationMode = 'signIn' | 'link';

type PendingVerification = {
  phoneE164: string;
  mode: PhoneVerificationMode;
  /** Confirms the SMS code; resolves with whether this created a new account. */
  confirm: (code: string) => Promise<{ isNewUser: boolean }>;
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

const codeError = (code: string, message: string) => Object.assign(new Error(message), { code });

function track(event: string, params: Record<string, string>) {
  try {
    logEvent(getAnalytics(), event, params);
  } catch {
    // Analytics must never block sign-in.
  }
}

/** Sends (or re-sends) the SMS code and remembers the pending verification. */
export async function sendCode(
  phoneE164: string,
  mode: PhoneVerificationMode = 'signIn',
  now: () => number = Date.now,
): Promise<void> {
  const auth = getAuth();
  let confirm: PendingVerification['confirm'];
  if (mode === 'signIn') {
    const confirmation = await signInWithPhoneNumber(auth, phoneE164);
    confirm = async (code) => {
      const credential = await confirmation.confirm(code);
      return {
        isNewUser: credential ? (getAdditionalUserInfo(credential)?.isNewUser ?? false) : false,
      };
    };
  } else {
    // Resolves once the SMS is on its way (or Android verified the number on its own).
    const snapshot = await verifyPhoneNumber(auth, phoneE164);
    confirm = async (code) => {
      const user = auth.currentUser;
      if (!user)
        throw codeError('weloot/no-pending-verification', 'Signed out during verification');
      await linkWithCredential(user, PhoneAuthProvider.credential(snapshot.verificationId, code));
      // A fresh ID token carries the phone_number claim that Security Rules and functions check; refreshing
      // it also tells AuthProvider the phone is verified.
      await getIdToken(user, true);
      return { isNewUser: false };
    };
  }
  usePhoneVerification.getState().setPending({ phoneE164, mode, confirm, sentAt: now() });
}

/**
 * Confirms the 6-digit code. Logs `user_registered` for a brand-new phone account and `phone_verified` once per
 * account (PRD W1, §11). Auth state then changes and the sheet moves on.
 */
export async function confirmCode(code: string): Promise<{ isNewUser: boolean }> {
  const pending = usePhoneVerification.getState().pending;
  if (!pending) throw codeError('weloot/no-pending-verification', 'No verification in progress');
  const result = await pending.confirm(code);
  if (result.isNewUser) track('user_registered', { method: 'phone' });
  if (result.isNewUser || pending.mode === 'link') {
    track('phone_verified', { mode: pending.mode });
  }
  usePhoneVerification.getState().clear();
  return result;
}
