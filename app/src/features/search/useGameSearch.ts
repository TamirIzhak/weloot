import { useEffect, useState } from 'react';

import {
  gameRecordSchema,
  platformFilter,
  SEARCH_INDEXES,
  type GameRecord,
  type PlatformKey,
} from '@weloot/shared';

import { isSearchConfigured, searchClient } from './algolia';

export type GameSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; hits: GameRecord[] }
  | { status: 'error' }
  | { status: 'notConfigured' };

/** Wait this long after the last keystroke before searching. */
export const GAME_SEARCH_DELAY_MS = 250;
const HITS_PER_PAGE = 20;

/**
 * Typo-tolerant game search over the Algolia `games` index (PRD §5.2), optionally on one platform. Debounced;
 * an empty query is `idle`. Hits that don't match the record shape are dropped.
 */
export function useGameSearch(query: string, platform?: PlatformKey): GameSearchState {
  const trimmed = query.trim();
  const [result, setResult] = useState<{ key: string; state: GameSearchState } | null>(null);
  const key = `${platform ?? ''}|${trimmed}`;

  useEffect(() => {
    const client = searchClient();
    if (!client || trimmed === '') return;
    let cancelled = false;
    const timer = setTimeout(() => {
      client
        .searchForHits<Record<string, unknown>>({
          requests: [
            {
              indexName: SEARCH_INDEXES.games,
              query: trimmed,
              hitsPerPage: HITS_PER_PAGE,
              ...(platform ? { filters: platformFilter(platform) } : {}),
            },
          ],
        })
        .then(
          ({ results }) => {
            if (cancelled) return;
            const hits = (results[0]?.hits ?? []).flatMap((hit) => {
              const parsed = gameRecordSchema.safeParse(hit);
              return parsed.success ? [parsed.data] : [];
            });
            setResult({ key, state: { status: 'ready', hits } });
          },
          () => {
            if (!cancelled) setResult({ key, state: { status: 'error' } });
          },
        );
    }, GAME_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, trimmed, platform]);

  if (!isSearchConfigured()) return { status: 'notConfigured' };
  if (trimmed === '') return { status: 'idle' };
  return result?.key === key ? result.state : { status: 'loading' };
}
