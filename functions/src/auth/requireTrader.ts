import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

/** Stable `details.reason` values for callables that need a trader (the app maps them to the sign-in sheet). */
export type TraderRequirement = 'signInRequired' | 'phoneRequired';

/**
 * Trading callables (publishing a listing, offers, messages) need a signed-in user whose ID token carries a
 * verified phone (`phone_number` claim: signed in with the phone, or linked once; PRD W1). Returns the uid.
 */
export function requireTrader(auth: CallableRequest['auth']): string {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in first', {
      reason: 'signInRequired' satisfies TraderRequirement,
    });
  }
  const phone: unknown = auth.token.phone_number;
  if (typeof phone !== 'string' || phone === '') {
    throw new HttpsError('permission-denied', 'Verify your phone first', {
      reason: 'phoneRequired' satisfies TraderRequirement,
    });
  }
  return auth.uid;
}
