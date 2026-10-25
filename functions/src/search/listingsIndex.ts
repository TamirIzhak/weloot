import { logger } from 'firebase-functions';

import { listingSchema, SEARCH_INDEXES, toListingRecord } from '@weloot/shared';

import type { AlgoliaAdmin } from './gamesIndex';

// Keeps the Algolia `listings` index in step with `listings/{id}` (PRD §5.2, #18): only `active` listings are in it,
// so pausing, reserving, closing or removing a listing takes it out of search.

/**
 * Title search, filterable by everything the Search tab filters on. Among equally good matches (and within the same
 * distance band), listings with real photos come first, then newer ones.
 */
export const LISTINGS_INDEX_SETTINGS = {
  searchableAttributes: ['gameTitle'],
  attributesForFaceting: [
    'filterOnly(platform)',
    'filterOnly(condition)',
    'filterOnly(isForTrade)',
    'filterOnly(isForSale)',
    'filterOnly(userId)',
    'filterOnly(igdbGameId)',
    // Facet counts on titles give "Popular games" on an empty search (real counts of active listings).
    'gameTitle',
  ],
  numericAttributesForFiltering: ['askingPriceAgorot', 'createdAtMs'],
  customRanking: ['desc(hasPhotos)', 'desc(createdAtMs)'],
  ignorePlurals: true,
} as const;

export async function configureListingsIndex(client: AlgoliaAdmin): Promise<void> {
  await client.setSettings({
    indexName: SEARCH_INDEXES.listings,
    indexSettings: { ...LISTINGS_INDEX_SETTINGS },
  });
}

function recordOf(listingId: string, data: unknown) {
  const parsed = data === undefined ? null : listingSchema.safeParse(data);
  return parsed?.success ? toListingRecord(listingId, parsed.data) : null;
}

/**
 * Mirrors a listing into search from its **current** doc (`current`, read when the event is handled, not the event's
 * snapshot), so events arriving out of order or twice can't bring back a paused or closed listing. Saves the record
 * while the listing is active, deletes it otherwise (gone, not active, or not matching the schema). A write that
 * doesn't change the record compared with the event's `before` (e.g. `updatedAt` only) costs nothing.
 */
export async function syncListingRecord(
  client: AlgoliaAdmin,
  listingId: string,
  current: unknown,
  before?: unknown,
): Promise<'saved' | 'deleted' | 'unchanged'> {
  const record = recordOf(listingId, current);
  if (!record) {
    if (current !== undefined && !listingSchema.safeParse(current).success) {
      logger.warn('listingsIndex: invalid listing doc, removing it from the index', { listingId });
    }
    await client.deleteObject({ indexName: SEARCH_INDEXES.listings, objectID: listingId });
    return 'deleted';
  }
  if (JSON.stringify(record) === JSON.stringify(recordOf(listingId, before))) return 'unchanged';
  await client.saveObject({ indexName: SEARCH_INDEXES.listings, body: record });
  return 'saved';
}
