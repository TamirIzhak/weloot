import { distanceKm, findCity, type LanguageCode } from '@weloot/shared';

import type { ListingTileData } from './grid/ListingTile';
import type { Listing } from './useListing';

/** A Firestore listing as a grid/carousel tile: area in the reader's language, distance from the browsing location. */
export function listingToTile(
  listing: Listing,
  from: { lat: number; lng: number } | null,
  language: LanguageCode,
): ListingTileData {
  const city = listing.location.cityId ? findCity(listing.location.cityId) : undefined;
  return {
    id: listing.id,
    igdbGameId: listing.igdbGameId,
    gameTitle: listing.gameTitle,
    platform: listing.platform,
    ...(listing.coverImageId ? { coverImageId: listing.coverImageId } : {}),
    hasPhotos: listing.hasPhotos,
    condition: listing.condition,
    isForTrade: listing.isForTrade,
    isForSale: listing.isForSale,
    ...(listing.askingPriceAgorot !== undefined
      ? { askingPriceAgorot: listing.askingPriceAgorot }
      : {}),
    areaName: city?.[language] ?? listing.location.areaName,
    ...(from ? { distanceKm: distanceKm(from, listing.location) } : {}),
  };
}
