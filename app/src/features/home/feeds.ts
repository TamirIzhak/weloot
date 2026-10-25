import { useState } from 'react';

import { useBrowsingLocation } from '@/features/location/browsingLocation';
import type { ListingTileData } from '@/features/listings/grid/ListingTile';
import { listingToTile } from '@/features/listings/tileData';
import { useListingSearch } from '@/features/search/useListingSearch';
import { useViewer } from '@/features/search/useViewer';
import { currentLanguage } from '@/i18n';

import { useListingsByIds, useMatches } from './homeData';

export type MatchFeed = 'perfect' | 'wanted';
export type FeedKind = MatchFeed | 'new';
export const FEED_KINDS: readonly FeedKind[] = ['perfect', 'wanted', 'new'];

/** How far back "New near you" looks. */
export const NEW_LISTING_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Listings from the user's matches (#21), best match first: `perfect` = mutual matches (their first matching
 * listing each), `wanted` = what one-way matches have for the user (mutual ones are already under Perfect).
 * `null` while loading.
 */
export function useMatchFeed(kind: MatchFeed, max: number): ListingTileData[] | null {
  const viewer = useViewer();
  const browsing = useBrowsingLocation((s) => s.location);
  const matches = useMatches(viewer.uid);
  const ids =
    matches.status !== 'ready'
      ? []
      : [
          ...new Set(
            matches.value
              .filter((m) => (kind === 'perfect') === m.perfect)
              .flatMap((m) =>
                kind === 'perfect' ? m.theirListingIds.slice(0, 1) : m.theirListingIds,
              ),
          ),
        ].slice(0, max);
  const listings = useListingsByIds(ids);
  if (matches.status === 'loading' || listings.status === 'loading') return null;
  if (matches.status === 'error' || listings.status === 'error') return [];
  const language = currentLanguage();
  return listings.value.map((l) => listingToTile(l, browsing, language));
}

/**
 * "New near you": active listings from the last two weeks around the browsing location (anywhere without one),
 * real photos and recency first within a distance band; never the user's own or blocked users'.
 */
export function useNewNearYou() {
  const viewer = useViewer();
  const browsing = useBrowsingLocation((s) => s.location);
  // Fixed per mount (to the day), so the query key stays stable while the screen is open.
  const [since] = useState(() => (Math.floor(Date.now() / DAY_MS) - NEW_LISTING_DAYS) * DAY_MS);
  const search = useListingSearch({
    query: '',
    filters: { listedAfterMs: since, excludeUserIds: [...viewer.excludedUserIds].sort() },
    area: browsing ? { lat: browsing.lat, lng: browsing.lng, radiusKm: viewer.radiusKm } : null,
  });
  return { search, pending: viewer.pending, browsing };
}
