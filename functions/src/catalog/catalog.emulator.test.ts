import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  gamesQuery,
  INCLUDED_GAME_TYPES,
  PAGE_SIZE,
  syncCatalog,
  toGameDoc,
  type IgdbGame,
} from './catalogSync';
import {
  createIgdbClient,
  getIgdbToken,
  IgdbError,
  MIN_REQUEST_INTERVAL_MS,
  type IgdbClient,
  type IgdbDeps,
} from './igdbClient';

// Firestore parts run on the emulator (started by `npm test`); IGDB and Twitch are mocked.

jest.mock('firebase-functions', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));

const db = getFirestore(getApps()[0] ?? initializeApp());
const DAY = 24 * 60 * 60 * 1000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function clear() {
  await db.recursiveDelete(db.collection('system'));
  await db.recursiveDelete(db.collection('games'));
}

beforeEach(clear);
afterAll(clear);

function deps(fetch: jest.Mock, now = () => 1_000_000_000_000): IgdbDeps & { sleep: jest.Mock } {
  return {
    fetch,
    db,
    clientId: 'client',
    clientSecret: 'secret',
    now,
    sleep: jest.fn(async () => undefined),
  };
}

describe('Twitch token', () => {
  it('fetches a client-credentials token once and caches it', async () => {
    const fetch = jest.fn(async () => json(200, { access_token: 'tok-1', expires_in: 5_000_000 }));
    const d = deps(fetch);
    await expect(getIgdbToken(d)).resolves.toBe('tok-1');
    await expect(getIgdbToken(d)).resolves.toBe('tok-1');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://id.twitch.tv/oauth2/token?client_id=client&client_secret=secret&grant_type=client_credentials',
    );
    expect(init.method).toBe('POST');
    expect((await db.doc('system/igdbToken').get()).data()).toEqual({
      accessToken: 'tok-1',
      expiresAt: 1_000_000_000_000 + 5_000_000_000,
    });
  });

  it('refreshes a token within a week of expiry, or when forced', async () => {
    await db
      .doc('system/igdbToken')
      .set({ accessToken: 'old', expiresAt: 1_000_000_000_000 + 3 * DAY });
    const fetch = jest.fn(async () => json(200, { access_token: 'new', expires_in: 5_000_000 }));
    await expect(getIgdbToken(deps(fetch))).resolves.toBe('new');
    await expect(getIgdbToken(deps(fetch), true)).resolves.toBe('new');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails clearly when Twitch refuses', async () => {
    const fetch = jest.fn(async () => json(400, { message: 'invalid client secret' }));
    await expect(getIgdbToken(deps(fetch))).rejects.toBeInstanceOf(IgdbError);
  });
});

describe('IGDB client', () => {
  beforeEach(async () => {
    await db
      .doc('system/igdbToken')
      .set({ accessToken: 'tok', expiresAt: 1_000_000_000_000 + 30 * DAY });
  });

  it('sends Apicalypse queries with the client ID and token', async () => {
    const fetch = jest.fn(async () => json(200, [{ id: 1 }]));
    const client = createIgdbClient(deps(fetch));
    await expect(client.query('games', 'fields name;')).resolves.toEqual([{ id: 1 }]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.igdb.com/v4/games');
    expect(init).toMatchObject({
      method: 'POST',
      body: 'fields name;',
      headers: { 'Client-ID': 'client', Authorization: 'Bearer tok' },
    });
  });

  it('keeps at most one request start per interval (4 per second)', async () => {
    let clock = 1_000_000_000_000;
    const fetch = jest.fn(async () => json(200, []));
    const d = deps(fetch, () => clock);
    d.sleep.mockImplementation(async (ms: number) => {
      clock += ms;
    });
    const client = createIgdbClient(d);
    await Promise.all([
      client.query('games', 'a'),
      client.query('games', 'b'),
      client.query('games', 'c'),
    ]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(d.sleep.mock.calls).toEqual([[MIN_REQUEST_INTERVAL_MS], [MIN_REQUEST_INTERVAL_MS]]);
  });

  it('refreshes the token once on 401', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { access_token: 'fresh', expires_in: 5_000_000 }))
      .mockResolvedValueOnce(json(200, [{ id: 2 }]));
    const client = createIgdbClient(deps(fetch));
    await expect(client.query('games', 'q')).resolves.toEqual([{ id: 2 }]);
    const [, retry] = fetch.mock.calls[2] as unknown as [string, RequestInit];
    expect(retry.headers).toMatchObject({ Authorization: 'Bearer fresh' });
  });

  it('backs off and retries when rate-limited, then gives up', async () => {
    const fetch = jest.fn(async () => json(429, {}));
    const d = deps(fetch);
    await expect(createIgdbClient(d).query('games', 'q')).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(d.sleep).toHaveBeenCalledWith(1000);
    expect(d.sleep).toHaveBeenCalledWith(4000);
  });
});

