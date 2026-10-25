import { z } from 'zod';

import { CONDITIONS, PLATFORM_KEYS, type Condition, type PlatformKey } from './enums';
import type { Game, ListingDoc } from './schemas';

// Algolia indexes (PRD §5.2): written only by Cloud Functions, searched by the app with the search-only key.

export const SEARCH_INDEXES = { games: 'games', listings: 'listings' } as const;

/** A `games` index record: what game search shows and filters on. */
export const gameRecordSchema = z.object({
  objectID: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  platforms: z.array(z.enum(PLATFORM_KEYS as [PlatformKey, ...PlatformKey[]])),
  coverImageId: z.string().optional(),
  releaseYear: z.number().int().optional(),
  genres: z.array(z.string()),
  altNames: z.array(z.string()),
});
export type GameRecord = z.infer<typeof gameRecordSchema>;

export function toGameRecord(id: string, game: Game): GameRecord {
  return {
    objectID: id,
    title: game.title,
    slug: game.slug,
    platforms: game.platforms,
    ...(game.coverImageId ? { coverImageId: game.coverImageId } : {}),
    ...(game.releaseDate
      ? { releaseYear: new Date(game.releaseDate.toMillis()).getUTCFullYear() }
      : {}),
    genres: game.genres,
    altNames: game.altNames,
  };
}

/** Algolia filter for one platform, e.g. `platforms:ps5`. */
export function platformFilter(platform: PlatformKey): string {
  return `platforms:${platform}`;
}

/**
 * A `listings` index record (PRD §5.2): only `active` listings, located at area level (the listing's area point,
 * never an address). `createdAtMs` and `hasPhotos` drive ranking.
 */
export const listingRecordSchema = z.object({
  objectID: z.string().min(1),
  userId: z.string().min(1),
  igdbGameId: z.number().int().positive(),
  gameTitle: z.string().min(1),
  platform: z.enum(PLATFORM_KEYS as [PlatformKey, ...PlatformKey[]]),
  coverImageId: z.string().optional(),
  condition: z.enum(CONDITIONS),
  isForTrade: z.boolean(),
  isForSale: z.boolean(),
  askingPriceAgorot: z.number().int().optional(),
  hasPhotos: z.boolean(),
  areaName: z.string().min(1),
  cityId: z.string().optional(),
  _geoloc: z.object({ lat: z.number(), lng: z.number() }),
  createdAtMs: z.number().int(),
});
export type ListingRecord = z.infer<typeof listingRecordSchema>;

/** The search record of a listing, or null when it shouldn't be searchable (anything but `active`). */
export function toListingRecord(id: string, listing: ListingDoc): ListingRecord | null {
  if (listing.status !== 'active') return null;
  return {
    objectID: id,
    userId: listing.userId,
    igdbGameId: listing.igdbGameId,
    gameTitle: listing.gameTitle,
    platform: listing.platform,
    ...(listing.coverImageId ? { coverImageId: listing.coverImageId } : {}),
    condition: listing.condition,
    isForTrade: listing.isForTrade,
    isForSale: listing.isForSale,
    ...(listing.askingPriceAgorot !== undefined
      ? { askingPriceAgorot: listing.askingPriceAgorot }
      : {}),
    hasPhotos: listing.hasPhotos,
    areaName: listing.location.areaName,
    ...(listing.location.cityId ? { cityId: listing.location.cityId } : {}),
    _geoloc: { lat: listing.location.lat, lng: listing.location.lng },
    createdAtMs: listing.createdAt.toMillis(),
  };
}

/** Search tab filters (PRD W4). A price range only matches listings for sale (trade-only ones have no price). */
export type ListingFilters = {
  platform?: PlatformKey;
  /** Trade only, sale only, or either. */
  mode?: 'trade' | 'sale';
  conditions?: readonly Condition[];
  minPriceAgorot?: number;
  maxPriceAgorot?: number;
  /** The searcher's own and blocked users' listings never show. */
  excludeUserIds?: readonly string[];
};

/** Most users excluded by ID in one query (Algolia limits filter length; block lists are short). */
export const MAX_EXCLUDED_USERS = 100;

/** Algolia `filters` string for listing search, e.g. `platform:ps5 AND isForTrade:true AND NOT userId:u1`. */
export function listingFilters(filters: ListingFilters): string {
  const parts: string[] = [];
  if (filters.platform) parts.push(`platform:${filters.platform}`);
  if (filters.mode === 'trade') parts.push('isForTrade:true');
  const priced = filters.minPriceAgorot !== undefined || filters.maxPriceAgorot !== undefined;
  if (filters.mode === 'sale' || priced) parts.push('isForSale:true');
  if (priced) {
    const min = filters.minPriceAgorot ?? 0;
    const max = filters.maxPriceAgorot ?? Number.MAX_SAFE_INTEGER;
    parts.push(`askingPriceAgorot:${min} TO ${max}`);
  }
  if (filters.conditions && filters.conditions.length > 0) {
    const any = filters.conditions.map((c) => `condition:${c}`).join(' OR ');
    parts.push(filters.conditions.length > 1 ? `(${any})` : any);
  }
  for (const uid of (filters.excludeUserIds ?? []).slice(0, MAX_EXCLUDED_USERS)) {
    // Quoted: user IDs are free-form strings to Algolia's filter parser.
    parts.push(`NOT userId:"${uid.replace(/["\\]/g, '')}"`);
  }
  return parts.join(' AND ');
}
