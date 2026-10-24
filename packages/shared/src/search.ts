import { z } from 'zod';

import { PLATFORM_KEYS, type PlatformKey } from './enums';
import type { Game } from './schemas';

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
