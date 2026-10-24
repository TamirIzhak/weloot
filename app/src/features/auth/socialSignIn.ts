import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { getApp } from '@react-native-firebase/app';
import {
  FacebookAuthProvider,
  getAdditionalUserInfo,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithCustomToken,
} from '@react-native-firebase/auth';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { AuthRequest, ResponseType } from 'expo-auth-session';

import {
  DISCORD_REDIRECT_URI,
  FIREBASE_REGION,
  type DiscordSignInInput,
  type DiscordSignInResult,
} from '@weloot/shared';

// Sign in with Google, Facebook or Discord (PRD W1). Each provider's public ID comes from app/.env; a method whose
// ID is missing isn't offered (in development it shows as "not set up yet", see docs/OWNER-TODO.md).

export type SocialMethod = 'google' | 'facebook' | 'discord';
export const SOCIAL_METHODS: readonly SocialMethod[] = ['google', 'facebook', 'discord'];

const PROVIDER_IDS: Record<SocialMethod, string> = {
  google: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  facebook: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID ?? '',
  discord: process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID ?? '',
};

export function isMethodConfigured(method: SocialMethod): boolean {
  return PROVIDER_IDS[method] !== '';
}

/** The user backed out of the provider's screen: not an error, nothing to show. */
export class SignInCancelled extends Error {
  constructor() {
    super('Sign-in cancelled');
    this.name = 'SignInCancelled';
  }
}

const failure = (code: string) => Object.assign(new Error(code), { code });

async function googleCredential() {
  GoogleSignin.configure({ webClientId: PROVIDER_IDS.google });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') throw new SignInCancelled();
    if (!response.data.idToken) throw failure('weloot/provider-failed');
    return GoogleAuthProvider.credential(response.data.idToken);
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS)
        throw new SignInCancelled();
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
        throw failure('weloot/play-services');
    }
    throw error;
  }
}

/** Runs a browser OAuth request and returns its parameters; backing out or a provider error throws. */
async function authorize(request: AuthRequest, authorizationEndpoint: string) {
  const result = await request.promptAsync({ authorizationEndpoint });
  if (result.type === 'success') return result.params;
  if (result.type === 'error') throw failure('weloot/provider-failed');
  throw new SignInCancelled();
}

async function facebookCredential() {
  const appId = PROVIDER_IDS.facebook;
  const request = new AuthRequest({
    clientId: appId,
    scopes: ['public_profile', 'email'],
    // Facebook only redirects native apps to fb<app id>://authorize (the scheme is added in app.config.ts).
    redirectUri: `fb${appId}://authorize`,
    responseType: ResponseType.Token,
    usePKCE: false,
  });
  const params = await authorize(request, 'https://www.facebook.com/v21.0/dialog/oauth');
  if (!params.access_token) throw failure('weloot/provider-failed');
  return FacebookAuthProvider.credential(params.access_token);
}

/** Discord isn't a Firebase provider: the `discordSignIn` function turns the OAuth code into a custom token. */
async function discordToken(): Promise<DiscordSignInResult> {
  const request = new AuthRequest({
    clientId: PROVIDER_IDS.discord,
    scopes: ['identify', 'email'],
    redirectUri: DISCORD_REDIRECT_URI,
    responseType: ResponseType.Code,
    usePKCE: true,
  });
  const params = await authorize(request, 'https://discord.com/oauth2/authorize');
  if (!params.code || !request.codeVerifier) throw failure('weloot/provider-failed');
  const call = httpsCallable<DiscordSignInInput, DiscordSignInResult>(
    getFunctions(getApp(), FIREBASE_REGION),
    'discordSignIn',
  );
  const { data } = await call({
    code: params.code,
    codeVerifier: request.codeVerifier,
    redirectUri: DISCORD_REDIRECT_URI,
  });
  return data;
}

/**
 * Signs in with a social provider. Auth state then changes and the sign-in sheet moves on (profile setup on a
 * first sign-in). Throws `SignInCancelled` when the user backs out.
 */
export async function signInWithMethod(method: SocialMethod): Promise<{ isNewUser: boolean }> {
  const auth = getAuth();
  let isNewUser: boolean;
  if (method === 'discord') {
    const result = await discordToken();
    await signInWithCustomToken(auth, result.token);
    isNewUser = result.isNewUser;
  } else {
    const credential = method === 'google' ? await googleCredential() : await facebookCredential();
    const userCredential = await signInWithCredential(auth, credential);
    isNewUser = getAdditionalUserInfo(userCredential)?.isNewUser ?? false;
  }
  if (isNewUser) {
    try {
      logEvent(getAnalytics(), 'user_registered', { method });
    } catch {
      // Analytics must never block sign-in.
    }
  }
  return { isNewUser };
}
