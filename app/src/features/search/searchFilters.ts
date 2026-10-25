import {
  distanceKm,
  findCity,
  shekelsToAgorot,
  type Condition,
  type LanguageCode,
  type ListingFilters,
  type ListingRecord,
  type PlatformKey,
} from '@weloot/shared';

import type { ListingTileData } from '@/features/listings/grid/ListingTile';

/** Distance choices on the Search tab; `null` = anywhere in Israel. */
export const DISTANCE_OPTIONS_KM = [5, 10, 25, 50, 100, null] as const;

/** What the Search tab's filter panel holds (prices as typed, in whole shekels). */
export type SearchFilterState = {
  platform?: PlatformKey;
  mode?: 'trade' | 'sale';
  conditions: Condition[];
  minShekels: string;
  maxShekels: string;
  /** Unset = the user's search radius (Settings, default 25 km). */
  radiusKm?: number | null;
};

export const EMPTY_FILTERS: SearchFilterState = { conditions: [], minShekels: '', maxShekels: '' };

/** Whole shekels from a price field, or undefined when it's empty or not a number. */
export function parseShekels(text: string): number | undefined {
  const digits = text.replace(/[^\d]/g, '');
  if (digits === '') return undefined;
  return Number.parseInt(digits, 10);
}

/** How many filters are set (the badge on the Filters button). */
export function activeFilterCount(state: SearchFilterState): number {
  return [
    state.platform !== undefined,
    state.mode !== undefined,
    state.conditions.length > 0,
    parseShekels(state.minShekels) !== undefined || parseShekels(state.maxShekels) !== undefined,
    state.radiusKm !== undefined,
  ].filter(Boolean).length;
}

/** The index filters for a panel state. A reversed price range is read the right way round. */
export function toListingFilters(
  state: SearchFilterState,
  excludeUserIds: readonly string[],
): ListingFilters {
  const min = parseShekels(state.minShekels);
  const max = parseShekels(state.maxShekels);
  const [low, high] = min !== undefined && max !== undefined && min > max ? [max, min] : [min, max];
  return {
    ...(state.platform ? { platform: state.platform } : {}),
    ...(state.mode ? { mode: state.mode } : {}),
    ...(state.conditions.length > 0 ? { conditions: [...state.conditions].sort() } : {}),
    ...(low !== undefined ? { minPriceAgorot: shekelsToAgorot(low) } : {}),
    ...(high !== undefined ? { maxPriceAgorot: shekelsToAgorot(high) } : {}),
    ...(excludeUserIds.length > 0 ? { excludeUserIds: [...excludeUserIds].sort() } : {}),
  };
}

/**
 * A search hit as a grid tile: the area named in the reader's language when it's a known locality, and the distance
 * from the browsing location when there is one.
 */
export function toTile(
  record: ListingRecord,
  from: { lat: number; lng: number } | null,
  language: LanguageCode,
): ListingTileData {
  const city = record.cityId ? findCity(record.cityId) : undefined;
  return {
    id: record.objectID,
    igdbGameId: record.igdbGameId,
    gameTitle: record.gameTitle,
    platform: record.platform,
    ...(record.coverImageId ? { coverImageId: record.coverImageId } : {}),
    hasPhotos: record.hasPhotos,
    condition: record.condition,
    isForTrade: record.isForTrade,
    isForSale: record.isForSale,
    ...(record.askingPriceAgorot !== undefined
      ? { askingPriceAgorot: record.askingPriceAgorot }
      : {}),
    areaName: city?.[language] ?? record.areaName,
    ...(from ? { distanceKm: distanceKm(from, record._geoloc) } : {}),
  };
}
