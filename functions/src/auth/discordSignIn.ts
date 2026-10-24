import type { Auth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  discordSignInInputSchema,
  type DiscordSignInError,
  type DiscordSignInResult,
} from '@weloot/shared';

import {
  DiscordApiError,
  exchangeCode,
  fetchDiscordUser,
  type DiscordUser,
  type FetchLike,
} from './discordApi';

// Sign in with Discord (PRD W1). Discord isn't a Firebase Auth provider, so after the app's OAuth redirect this
// function exchanges the code, reads the Discord profile, creates or updates the Firebase user `discord:<id>`
// and returns a custom token the app signs in with.

export type DiscordSignInDeps = {
  fetch: FetchLike;
  auth: Pick<Auth, 'getUser' | 'createUser' | 'updateUser' | 'createCustomToken'>;
  clientId: string;
  clientSecret: string;
};

function fail(
  code: 'failed-precondition' | 'invalid-argument' | 'unavailable',
  reason: DiscordSignInError,
): never {
  throw new HttpsError(code, `Discord sign-in failed: ${reason}`, { reason });
}

export async function handleDiscordSignIn(
  data: unknown,
  deps: DiscordSignInDeps,
): Promise<DiscordSignInResult> {
  if (!deps.clientId || !deps.clientSecret) fail('failed-precondition', 'notConfigured');
  const input = discordSignInInputSchema.safeParse(data);
  if (!input.success) fail('invalid-argument', 'invalidInput');

  let discordUser: DiscordUser;
  try {
    const accessToken = await exchangeCode(deps.fetch, {
      clientId: deps.clientId,
      clientSecret: deps.clientSecret,
      ...input.data,
    });
    discordUser = await fetchDiscordUser(deps.fetch, accessToken);
  } catch (error) {
    if (error instanceof DiscordApiError) {
      logger.warn('discordSignIn: Discord API error', {
        reason: error.reason,
        status: error.status,
      });
      if (error.reason === 'invalidCode') fail('invalid-argument', 'invalidCode');
    } else {
      logger.error('discordSignIn: unexpected error reaching Discord', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    fail('unavailable', 'providerError');
  }

  const uid = `discord:${discordUser.id}`;
  const isNewUser = await upsertUser(deps.auth, uid, discordUser);
  const token = await deps.auth.createCustomToken(uid, { signInProvider: 'discord' });
  return { token, isNewUser };
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

/**
 * Creates the Firebase user on the first sign-in (returns true); later sign-ins only refresh the display name.
 */
async function upsertUser(
  auth: DiscordSignInDeps['auth'],
  uid: string,
  user: DiscordUser,
): Promise<boolean> {
  const displayName = (user.global_name ?? user.username).slice(0, 100);
  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, { displayName });
    return false;
  } catch (error) {
    if (!hasCode(error, 'auth/user-not-found')) throw error;
  }
  // Only a verified Discord email is trusted for the account (it prefills profile setup).
  const email = user.verified && user.email ? user.email.toLowerCase() : undefined;
  try {
    await auth.createUser({ uid, displayName, email });
  } catch (error) {
    // The email already belongs to another WeLoot account: create this one without it.
    if (email && hasCode(error, 'auth/email-already-exists')) {
      await auth.createUser({ uid, displayName });
      return true;
    }
    throw error;
  }
  return true;
}
