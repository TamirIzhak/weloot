import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Listing grid density (PRD §3.3, #57): 1, 2 or 3 tiles per row, default 2, remembered on the device.

export type Density = 1 | 2 | 3;
export const DENSITIES: readonly Density[] = [1, 2, 3];
export const DEFAULT_DENSITY: Density = 2;

/** Pinch scale beyond which a gesture changes density (one step per gesture). */
const PINCH_OUT = 1.15;
const PINCH_IN = 0.87;

/** Pinch out (scale > 1) = bigger tiles = fewer per row; pinch in = more per row. */
export function nextDensity(current: Density, scale: number): Density {
  if (scale >= PINCH_OUT) return Math.max(1, current - 1) as Density;
  if (scale <= PINCH_IN) return Math.min(3, current + 1) as Density;
  return current;
}

type DensityStore = {
  density: Density;
  setDensity: (density: Density) => void;
  /** Index of the first visible item, so a grid reopened at a new density starts at the same place (not saved). */
  anchor: number;
  setAnchor: (index: number) => void;
};

export const useGridDensity = create<DensityStore>()(
  persist(
    (set) => ({
      density: DEFAULT_DENSITY,
      setDensity: (density) => set({ density }),
      anchor: 0,
      setAnchor: (anchor) => set({ anchor }),
    }),
    {
      name: 'weloot.gridDensity',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ density: state.density }),
      merge: (persisted, current) => {
        const density = (persisted as Partial<DensityStore> | undefined)?.density;
        return {
          ...current,
          density: DENSITIES.includes(density as Density) ? (density as Density) : DEFAULT_DENSITY,
        };
      },
    },
  ),
);

/** Layout of a grid at a density for a content width: tile width and the fixed row height (for virtualization). */
export function gridLayout(contentWidth: number, density: Density, gap: number) {
  const tileWidth = (contentWidth - gap * (density - 1)) / density;
  const coverHeight = (tileWidth * 4) / 3;
  const tileHeight =
    density === 1 ? FULL_CARD_HEIGHT : density === 2 ? coverHeight + TILE_INFO_HEIGHT : coverHeight;
  return { tileWidth, tileHeight, rowHeight: tileHeight + gap };
}

/** Full card (1 per row): cover thumbnail beside the details. */
export const FULL_CARD_HEIGHT = 136;
/** Under the cover at 2 per row: two title lines and a row of chips. */
export const TILE_INFO_HEIGHT = 72;
