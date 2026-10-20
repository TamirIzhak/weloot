import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Keyboard } from 'react-native';
import {
  useAnimatedScrollHandler,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { INITIAL_SCROLL_STATE, nextScrollState, type ScrollTrackerState } from './hideOnScroll';

/** Height of the tab bar row above the bottom safe area. */
export const TAB_BAR_HEIGHT = 64;

type TabBarVisibility = {
  /** 1 when the tab bar is hidden, 0 when shown. Read on the UI thread by the tab bar. */
  hidden: SharedValue<number>;
  /** Per-list scroll tracking for the list currently driving the bar. */
  scrollState: SharedValue<ScrollTrackerState>;
  show: () => void;
};

const TabBarVisibilityContext = createContext<TabBarVisibility | null>(null);

/** Owns the tab bar's hidden state. Wraps the tab navigator. */
export function TabBarVisibilityProvider({ children }: { children: ReactNode }) {
  const hidden = useSharedValue(0);
  const scrollState = useSharedValue<ScrollTrackerState>(INITIAL_SCROLL_STATE);

  const value = useMemo<TabBarVisibility>(
    () => ({
      hidden,
      scrollState,
      show: () => {
        hidden.set(0);
        scrollState.set(INITIAL_SCROLL_STATE);
      },
    }),
    [hidden, scrollState],
  );

  // PRD §3.4: the bar comes back when the keyboard closes.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', value.show);
    return () => sub.remove();
  }, [value]);

  return (
    <TabBarVisibilityContext.Provider value={value}>{children}</TabBarVisibilityContext.Provider>
  );
}

export function useTabBarVisibility(): TabBarVisibility {
  const ctx = useContext(TabBarVisibilityContext);
  if (!ctx) throw new Error('useTabBarVisibility must be used inside <TabBarVisibilityProvider>');
  return ctx;
}

/**
 * Hide-on-scroll for a feed: pass the returned handler to an `Animated.FlatList` / `Animated.ScrollView`
 * `onScroll` (with `scrollEventThrottle={16}`). Screens that don't use it keep the bar visible.
 */
export function useHideOnScroll() {
  const { hidden, scrollState } = useTabBarVisibility();
  return useAnimatedScrollHandler({
    onScroll: (event) => {
      const next = nextScrollState(scrollState.get(), {
        y: event.contentOffset.y,
        contentHeight: event.contentSize.height,
        viewportHeight: event.layoutMeasurement.height,
      });
      scrollState.set(next);
      hidden.set(next.hidden ? 1 : 0);
    },
  });
}

/** Bottom padding that keeps the last item of a list clear of the (visible) tab bar. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom + 16;
}
