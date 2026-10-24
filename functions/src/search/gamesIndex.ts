import { logger } from 'firebase-functions';

import {
  gameRecordSchema,
  gameSchema,
  SEARCH_INDEXES,
  toGameRecord,
  type GameRecord,
} from '@weloot/shared';

// Keeps the Algolia `games` index in step with `games/{igdbId}` (PRD §5.2, #13). Only Cloud Functions write
// indexes; the app searches with the search-only key.

/** The admin client calls this module uses (a subset of algoliasearch's client, easy to fake in tests). */
export type AlgoliaAdmin = {
  saveObject(args: { indexName: string; body: Record<string, unknown> }): Promise<unknown>;
  deleteObject(args: { indexName: string; objectID: string }): Promise<unknown>;
  setSettings(args: {
    indexName: string;
    indexSettings: Record<string, unknown>;
  }): Promise<unknown>;
};

/**
 * Typo-tolerant title search (alternative names too, in any language), filterable by platform, newer games first
 * among equally good matches.
 */
export const GAMES_INDEX_SETTINGS = {
  searchableAttributes: ['title', 'unordered(altNames)'],
  attributesForFaceting: ['filterOnly(platforms)'],
  customRanking: ['desc(releaseYear)'],
  attributesToRetrieve: ['title', 'slug', 'platforms', 'coverImageId', 'releaseYear', 'genres'],
  ignorePlurals: true,
} as const;

export async function configureGamesIndex(client: AlgoliaAdmin): Promise<void> {
  await client.setSettings({
    indexName: SEARCH_INDEXES.games,
    indexSettings: { ...GAMES_INDEX_SETTINGS },
  });
}

/** The search record a `games` doc produces, or null when it isn't a valid game. */
function recordOf(gameId: string, data: unknown) {
  const parsed = data === undefined ? null : gameSchema.safeParse(data);
  return parsed?.success ? toGameRecord(gameId, parsed.data) : null;
}

/**
 * Mirrors one `games` doc change: saves the record, or deletes it when the doc is gone. A doc that doesn't match
 * the schema is removed from the index rather than indexed half-broken. A rewrite that doesn't change the record
 * (e.g. a full catalog sync) costs no Algolia operation.
 */
export async function syncGameRecord(
  client: AlgoliaAdmin,
  gameId: string,
  after: unknown,
  before?: unknown,
): Promise<'saved' | 'deleted' | 'unchanged'> {
  const record = recordOf(gameId, after);
  if (!record) {
    if (after !== undefined) {
      logger.warn('gamesIndex: invalid game doc, removing it from the index', { gameId });
    }
    await client.deleteObject({ indexName: SEARCH_INDEXES.games, objectID: gameId });
    return 'deleted';
  }
  if (JSON.stringify(record) === JSON.stringify(recordOf(gameId, before))) return 'unchanged';
  await client.saveObject({ indexName: SEARCH_INDEXES.games, body: record });
  return 'saved';
}

/** Server-side catalog search (barcode suggestions, #14). */
export type AlgoliaSearcher = {
  searchSingleIndex(args: {
    indexName: string;
    searchParams: { query: string; hitsPerPage: number };
  }): Promise<{ hits: unknown[] }>;
};

export async function searchGamesIndex(
  client: AlgoliaSearcher,
  query: string,
  hitsPerPage = 5,
): Promise<GameRecord[]> {
  const { hits } = await client.searchSingleIndex({
    indexName: SEARCH_INDEXES.games,
    searchParams: { query, hitsPerPage },
  });
  return hits.flatMap((hit) => {
    const parsed = gameRecordSchema.safeParse(hit);
    return parsed.success ? [parsed.data] : [];
  });
}
