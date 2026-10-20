import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components';
import { colors } from '@/theme/tokens';

import { TAB_BAR_HEIGHT, useTabBarVisibility } from './TabBarVisibility';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Tab routes in display order (PRD §9-B). In RTL the row mirrors automatically. */
export const TABS = [
  { name: 'index', labelKey: 'tabs.home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'search', labelKey: 'tabs.search', icon: 'search-outline', activeIcon: 'search' },
  { name: 'add', labelKey: 'tabs.add', icon: 'add', activeIcon: 'add' },
  { name: 'inbox', labelKey: 'tabs.inbox', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
  { name: 'profile', labelKey: 'tabs.profile', icon: 'person-outline', activeIcon: 'person' },
] as const satisfies readonly {
  name: string;
  labelKey: string;
  icon: IconName;
  activeIcon: IconName;
}[];

const ANIMATION_MS = 200;

/**
 * Bottom tab bar (PRD §3.4): 5 destinations with an elevated center "+", absolutely positioned so it can slide
 * away while a feed scrolls down (useHideOnScroll) and come straight back on any scroll up.
 */
export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { hidden, show } = useTabBarVisibility();
  const fullHeight = TAB_BAR_HEIGHT + insets.bottom;

  // Switching tabs always brings the bar back.
  useEffect(() => {
    show();
  }, [state.index, show]);

  // Same contract as the default tab bar: listeners may prevent the switch; pressing the active tab is a no-op.
  const pressTab = (routeKey: string, focused: boolean) => {
    const event = emitter.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigateToTab(routeKey);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(hidden.get() * fullHeight, { duration: ANIMATION_MS }) }],
  }));

  return (
    <Animated.View
      style={[animatedStyle, { height: fullHeight, paddingBottom: insets.bottom }]}
      className="absolute bottom-0 start-0 end-0 flex-row items-center border-t border-border bg-surface"
      accessibilityRole="tablist"
      testID="tab-bar"
    >
      {TABS.map((tab) => {
        const index = state.routes.findIndex((route) => route.name === tab.name);
        const route = state.routes[index];
        if (!route) return null;
        const focused = state.index === index;
        const label = t(tab.labelKey);

        const onPress = () => pressTab(route.key, focused);

        if (tab.name === 'add') {
          return (
            <View key={tab.name} className="flex-1 items-center">
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: focused }}
                onPress={onPress}
                testID={`tab-${tab.name}`}
                className="-mt-6 h-14 w-14 items-center justify-center rounded-chip bg-primary active:bg-primary-pressed"
                style={{ elevation: 6 }}
              >
                <Ionicons name={tab.icon} size={30} color={colors['on-primary']} />
              </Pressable>
            </View>
          );
        }

        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            testID={`tab-${tab.name}`}
            className="flex-1 items-center justify-center gap-0.5 py-2"
          >
            <Ionicons
              name={focused ? tab.activeIcon : tab.icon}
              size={24}
              color={focused ? colors.accent : colors['text-secondary']}
            />
            <Text
              variant="caption"
              className={focused ? 'text-accent text-[11px]' : 'text-text-secondary text-[11px]'}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}
