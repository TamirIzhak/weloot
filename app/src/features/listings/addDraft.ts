import { create } from 'zustand';

import type { GameRecord, PlatformKey } from '@weloot/shared';

/** The game being listed, as picked in the Identify step (PRD W2 step 1). */
export type DraftGame = {
  igdbGameId: number;
  title: string;
  coverImageId?: string;
  platforms: PlatformKey[];
};

export function draftGameFrom(record: GameRecord): DraftGame {
  return {
    igdbGameId: Number(record.objectID),
    title: record.title,
    ...(record.coverImageId ? { coverImageId: record.coverImageId } : {}),
    platforms: record.platforms,
  };
}

type AddDraftStore = {
  game: DraftGame | null;
  platform: PlatformKey | null;
  /** The scanned barcode, when the game was identified by scanning. */
  ean: string | null;
  setIdentified: (game: DraftGame, platform: PlatformKey, ean: string | null) => void;
  reset: () => void;
};

/** The listing being added, step by step (Identify → Location → Details → Photos). In memory only. */
export const useAddDraft = create<AddDraftStore>((set) => ({
  game: null,
  platform: null,
  ean: null,
  setIdentified: (game, platform, ean) => set({ game, platform, ean }),
  reset: () => set({ game: null, platform: null, ean: null }),
}));
