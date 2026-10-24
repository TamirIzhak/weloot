import { HttpsError } from 'firebase-functions/v2/https';

import { DISCORD_REDIRECT_URI } from '@weloot/shared';

import { handleDiscordSignIn, type DiscordSignInDeps } from './discordSignIn';

jest.mock('firebase-functions', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const INPUT = { code: 'abc', codeVerifier: 'v'.repeat(43), redirectUri: DISCORD_REDIRECT_URI };
const DISCORD_USER = {
  id: '80351110224678912',
  username: 'nelly',
  global_name: 'Nelly',
  email: 'Nelly@Example.com',
  verified: true,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const authError = (code: string) => Object.assign(new Error(code), { code });

function discordReplying(user: unknown = DISCORD_USER) {
  return async (url: string) =>
    url.endsWith('/oauth2/token')
      ? json(200, { access_token: 'token-1', token_type: 'Bearer' })
      : json(200, user);
}

function setup(overrides: Partial<DiscordSignInDeps> = {}) {
  const fetch = jest.fn(discordReplying());
  const auth = {
    getUser: jest.fn(() => Promise.reject(authError('auth/user-not-found'))),
    createUser: jest.fn(() => Promise.resolve({})),
    updateUser: jest.fn(() => Promise.resolve({})),
    createCustomToken: jest.fn(() => Promise.resolve('custom-token')),
  };
  const deps = {
    fetch,
    auth,
    clientId: 'client-id',
    clientSecret: 'client-secret',
    ...overrides,
  } as unknown as DiscordSignInDeps;
  return { deps, fetch, auth };
}

/** The HttpsError code and `details.reason` a call fails with. */
async function failureOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpsError);
  const httpsError = error as HttpsError;
  return { code: httpsError.code, reason: (httpsError.details as { reason?: string }).reason };
}

describe('handleDiscordSignIn', () => {
  it('exchanges the code with PKCE and returns a custom token for discord:<id>', async () => {
    const { deps, fetch, auth } = setup();
    await expect(handleDiscordSignIn(INPUT, deps)).resolves.toEqual({
      token: 'custom-token',
      isNewUser: true,
    });

    const [tokenUrl, tokenInit] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe('https://discord.com/api/v10/oauth2/token');
    expect(Object.fromEntries(new URLSearchParams(String(tokenInit.body)))).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      grant_type: 'authorization_code',
      code: 'abc',
      code_verifier: INPUT.codeVerifier,
      redirect_uri: DISCORD_REDIRECT_URI,
    });
    const [userUrl, userInit] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(userUrl).toBe('https://discord.com/api/v10/users/@me');
    expect(userInit.headers).toEqual({ Authorization: 'Bearer token-1' });

    expect(auth.createUser).toHaveBeenCalledWith({
      uid: 'discord:80351110224678912',
      displayName: 'Nelly',
      email: 'nelly@example.com',
    });
    expect(auth.createCustomToken).toHaveBeenCalledWith('discord:80351110224678912', {
      signInProvider: 'discord',
    });
  });

  it('only refreshes the display name for a returning user', async () => {
    const { deps, auth } = setup();
    auth.getUser.mockResolvedValueOnce({} as never);
    await expect(handleDiscordSignIn(INPUT, deps)).resolves.toEqual({
      token: 'custom-token',
      isNewUser: false,
    });
    expect(auth.updateUser).toHaveBeenCalledWith('discord:80351110224678912', {
      displayName: 'Nelly',
    });
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it('ignores an unverified email and falls back to the username', async () => {
    const { deps, fetch, auth } = setup();
    fetch.mockImplementation(
      discordReplying({ ...DISCORD_USER, global_name: null, verified: false }),
    );
    await handleDiscordSignIn(INPUT, deps);
    expect(auth.createUser).toHaveBeenCalledWith({
      uid: 'discord:80351110224678912',
      displayName: 'nelly',
      email: undefined,
    });
  });

  it('creates the account without the email when another account already has it', async () => {
    const { deps, auth } = setup();
    auth.createUser.mockRejectedValueOnce(authError('auth/email-already-exists'));
    await expect(handleDiscordSignIn(INPUT, deps)).resolves.toEqual({
      token: 'custom-token',
      isNewUser: true,
    });
    expect(auth.createUser).toHaveBeenLastCalledWith({
      uid: 'discord:80351110224678912',
      displayName: 'Nelly',
    });
  });

  it('answers notConfigured until the Discord app is set up', async () => {
    const { deps, fetch } = setup({ clientId: '' });
    await expect(failureOf(handleDiscordSignIn(INPUT, deps))).resolves.toEqual({
      code: 'failed-precondition',
      reason: 'notConfigured',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['no data', undefined],
    ['a missing code', { ...INPUT, code: '' }],
    ['a short verifier', { ...INPUT, codeVerifier: 'short' }],
    ['another redirect', { ...INPUT, redirectUri: 'https://evil.example/cb' }],
  ])('rejects %s before calling Discord', async (_, data) => {
    const { deps, fetch } = setup();
    await expect(failureOf(handleDiscordSignIn(data, deps))).resolves.toEqual({
      code: 'invalid-argument',
      reason: 'invalidInput',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports a rejected or reused code as invalidCode', async () => {
    const { deps, fetch, auth } = setup();
    fetch.mockResolvedValueOnce(json(400, { error: 'invalid_grant' }));
    await expect(failureOf(handleDiscordSignIn(INPUT, deps))).resolves.toEqual({
      code: 'invalid-argument',
      reason: 'invalidCode',
    });
    expect(auth.createCustomToken).not.toHaveBeenCalled();
  });

  it.each([
    ['a Discord outage', () => json(503, {})],
    ['an unexpected token response', () => json(200, { nope: true })],
  ])('reports %s as providerError', async (_, response) => {
    const { deps, fetch } = setup();
    fetch.mockResolvedValueOnce(response());
    await expect(failureOf(handleDiscordSignIn(INPUT, deps))).resolves.toEqual({
      code: 'unavailable',
      reason: 'providerError',
    });
  });

  it('reports a network failure or a malformed profile as providerError', async () => {
    const { deps, fetch } = setup();
    fetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(failureOf(handleDiscordSignIn(INPUT, deps))).resolves.toMatchObject({
      reason: 'providerError',
    });
    fetch.mockImplementation(discordReplying({ id: 'not-a-snowflake', username: 'x' }));
    await expect(failureOf(handleDiscordSignIn(INPUT, deps))).resolves.toMatchObject({
      reason: 'providerError',
    });
  });

  it('rethrows unexpected Auth errors instead of hiding them', async () => {
    const { deps, auth } = setup();
    auth.getUser.mockRejectedValueOnce(authError('auth/internal-error'));
    await expect(handleDiscordSignIn(INPUT, deps)).rejects.toMatchObject({
      code: 'auth/internal-error',
    });
  });
});
