import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { findCity, snapToArea } from '@weloot/shared';

/**
 * Where distances on Home and Search are measured from (PRD W1 "Browsing location"). Kept on the device only, for
 * guests too. Always area-level: a device position is snapped to the ~1 km grid before it's stored.
 */
export type BrowsingLocation = {
  source: 'device' | 'city' | 'saved';
  lat: number;
  lng: number;
  /** Locality, named in the reader's language. */
  cityId: string;
  /** For a saved address: its label ("Home"). */
  label?: string;
};

type BrowsingLocationStore = {
  location: BrowsingLocation | null;
  setLocation: (location: BrowsingLocation) => void;
  clear: () => void;
};

export const useBrowsingLocation = create<BrowsingLocationStore>()(
  persist(
    (set) => ({
      location: null,
      setLocation: (location) => {
        const { lat, lng } = snapToArea(location.lat, location.lng);
        set({ location: { ...location, lat, lng } });
      },
      clear: () => set({ location: null }),
    }),
    {
      name: 'weloot.browsingLocation',
      storage: createJSONStorage(() => AsyncStorage),
      // Drop a stored location whose locality no longer exists (e.g. after a CBS list update).
      merge: (persisted, current) => {
        const location = (persisted as Partial<BrowsingLocationStore> | undefined)?.location;
        return { ...current, location: location && findCity(location.cityId) ? location : null };
      },
    },
  ),
);

/** The chip text: the saved address label, or the locality in the reader's language. */
export function browsingLocationName(location: BrowsingLocation, language: 'en' | 'he'): string {
  if (location.source === 'saved' && location.label) return location.label;
  return findCity(location.cityId)?.[language] ?? '';
}
