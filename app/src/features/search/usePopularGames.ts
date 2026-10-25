import { useEffect, useState } from 'react';

import { SEARCH_INDEXES } from '@weloot/shared';

import { searchClient } from './algolia';
import type { SearchArea } from './useListingSearch';

export type PopularGame = { title: string; count: number };
export const POPULAR_GAMES_COUNT = 8;

/**
 * The games with the most active listings in the search area (PRD W4, empty query). Real counts from the index's
 * facets, never padded: with no listings yet it's an empty list.
 */
export function usePopularGames(area: SearchArea | null): PopularGame[] {
  const key = JSON.stringify(area);
  const [result, setResult] = useState<{ key: string; games: PopularGame[] } | null>(null);

  useEffect(() => {
    const client = searchClient();
    if (!client) return;
    const request: SearchArea | null = JSON.parse(key);
    let cancelled = false;
    client
      .searchForHits<Record<string, unknown>>({
        requests: [
          {
            indexName: SEARCH_INDEXES.listings,
            query: '',
            hitsPerPage: 0,
            facets: ['gameTitle'],
            maxValuesPerFacet: POPULAR_GAMES_COUNT,
            ...(request
              ? {
                  aroundLatLng: `${request.lat}, ${request.lng}`,
                  ...(request.radiusKm !== null ? { aroundRadius: request.radiusKm * 1000 } : {}),
                }
              : {}),
          },
        ],
      })
      .then(
        ({ results }) => {
          if (cancelled) return;
          const counts = results[0]?.facets?.gameTitle ?? {};
          const games = Object.entries(counts)
            .map(([title, count]) => ({ title, count }))
            .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
            .slice(0, POPULAR_GAMES_COUNT);
          setResult({ key, games });
        },
        // Popular games are a nice-to-have on the empty screen; on failure they're just not shown.
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return result?.key === key ? result.games : [];
}
