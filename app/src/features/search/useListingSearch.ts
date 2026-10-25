import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { useEffect, useState } from 'react';

import {
  listingFilters,
  listingRecordSchema,
  SEARCH_INDEXES,
  type ListingFilters,
  type ListingRecord,
} from '@weloot/shared';

import { isSearchConfigured, searchClient } from './algolia';

/** Where results are measured from and how far they may be (area-level browsing location, PRD W1/W4). */
export type SearchArea = { lat: number; lng: number; radiusKm: number | null };

export type ListingSearchParams = {
  query: string;
  filters: ListingFilters;
  area: SearchArea | null;
};

export type ListingSearchState =
  | { status: 'notConfigured' }
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      hits: ListingRecord[];
      /** All matches, across pages. */
      total: number;
      hasMore: boolean;
      loadingMore: boolean;
      loadMore: () => void;
    };

/** Wait this long after the last keystroke or filter change before searching. */
export const LISTING_SEARCH_DELAY_MS = 250;
export const LISTINGS_PER_PAGE = 30;
/**
 * Results within this distance count as equally near, so photos and recency decide their order (Algolia otherwise
 * ranks strictly by meters first).
 */
const DISTANCE_BAND_METERS = 3000;

type Pages = { key: string; hits: ListingRecord[]; total: number; nbPages: number; page: number };

/** One Algolia query for a page of listings. */
async function fetchPage(params: ListingSearchParams, page: number) {
  const client = searchClient();
  if (!client) throw new Error('search not configured');
  const filters = listingFilters(params.filters);
  const { area } = params;
  const { results } = await client.searchForHits<Record<string, unknown>>({
    requests: [
      {
        indexName: SEARCH_INDEXES.listings,
        query: params.query.trim(),
        page,
        hitsPerPage: LISTINGS_PER_PAGE,
        ...(filters ? { filters } : {}),
        ...(area
          ? {
              aroundLatLng: `${area.lat}, ${area.lng}`,
              aroundPrecision: DISTANCE_BAND_METERS,
              ...(area.radiusKm !== null ? { aroundRadius: area.radiusKm * 1000 } : {}),
            }
          : {}),
      },
    ],
  });
  const result = results[0];
  const hits = (result?.hits ?? []).flatMap((hit) => {
    const parsed = listingRecordSchema.safeParse(hit);
    return parsed.success ? [parsed.data] : [];
  });
  return { hits, total: result?.nbHits ?? hits.length, nbPages: result?.nbPages ?? 1 };
}

function logSearch(params: ListingSearchParams, total: number) {
  try {
    const analytics = getAnalytics();
    // No search text: queries can contain anything (PRD §11, no PII in events).
    const event = {
      has_query: params.query.trim() !== '',
      filtered: listingFilters(params.filters) !== '',
      results: total,
    };
    logEvent(analytics, 'search_performed', event);
    if (total === 0) logEvent(analytics, 'search_no_results', event);
  } catch {
    // Analytics never breaks search.
  }
}

/**
 * Listing search over the Algolia `listings` index (PRD W4): only active listings, filtered and limited to a
 * distance around the browsing location. Debounced; pages load with `loadMore`. Hits that don't match the record
 * shape are dropped.
 */
export function useListingSearch(params: ListingSearchParams): ListingSearchState {
  const key = JSON.stringify(params);
  const [pages, setPages] = useState<Pages | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [wanted, setWanted] = useState<{ key: string; page: number }>({ key: '', page: 0 });
  const page = wanted.key === key ? wanted.page : 0;

  useEffect(() => {
    if (!isSearchConfigured()) return;
    const request: ListingSearchParams = JSON.parse(key);
    let cancelled = false;
    // Only the first page waits for typing to settle; "load more" is fetched at once.
    const timer = setTimeout(
      () => {
        fetchPage(request, page).then(
          (result) => {
            if (cancelled) return;
            if (page === 0) logSearch(request, result.total);
            setPages((current) => ({
              key,
              page,
              total: result.total,
              nbPages: result.nbPages,
              hits:
                page === 0 || current?.key !== key
                  ? result.hits
                  : [
                      ...current.hits,
                      // A listing added meanwhile can shift pages; never show one twice.
                      ...result.hits.filter(
                        (h) => !current.hits.some((c) => c.objectID === h.objectID),
                      ),
                    ],
            }));
          },
          () => {
            if (!cancelled) setFailed(`${key}#${page}`);
          },
        );
      },
      page === 0 ? LISTING_SEARCH_DELAY_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, page]);

  if (!isSearchConfigured()) return { status: 'notConfigured' };
  const current = pages?.key === key ? pages : null;
  if (!current || current.page < page) {
    if (failed === `${key}#${page}`) {
      // A failed "load more" keeps what's shown; a failed first page is an error.
      return current ? readyState(current, false, () => undefined) : { status: 'error' };
    }
    if (!current) return { status: 'loading' };
  }
  const loadingMore = current.page < page;
  return readyState(current, loadingMore, () => {
    if (!loadingMore && current.page + 1 < current.nbPages) {
      setWanted({ key, page: current.page + 1 });
    }
  });
}

function readyState(pages: Pages, loadingMore: boolean, loadMore: () => void): ListingSearchState {
  return {
    status: 'ready',
    hits: pages.hits,
    total: pages.total,
    hasMore: pages.page + 1 < pages.nbPages,
    loadingMore,
    loadMore,
  };
}
