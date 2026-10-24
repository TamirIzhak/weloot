import { z } from 'zod';

// Sign-in methods (PRD W1) and the contract of the `discordSignIn` callable function.

export const SIGN_IN_METHODS = ['google', 'facebook', 'discord', 'phone'] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

/**
 * Where Discord sends the user back after they approve WeLoot. Registered in the Discord application
 * (docs/OWNER-TODO.md) and checked by the function, so a code issued for another redirect is rejected.
 */
export const DISCORD_REDIRECT_URI = 'weloot://auth/discord';

/** What the app sends after Discord's OAuth redirect (authorization code flow with PKCE). */
export const discordSignInInputSchema = z.object({
  code: z.string().min(1).max(512),
  // RFC 7636: 43–128 characters.
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.literal(DISCORD_REDIRECT_URI),
});
export type DiscordSignInInput = z.infer<typeof discordSignInInputSchema>;

/** `isNewUser`: this sign-in created the account (for the `user_registered` event). */
export type DiscordSignInResult = { token: string; isNewUser: boolean };

/** Stable `details.reason` values of `discordSignIn` errors; the app maps them to messages. */
export const DISCORD_SIGN_IN_ERRORS = [
  'notConfigured',
  'invalidInput',
  'invalidCode',
  'providerError',
] as const;
export type DiscordSignInError = (typeof DISCORD_SIGN_IN_ERRORS)[number];
