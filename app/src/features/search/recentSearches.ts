import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** How many recent searches the empty Search tab offers. */
export const MAX_RECENT_SEARCHES = 8;

type RecentSearchesStore = {
  queries: string[];
  add: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
};

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** Recent search texts, newest first, kept on this device only (PRD W4: shown when the query is empty). */
export const useRecentSearches = create<RecentSearchesStore>()(
  persist(
    (set) => ({
      queries: [],
      add: (query) => {
        const trimmed = query.trim().replace(/\s+/g, ' ');
        if (trimmed.length < 2) return;
        set((s) => ({
          queries: [trimmed, ...s.queries.filter((q) => !same(q, trimmed))].slice(
            0,
            MAX_RECENT_SEARCHES,
          ),
        }));
      },
      remove: (query) => set((s) => ({ queries: s.queries.filter((q) => q !== query) })),
      clear: () => set({ queries: [] }),
    }),
    { name: 'weloot.recentSearches', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
