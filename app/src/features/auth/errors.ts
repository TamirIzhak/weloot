/** i18n keys for sign-in errors. Never show raw Firebase messages (PRD §3.6). */
export type AuthErrorKey =
  | 'auth.errors.invalidPhone'
  | 'auth.errors.invalidCode'
  | 'auth.errors.codeExpired'
  | 'auth.errors.tooManyRequests'
  | 'auth.errors.network'
  | 'auth.errors.quotaExceeded'
  | 'auth.errors.sessionLost'
  | 'auth.errors.generic';

const BY_CODE: Record<string, AuthErrorKey> = {
  'auth/invalid-phone-number': 'auth.errors.invalidPhone',
  'auth/missing-phone-number': 'auth.errors.invalidPhone',
  'auth/invalid-verification-code': 'auth.errors.invalidCode',
  'auth/missing-verification-code': 'auth.errors.invalidCode',
  'auth/code-expired': 'auth.errors.codeExpired',
  'auth/session-expired': 'auth.errors.codeExpired',
  'auth/too-many-requests': 'auth.errors.tooManyRequests',
  'auth/network-request-failed': 'auth.errors.network',
  'auth/quota-exceeded': 'auth.errors.quotaExceeded',
  'weloot/no-pending-verification': 'auth.errors.sessionLost',
};

/** Maps any thrown value from sign-in to a translatable message key. */
export function authErrorKey(error: unknown): AuthErrorKey {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  return BY_CODE[code] ?? 'auth.errors.generic';
}
