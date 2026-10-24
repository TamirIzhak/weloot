import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

import type { FetchLike } from '../auth/discordApi';

// IGDB (Twitch) API client (PRD §5.1): client-credentials token cached in `system/igdbToken` (server-only), and a
// request queue that keeps under IGDB's 4 requests/second, retries rate-limited requests and refreshes the token
// once on 401.

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API_URL = 'https://api.igdb.com/v4';
/** Refresh this long before Twitch's expiry (tokens last ~60 days). */
const REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;
/** 4 requests/second → at least 250 ms between request starts; a little more for clock jitter. */
export const MIN_REQUEST_INTERVAL_MS = 260;
const MAX_RETRIES = 3;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

const cachedTokenSchema = z.object({ accessToken: z.string().min(1), expiresAt: z.number() });

export class IgdbError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'IgdbError';
  }
}

export type IgdbDeps = {
  fetch: FetchLike;
  db: Firestore;
  clientId: string;
  clientSecret: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Returns a cached app access token, fetching a new one when missing, near expiry, or `force`d. */
export async function getIgdbToken(deps: IgdbDeps, force = false): Promise<string> {
  const now = (deps.now ?? Date.now)();
  const ref = deps.db.collection('system').doc('igdbToken');
  if (!force) {
    const cached = cachedTokenSchema.safeParse((await ref.get()).data());
    if (cached.success && cached.data.expiresAt - REFRESH_MARGIN_MS > now) {
      return cached.data.accessToken;
    }
  }
  const params = new URLSearchParams({
    client_id: deps.clientId,
    client_secret: deps.clientSecret,
    grant_type: 'client_credentials',
  });
  const res = await deps.fetch(`${TOKEN_URL}?${params.toString()}`, { method: 'POST' });
  if (!res.ok) throw new IgdbError('Twitch token request failed', res.status);
  const parsed = tokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new IgdbError('Unexpected Twitch token response', res.status);
  const token = parsed.data.access_token;
  await ref.set({ accessToken: token, expiresAt: now + parsed.data.expires_in * 1000 });
  return token;
}

export type IgdbClient = {
  /** POSTs an Apicalypse query (e.g. `fields name; where id = 1;`) to an endpoint and returns the JSON array. */
  query(endpoint: string, body: string): Promise<unknown[]>;
};

export function createIgdbClient(deps: IgdbDeps): IgdbClient {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  let lastRequestAt = -Infinity;
  let queue: Promise<unknown> = Promise.resolve();

  /** Waits for its turn: one request at a time, at most one start per MIN_REQUEST_INTERVAL_MS. */
  async function throttled<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = now();
      return task();
    });
    queue = run.catch(() => undefined);
    return run;
  }

  async function post(endpoint: string, body: string, token: string) {
    return deps.fetch(`${API_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': deps.clientId,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body,
    });
  }

  return {
    async query(endpoint, body) {
      let token = await getIgdbToken(deps);
      let refreshed = false;
      for (let attempt = 0; ; attempt += 1) {
        const res = await throttled(() => post(endpoint, body, token));
        if (res.status === 401 && !refreshed) {
          token = await getIgdbToken(deps, true);
          refreshed = true;
          continue;
        }
        if (res.status === 429 && attempt < MAX_RETRIES) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        if (!res.ok) throw new IgdbError(`IGDB ${endpoint} failed`, res.status);
        const data: unknown = await res.json();
        if (!Array.isArray(data)) throw new IgdbError(`Unexpected IGDB ${endpoint} response`);
        return data;
      }
    },
  };
}
