import { doc, getDoc, getFirestore } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import {
  gameRecordSchema,
  listingFilters,
  listingRecordSchema,
  PLATFORM_KEYS,
  SEARCH_INDEXES,
  type GameRecord,
  type ListingFilters,
  type ListingRecord,
  type PlatformKey,
} from '@weloot/shared';

import { searchClient } from './algolia';
import type { ListingSearchParams, SearchArea } from './useListingSearch';

/** What an empty search can still offer (PRD W4: "never a dead end"), all from real listings. */
export type EmptySuggestions = {
  /** The catalog game the text most likely means (for "Add to my want list" and "Notify me"). */
  game: GameRecord | null;
  /** The same game listed on other consoles, with counts. */
  otherPlatforms: { platform: PlatformKey; count: number }[];
  /** Similar games (IGDB) that are listed. */
  similar: ListingRecord[];
  /** Results with a wider radius, when that finds some. */
  wider: { radiusKm: number | null; count: number } | null;
  /** Results with no filters (same text and distance), when that finds some. */
  unfiltered: number;
};

/** The next radius to suggest: 50 km, then anywhere. */
export function widerRadius(radiusKm: number | null): number | null | undefined {
  if (radiusKm === null) return undefined;
  return radiusKm < 50 ? 50 : null;
}

const SIMILAR_LISTINGS = 10;
const SIMILAR_GAMES = 12;

function around(area: SearchArea | null, radiusKm: number | null | undefined) {
  if (!area) return {};
  return {
    aroundLatLng: `${area.lat}, ${area.lng}`,
    ...(radiusKm !== null && radiusKm !== undefined ? { aroundRadius: radiusKm * 1000 } : {}),
  };
}

const withFilters = (filters: ListingFilters) => {
  const value = listingFilters(filters);
  return value ? { filters: value } : {};
};

async function suggestionsFor(params: ListingSearchParams): Promise<EmptySuggestions> {
  const client = searchClient();
  if (!client) throw new Error('search not configured');
  const { query, filters, area } = params;
  const text = query.trim();
  const exclude = { excludeUserIds: filters.excludeUserIds ?? [] };

  // 1. Which game is meant (typo-tolerant title search over the catalog).
  const gameHit = text
    ? (
        await client.searchForHits<Record<string, unknown>>({
          requests: [{ indexName: SEARCH_INDEXES.games, query: text, hitsPerPage: 1 }],
        })
      ).results[0]?.hits[0]
    : undefined;
  const parsedGame = gameHit ? gameRecordSchema.safeParse(gameHit) : null;
  const game = parsedGame?.success ? parsedGame.data : null;
  const igdbGameId = game ? Number(game.objectID) : null;

  // Similar games from the catalog doc (public), when there's a game.
  let similarIds: number[] = [];
  if (igdbGameId) {
    try {
      const snapshot = await getDoc(doc(getFirestore(), 'games', String(igdbGameId)));
      const ids: unknown = snapshot.data()?.similarGameIds;
      similarIds = Array.isArray(ids)
        ? ids.filter((id): id is number => typeof id === 'number').slice(0, SIMILAR_GAMES)
        : [];
    } catch {
      // No similar games then.
    }
  }

  // 2–4 in one round trip.
  const next = widerRadius(area?.radiusKm ?? null);
  const excluded = listingFilters(exclude);
  const and = (...parts: string[]) => parts.filter(Boolean).join(' AND ');
  const filtered = listingFilters({ ...filters, excludeUserIds: [] }) !== '';
  const requests = [
    // Same game, any console (counts per console).
    igdbGameId
      ? {
          indexName: SEARCH_INDEXES.listings,
          query: '',
          hitsPerPage: 0,
          facets: ['platform'],
          filters: and(`igdbGameId:${igdbGameId}`, excluded),
          ...around(area, null),
        }
      : null,
    // Similar games that are listed, nearest first.
    similarIds.length > 0
      ? {
          indexName: SEARCH_INDEXES.listings,
          query: '',
          hitsPerPage: SIMILAR_LISTINGS,
          filters: and(`(${similarIds.map((id) => `igdbGameId:${id}`).join(' OR ')})`, excluded),
          ...around(area, null),
        }
      : null,
    // A wider radius, same text and filters.
    area && next !== undefined
      ? {
          indexName: SEARCH_INDEXES.listings,
          query: text,
          hitsPerPage: 0,
          ...withFilters(filters),
          ...around(area, next),
        }
      : null,
    // No filters, same text and distance.
    filtered
      ? {
          indexName: SEARCH_INDEXES.listings,
          query: text,
          hitsPerPage: 0,
          ...withFilters(exclude),
          ...around(area, area?.radiusKm),
        }
      : null,
  ];
  const sent = requests.flatMap((r) => (r ? [r] : []));
  const { results } = sent.length
    ? await client.searchForHits<Record<string, unknown>>({ requests: sent })
    : { results: [] };
  let i = 0;
  const take = (request: unknown) => (request ? results[i++] : undefined);
  const [sameGame, similarResult, widerResult, unfilteredResult] = requests.map(take);

  const counts = (sameGame?.facets?.platform ?? {}) as Record<string, number>;
  return {
    game,
    otherPlatforms: PLATFORM_KEYS.flatMap((platform) => {
      const count = counts[platform] ?? 0;
      return count > 0 && platform !== filters.platform ? [{ platform, count }] : [];
    }),
    similar: (similarResult?.hits ?? []).flatMap((hit) => {
      const parsed = listingRecordSchema.safeParse(hit);
      return parsed.success ? [parsed.data] : [];
    }),
    wider:
      next !== undefined && (widerResult?.nbHits ?? 0) > 0
        ? { radiusKm: next, count: widerResult?.nbHits ?? 0 }
        : null,
    unfiltered: unfilteredResult?.nbHits ?? 0,
  };
}

/**
 * Suggestions for a search that found nothing (PRD W4, #48), loaded once per search. `null` while loading; on
 * failure, empty suggestions (the screen still offers its fixed actions).
 */
export function useEmptySuggestions(params: ListingSearchParams): EmptySuggestions | null {
  const key = JSON.stringify(params);
  const [result, setResult] = useState<{ key: string; value: EmptySuggestions } | null>(null);

  useEffect(() => {
    let cancelled = false;
    suggestionsFor(JSON.parse(key) as ListingSearchParams).then(
      (value) => {
        if (!cancelled) setResult({ key, value });
      },
      () => {
        if (!cancelled) {
          setResult({
            key,
            value: { game: null, otherPlatforms: [], similar: [], wider: null, unfiltered: 0 },
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return result?.key === key ? result.value : null;
}
