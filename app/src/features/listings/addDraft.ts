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
  /**
   * Quick Add (PRD W2, from the offer composer): the same flow as a modal that returns the new listing instead of
   * showing the success screen.
   */
  quick: boolean;
  startQuick: () => void;
  /** The listing a Quick Add just published, until the composer takes it. */
  quickResult: string | null;
  finishQuick: (listingId: string) => void;
  takeQuickResult: () => string | null;
};

/** The listing being added, step by step (Identify → Location → Details → Photos). In memory only. */
export const useAddDraft = create<AddDraftStore>((set, get) => ({
  game: null,
  platform: null,
  ean: null,
  setIdentified: (game, platform, ean) => set({ game, platform, ean }),
  reset: () => set({ game: null, platform: null, ean: null, quick: false }),
  quick: false,
  startQuick: () => set({ game: null, platform: null, ean: null, quick: true, quickResult: null }),
  quickResult: null,
  finishQuick: (listingId) =>
    set({ game: null, platform: null, ean: null, quick: false, quickResult: listingId }),
  takeQuickResult: () => {
    const result = get().quickResult;
    if (result) set({ quickResult: null });
    return result;
  },
}));
