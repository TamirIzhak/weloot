import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { z } from 'zod';

import { PLATFORM_KEYS, PLATFORMS, platformForIgdbId, type Game } from '@weloot/shared';

import type { IgdbClient } from './igdbClient';

// Catalog sync (PRD §5.1): games on the consoles WeLoot supports, from IGDB into `games/{igdbId}`. Pages by id
// (cursor, not offset), writes whole docs (re-runs give the same result), and remembers the newest IGDB
// `updated_at` so the nightly run only fetches what changed.

export const SUPPORTED_IGDB_PLATFORM_IDS: readonly number[] = PLATFORM_KEYS.map(
  (key) => PLATFORMS[key].igdbId,
);

/**
 * IGDB game types that are sold as a game of their own: main game (0), standalone expansion (4), remake (8),
 * remaster (9), expanded game (10), port (11). Excluded: DLC, expansions, bundles, mods, episodes, seasons, forks,
 * packs, updates (PRD §5.1).
 */
export const INCLUDED_GAME_TYPES = [0, 4, 8, 9, 10, 11] as const;

/** IGDB's maximum page size. */
export const PAGE_SIZE = 500;

const MAX_ALT_NAMES = 20;
const MAX_SIMILAR_GAMES = 10;

const named = z.object({ name: z.string().min(1) });
export const igdbGameSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  slug: z.string().min(1),
  platforms: z.array(z.number().int()).default([]),
  cover: z.object({ image_id: z.string().min(1) }).optional(),
  first_release_date: z.number().int().optional(),
  genres: z.array(named).default([]),
  alternative_names: z.array(named).default([]),
  similar_games: z.array(z.number().int()).default([]),
  updated_at: z.number().int(),
});
export type IgdbGame = z.infer<typeof igdbGameSchema>;

/** The Apicalypse query for one page of games after `afterId` (optionally only those updated since). */
export function gamesQuery(afterId: number, updatedSince?: number): string {
  const where = [
    `platforms = (${SUPPORTED_IGDB_PLATFORM_IDS.join(',')})`,
    `game_type = (${INCLUDED_GAME_TYPES.join(',')})`,
    `id > ${afterId}`,
  ];
  if (updatedSince !== undefined) where.push(`updated_at > ${updatedSince}`);
  return [
    'fields id,name,slug,platforms,cover.image_id,first_release_date,genres.name,alternative_names.name,similar_games,updated_at;',
    `where ${where.join(' & ')};`,
    'sort id asc;',
    `limit ${PAGE_SIZE};`,
  ].join(' ');
}

const unique = <T>(values: T[]) => [...new Set(values)];

/** Our `games` doc for an IGDB game, or null when it isn't on a console we support. */
export function toGameDoc(game: IgdbGame): Game | null {
  const platforms = unique(
    game.platforms.flatMap((id) => {
      const key = platformForIgdbId(id);
      return key ? [key] : [];
    }),
  );
  if (platforms.length === 0) return null;
  return {
    title: game.name,
    slug: game.slug,
    platforms,
    platformIds: unique(game.platforms.filter((id) => SUPPORTED_IGDB_PLATFORM_IDS.includes(id))),
    ...(game.cover ? { coverImageId: game.cover.image_id } : {}),
    ...(game.first_release_date !== undefined
      ? { releaseDate: Timestamp.fromMillis(game.first_release_date * 1000) }
      : {}),
    genres: unique(game.genres.map((g) => g.name)),
    altNames: unique(game.alternative_names.map((a) => a.name)).slice(0, MAX_ALT_NAMES),
    similarGameIds: game.similar_games.slice(0, MAX_SIMILAR_GAMES),
    igdbUpdatedAt: game.updated_at,
  };
}

export type SyncMode = 'full' | 'incremental';
export type SyncResult = { mode: SyncMode; fetched: number; written: number; skipped: number };

const stateSchema = z.object({ lastUpdatedAt: z.number().int() });

export async function syncCatalog(
  client: IgdbClient,
  db: Firestore,
  mode: SyncMode,
): Promise<SyncResult> {
  const stateRef = db.collection('system').doc('catalogSync');
  const state = stateSchema.safeParse((await stateRef.get()).data());
  // Without a previous run there's nothing to be incremental from.
  const updatedSince =
    mode === 'incremental' && state.success ? state.data.lastUpdatedAt : undefined;
  let newestUpdatedAt = state.success ? state.data.lastUpdatedAt : 0;

  const writer = db.bulkWriter();
  const result: SyncResult = { mode, fetched: 0, written: 0, skipped: 0 };
  let afterId = 0;
  for (;;) {
    const page = await client.query('games', gamesQuery(afterId, updatedSince));
    result.fetched += page.length;
    for (const row of page) {
      const parsed = igdbGameSchema.safeParse(row);
      const doc = parsed.success ? toGameDoc(parsed.data) : null;
      if (!parsed.success || !doc) {
        result.skipped += 1;
        continue;
      }
      void writer.set(db.collection('games').doc(String(parsed.data.id)), doc);
      result.written += 1;
      newestUpdatedAt = Math.max(newestUpdatedAt, parsed.data.updated_at);
    }
    const last = page.at(-1);
    const lastId = igdbGameSchema.shape.id.safeParse((last as { id?: unknown } | undefined)?.id);
    if (page.length < PAGE_SIZE || !lastId.success) break;
    afterId = lastId.data;
  }
  await writer.close();
  await stateRef.set({
    lastUpdatedAt: newestUpdatedAt,
    lastRunAt: Timestamp.now(),
    lastMode: mode,
    lastWritten: result.written,
  });
  logger.info('catalogSync: done', result);
  return result;
}
