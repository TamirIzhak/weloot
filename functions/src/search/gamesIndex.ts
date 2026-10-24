import { logger } from 'firebase-functions';

import { gameSchema, SEARCH_INDEXES, toGameRecord } from '@weloot/shared';

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

/**
 * Mirrors one `games` doc change: saves the record, or deletes it when the doc is gone. A doc that doesn't match
 * the schema is removed from the index rather than indexed half-broken.
 */
export async function syncGameRecord(
  client: AlgoliaAdmin,
  gameId: string,
  after: unknown,
): Promise<'saved' | 'deleted'> {
  const parsed = after === undefined ? null : gameSchema.safeParse(after);
  if (!parsed?.success) {
    if (parsed) logger.warn('gamesIndex: invalid game doc, removing it from the index', { gameId });
    await client.deleteObject({ indexName: SEARCH_INDEXES.games, objectID: gameId });
    return 'deleted';
  }
  await client.saveObject({
    indexName: SEARCH_INDEXES.games,
    body: toGameRecord(gameId, parsed.data),
  });
  return 'saved';
}