const IGDB_GAME: IgdbGame = {
  id: 119133,
  name: 'Elden Ring',
  slug: 'elden-ring',
  platforms: [6, 48, 167, 49, 169, 48],
  cover: { image_id: 'co4jni' },
  first_release_date: 1645747200,
  genres: [{ name: 'Role-playing (RPG)' }, { name: 'Adventure' }],
  alternative_names: [{ name: 'エルデンリング' }, { name: 'ER' }, { name: 'ER' }],
  similar_games: [1, 2, 3],
  updated_at: 1700000000,
};

describe('gamesQuery and toGameDoc', () => {
  it('asks for main games on our platforms, by id', () => {
    const query = gamesQuery(42, 1700000000);
    expect(query).toContain('where platforms = (167,48,130,169,49)');
    expect(query).toContain(`game_type = (${INCLUDED_GAME_TYPES.join(',')})`);
    expect(query).toContain('id > 42');
    expect(query).toContain('updated_at > 1700000000');
    expect(query).toContain(`sort id asc; limit ${PAGE_SIZE};`);
    expect(gamesQuery(0)).not.toContain('updated_at >');
  });

  it('maps an IGDB game to our doc, keeping only supported platforms', () => {
    expect(toGameDoc(IGDB_GAME)).toEqual({
      title: 'Elden Ring',
      slug: 'elden-ring',
      platforms: ['ps4', 'ps5', 'xbox_one', 'xbox_series'],
      platformIds: [48, 167, 49, 169],
      coverImageId: 'co4jni',
      releaseDate: Timestamp.fromMillis(1645747200 * 1000),
      genres: ['Role-playing (RPG)', 'Adventure'],
      altNames: ['エルデンリング', 'ER'],
      similarGameIds: [1, 2, 3],
      igdbUpdatedAt: 1700000000,
    });
  });

  it('skips games only on other platforms', () => {
    expect(toGameDoc({ ...IGDB_GAME, platforms: [6, 3] })).toBeNull();
  });
});

describe('syncCatalog', () => {
  /** A fake IGDB with `count` games (ids 1..count), answering id-cursor pages like the real API. */
  function fakeIgdb(count: number, updatedAt = 1700000000) {
    const games = Array.from({ length: count }, (_, i) => ({
      ...IGDB_GAME,
      id: i + 1,
      slug: `game-${i + 1}`,
      updated_at: updatedAt + i,
    }));
    const queries: string[] = [];
    const client: IgdbClient = {
      async query(_endpoint, body) {
        queries.push(body);
        const afterId = Number(/id > (\d+)/.exec(body)?.[1] ?? 0);
        const since = /updated_at > (\d+)/.exec(body)?.[1];
        return games
          .filter((g) => g.id > afterId && (since === undefined || g.updated_at > Number(since)))
          .slice(0, PAGE_SIZE);
      },
    };
    return { client, queries };
  }

  it('pages through everything and writes each game once', async () => {
    const { client, queries } = fakeIgdb(PAGE_SIZE + 3);
    await expect(syncCatalog(client, db, 'full')).resolves.toEqual({
      mode: 'full',
      fetched: PAGE_SIZE + 3,
      written: PAGE_SIZE + 3,
      skipped: 0,
    });
    expect(queries).toHaveLength(2);
    expect(queries[1]).toContain(`id > ${PAGE_SIZE}`);
    expect((await db.collection('games').count().get()).data().count).toBe(PAGE_SIZE + 3);
    expect((await db.doc('games/1').get()).get('title')).toBe('Elden Ring');
    expect((await db.doc('system/catalogSync').get()).get('lastUpdatedAt')).toBe(
      1700000000 + PAGE_SIZE + 2,
    );
  });

  it('is idempotent: running again gives the same docs', async () => {
    const { client } = fakeIgdb(3);
    await syncCatalog(client, db, 'full');
    const before = (await db.doc('games/2').get()).data();
    await syncCatalog(client, db, 'full');
    expect((await db.doc('games/2').get()).data()).toEqual(before);
    expect((await db.collection('games').count().get()).data().count).toBe(3);
  });

  it('only fetches games updated since the last run when incremental', async () => {
    const first = fakeIgdb(3);
    await syncCatalog(first.client, db, 'full');
    const second = fakeIgdb(3);
    await expect(syncCatalog(second.client, db, 'incremental')).resolves.toMatchObject({
      fetched: 0,
      written: 0,
    });
    expect(second.queries[0]).toContain('updated_at > 1700000002');
  });

  it('skips malformed rows and games without a supported platform', async () => {
    const client: IgdbClient = {
      query: async () => [
        { id: 1, name: 'No slug' },
        { ...IGDB_GAME, id: 2, platforms: [6] },
        { ...IGDB_GAME, id: 3 },
      ],
    };
    await expect(syncCatalog(client, db, 'full')).resolves.toMatchObject({
      fetched: 3,
      written: 1,
      skipped: 2,
    });
  });
});
