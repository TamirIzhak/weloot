import { DISCORD_REDIRECT_URI } from '@weloot/shared';

import type * as SocialSignIn from '@/features/auth/socialSignIn';

const mockSignInWithCredential = jest.fn();
const mockSignInWithCustomToken = jest.fn();
const mockAdditionalInfo = jest.fn();
const mockLogEvent = jest.fn();
const mockCallable = jest.fn();
const mockGoogleSignIn = jest.fn();
const mockPrompt = jest.fn();
const mockAuthRequests: { config: Record<string, unknown> }[] = [];

jest.mock('@react-native-firebase/app', () => ({ getApp: jest.fn(() => ({})) }));
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signInWithCredential: (...args: unknown[]) => mockSignInWithCredential(...args),
  signInWithCustomToken: (...args: unknown[]) => mockSignInWithCustomToken(...args),
  getAdditionalUserInfo: (...args: unknown[]) => mockAdditionalInfo(...args),
  GoogleAuthProvider: { credential: (idToken: string) => ({ provider: 'google', idToken }) },
  FacebookAuthProvider: { credential: (token: string) => ({ provider: 'facebook', token }) },
}));
jest.mock('@react-native-firebase/functions', () => ({
  getFunctions: jest.fn((_app: unknown, region: string) => ({ region })),
  httpsCallable: jest.fn(
    (functions: unknown, name: string) => (data: unknown) => mockCallable(functions, name, data),
  ),
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: (...args: unknown[]) => mockGoogleSignIn(...args),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
  isErrorWithCode: (e: unknown) => typeof e === 'object' && e !== null && 'code' in e,
}));
jest.mock('expo-auth-session', () => ({
  ResponseType: { Token: 'token', Code: 'code' },
  AuthRequest: class {
    codeVerifier = 'v'.repeat(64);
    config: { [key: string]: unknown };
    constructor(config: { [key: string]: unknown }) {
      this.config = config;
      mockAuthRequests.push(this);
    }
    promptAsync(discovery: unknown) {
      return mockPrompt(this.config, discovery);
    }
  },
}));

const IDS = {
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'google-web-client',
  EXPO_PUBLIC_FACEBOOK_APP_ID: '1234',
  EXPO_PUBLIC_DISCORD_CLIENT_ID: 'discord-client',
};

/** Loads the module with the given public IDs in the environment (they're read at import time). */
function load(env: Partial<typeof IDS> = IDS): typeof SocialSignIn {
  for (const key of Object.keys(IDS)) delete process.env[key];
  Object.assign(process.env, env);
  let mod: typeof SocialSignIn | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual<typeof SocialSignIn>('@/features/auth/socialSignIn');
  });
  if (!mod) throw new Error('module not loaded');
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthRequests.length = 0;
  mockSignInWithCredential.mockResolvedValue({});
  mockSignInWithCustomToken.mockResolvedValue({});
  mockAdditionalInfo.mockReturnValue({ isNewUser: false });
  mockGoogleSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'google-id-token' } });
});

describe('isMethodConfigured', () => {
  it('needs the public ID of each provider', () => {
    const configured = load();
    expect(configured.isMethodConfigured('google')).toBe(true);
    const none = load({});
    expect(none.isMethodConfigured('google')).toBe(false);
    expect(none.isMethodConfigured('facebook')).toBe(false);
    expect(none.isMethodConfigured('discord')).toBe(false);
  });
});

describe('Google', () => {
  it('signs in with the Google ID token and logs a new registration', async () => {
    const { signInWithMethod } = load();
    mockAdditionalInfo.mockReturnValue({ isNewUser: true });
    await expect(signInWithMethod('google')).resolves.toEqual({ isNewUser: true });
    expect(mockSignInWithCredential).toHaveBeenCalledWith(
      {},
      { provider: 'google', idToken: 'google-id-token' },
    );
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'user_registered', { method: 'google' });
  });

  it("doesn't log a returning user", async () => {
    const { signInWithMethod } = load();
    await signInWithMethod('google');
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['the cancelled response', () => mockGoogleSignIn.mockResolvedValue({ type: 'cancelled' })],
    [
      'the cancelled error code',
      () => mockGoogleSignIn.mockRejectedValue({ code: 'SIGN_IN_CANCELLED' }),
    ],
  ])('treats %s as cancelled', async (_, arrange) => {
    const { signInWithMethod, SignInCancelled } = load();
    arrange();
    await expect(signInWithMethod('google')).rejects.toBeInstanceOf(SignInCancelled);
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });

  it('explains missing Play services', async () => {
    const { signInWithMethod } = load();
    mockGoogleSignIn.mockRejectedValue({ code: 'PLAY_SERVICES_NOT_AVAILABLE' });
    await expect(signInWithMethod('google')).rejects.toMatchObject({
      code: 'weloot/play-services',
    });
  });
});

describe('Facebook', () => {
  it('runs browser OAuth to fb<app id>://authorize and signs in with the access token', async () => {
    const { signInWithMethod } = load();
    mockPrompt.mockResolvedValue({ type: 'success', params: { access_token: 'fb-token' } });
    await signInWithMethod('facebook');
    expect(mockAuthRequests[0]?.config).toMatchObject({
      clientId: '1234',
      redirectUri: 'fb1234://authorize',
      responseType: 'token',
      scopes: ['public_profile', 'email'],
    });
    expect(mockSignInWithCredential).toHaveBeenCalledWith(
      {},
      { provider: 'facebook', token: 'fb-token' },
    );
  });

  it('treats closing the browser as cancelled, and a provider error as a failure', async () => {
    const { signInWithMethod, SignInCancelled } = load();
    mockPrompt.mockResolvedValueOnce({ type: 'dismiss' });
    await expect(signInWithMethod('facebook')).rejects.toBeInstanceOf(SignInCancelled);
    mockPrompt.mockResolvedValueOnce({ type: 'error', params: {} });
    await expect(signInWithMethod('facebook')).rejects.toMatchObject({
      code: 'weloot/provider-failed',
    });
  });
});

describe('Discord', () => {
  it('sends the code and PKCE verifier to discordSignIn and signs in with the custom token', async () => {
    const { signInWithMethod } = load();
    mockPrompt.mockResolvedValue({ type: 'success', params: { code: 'discord-code' } });
    mockCallable.mockResolvedValue({ data: { token: 'custom-token', isNewUser: true } });

    await expect(signInWithMethod('discord')).resolves.toEqual({ isNewUser: true });

    expect(mockAuthRequests[0]?.config).toMatchObject({
      clientId: 'discord-client',
      redirectUri: DISCORD_REDIRECT_URI,
      responseType: 'code',
      usePKCE: true,
    });
    expect(mockCallable).toHaveBeenCalledWith({ region: 'me-west1' }, 'discordSignIn', {
      code: 'discord-code',
      codeVerifier: 'v'.repeat(64),
      redirectUri: DISCORD_REDIRECT_URI,
    });
    expect(mockSignInWithCustomToken).toHaveBeenCalledWith({}, 'custom-token');
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'user_registered', { method: 'discord' });
  });

  it('passes on the function error so the sheet can explain it', async () => {
    const { signInWithMethod } = load();
    mockPrompt.mockResolvedValue({ type: 'success', params: { code: 'discord-code' } });
    const error = Object.assign(new Error('nope'), {
      code: 'functions/failed-precondition',
      details: { reason: 'notConfigured' },
    });
    mockCallable.mockRejectedValue(error);
    await expect(signInWithMethod('discord')).rejects.toBe(error);
    expect(mockSignInWithCustomToken).not.toHaveBeenCalled();
  });
});
