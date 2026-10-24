import type { DiscordSignInError } from '@weloot/shared';

/** i18n keys for sign-in errors. Never show raw Firebase messages (PRD §3.6). */
export type AuthErrorKey =
  | 'auth.errors.invalidPhone'
  | 'auth.errors.invalidCode'
  | 'auth.errors.codeExpired'
  | 'auth.errors.tooManyRequests'
  | 'auth.errors.network'
  | 'auth.errors.quotaExceeded'
  | 'auth.errors.sessionLost'
  | 'auth.errors.accountExists'
  | 'auth.errors.providerFailed'
  | 'auth.errors.providerUnavailable'
  | 'auth.errors.notConfigured'
  | 'auth.errors.playServices'
  | 'auth.errors.phoneInUse'
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
  'auth/account-exists-with-different-credential': 'auth.errors.accountExists',
  'auth/invalid-credential': 'auth.errors.providerFailed',
  'auth/credential-already-in-use': 'auth.errors.phoneInUse',
  'weloot/no-pending-verification': 'auth.errors.sessionLost',
  'weloot/provider-failed': 'auth.errors.providerFailed',
  'weloot/play-services': 'auth.errors.playServices',
};

/** `discordSignIn` reports why it failed in `details.reason`. */
const BY_FUNCTION_REASON: Record<DiscordSignInError, AuthErrorKey> = {
  notConfigured: 'auth.errors.notConfigured',
  invalidInput: 'auth.errors.providerFailed',
  invalidCode: 'auth.errors.providerFailed',
  providerError: 'auth.errors.providerUnavailable',
};

function field(error: unknown, name: string): unknown {
  return typeof error === 'object' && error !== null && name in error
    ? (error as Record<string, unknown>)[name]
    : undefined;
}

/** Maps any thrown value from sign-in to a translatable message key. */
export function authErrorKey(error: unknown): AuthErrorKey {
  const reason = field(field(error, 'details'), 'reason');
  if (typeof reason === 'string' && reason in BY_FUNCTION_REASON)
    return BY_FUNCTION_REASON[reason as DiscordSignInError];
  const code = field(error, 'code');
  return (typeof code === 'string' && BY_CODE[code]) || 'auth.errors.generic';
}
