import { z } from 'zod';

// Minimal Discord OAuth2 client: exchange an authorization code (PKCE) and read the user's profile.
// https://discord.com/developers/docs/topics/oauth2

const API = 'https://discord.com/api/v10';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
});

const userSchema = z.object({
  id: z.string().regex(/^\d{5,25}$/),
  username: z.string(),
  global_name: z.string().nullish(),
  email: z.string().nullish(),
  verified: z.boolean().optional(),
});
export type DiscordUser = z.infer<typeof userSchema>;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** `invalidCode`: Discord rejected the code (expired, reused, wrong verifier). `providerError`: anything else. */
export class DiscordApiError extends Error {
  constructor(
    readonly reason: 'invalidCode' | 'providerError',
    readonly status?: number,
  ) {
    super(`Discord API error: ${reason}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'DiscordApiError';
  }
}

export async function exchangeCode(
  fetchFn: FetchLike,
  params: {
    clientId: string;
    clientSecret: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  },
): Promise<string> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
  const res = await fetchFn(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  // 400 = invalid_grant / invalid_request: the user should simply try again.
  if (res.status === 400 || res.status === 401)
    throw new DiscordApiError('invalidCode', res.status);
  if (!res.ok) throw new DiscordApiError('providerError', res.status);
  const parsed = tokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new DiscordApiError('providerError', res.status);
  return parsed.data.access_token;
}

export async function fetchDiscordUser(
  fetchFn: FetchLike,
  accessToken: string,
): Promise<DiscordUser> {
  const res = await fetchFn(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new DiscordApiError('providerError', res.status);
  const parsed = userSchema.safeParse(await res.json());
  if (!parsed.success) throw new DiscordApiError('providerError', res.status);
  return parsed.data;
}
