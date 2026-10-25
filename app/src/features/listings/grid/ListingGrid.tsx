import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useId, useState, type ComponentProps, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, useWindowDimensions, View, type ListViewToken } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { cn } from '@/components';
import { colors } from '@/theme/tokens';

import { DENSITIES, gridLayout, nextDensity, useGridDensity, type Density } from './density';
import { ListingTile, type ListingTileData } from './ListingTile';

const GAP = 12;
const SIDE_PADDING = 16;

const DENSITY_ICONS: Record<Density, ComponentProps<typeof Ionicons>['name']> = {
  1: 'list-outline',
  2: 'grid-outline',
  3: 'apps-outline',
};

/**
 * Remembers a grid's first visible item. FlatList reports items (not rows) even with several columns. Created once
 * per grid (FlatList doesn't allow a new callback on the fly).
 */
function anchorTracker(gridId: string) {
  return ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems[0]?.index;
    if (typeof first === 'number') useGridDensity.getState().setAnchor(gridId, first);
  };
}

/** The 1/2/3 layout toggle shown above each feed (pinch alone isn't discoverable or accessible). */
export function DensityToggle() {
  const { t } = useTranslation();
  const density = useGridDensity((s) => s.density);
  const setDensity = useGridDensity((s) => s.setDensity);
  return (
    <View
      className="flex-row gap-1 self-end rounded-chip bg-surface p-1"
      accessibilityRole="radiogroup"
    >
      {DENSITIES.map((d) => (
        <Pressable
          key={d}
          accessibilityRole="radio"
          accessibilityState={{ checked: density === d }}
          accessibilityLabel={t('listings.grid.perRow', { n: d })}
          onPress={() => setDensity(d)}
          hitSlop={4}
          className={cn('rounded-chip px-2.5 py-1.5', density === d && 'bg-primary')}
          testID={`density-${d}`}
        >
          <Ionicons
            name={DENSITY_ICONS[d]}
            size={18}
            color={density === d ? colors['text-primary'] : colors['text-secondary']}
          />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Adaptive listing grid (PRD §3.3, #57): 1, 2 or 3 tiles per row (default 2), changed with the toggle or a pinch (one
 * step per gesture). Virtualized with fixed row heights, so switching density reopens at the same row. Columns
 * fill start → end, which mirrors in RTL.
 */
export function ListingGrid({
  items,
  onPressItem,
  onScroll,
  onEndReached,
  ListEmptyComponent,
  ListFooterComponent,
  bottomInset = 0,
  testID = 'listing-grid',
}: {
  items: ListingTileData[];
  onPressItem?: (item: ListingTileData) => void;
  /** E.g. `useHideOnScroll()` (the list is an `Animated.FlatList`). */
  onScroll?: ComponentProps<typeof Animated.FlatList>['onScroll'];
  onEndReached?: () => void;
  ListEmptyComponent?: ReactElement;
  ListFooterComponent?: ReactElement;
  /** Space after the last row, e.g. to clear the tab bar. */
  bottomInset?: number;
  testID?: string;
}) {
  const { width } = useWindowDimensions();
  const density = useGridDensity((s) => s.density);
  const setDensity = useGridDensity((s) => s.setDensity);
  const gridId = useId();
  const [onViewableItemsChanged] = useState(() => anchorTracker(gridId));
  useEffect(() => () => useGridDensity.getState().forgetAnchor(gridId), [gridId]);
  const layout = gridLayout(width - SIDE_PADDING * 2, density, GAP);
  // Used once per FlatList mount (it remounts on every density change): start at this grid's last first-visible row.
  const rows = Math.ceil(items.length / density);
  const startRow = Math.min(
    Math.floor((useGridDensity.getState().anchors[gridId] ?? 0) / density),
    Math.max(0, rows - 1),
  );

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onEnd((event) => setDensity(nextDensity(density, event.scale)));

  return (
    <GestureDetector gesture={pinch}>
      <Animated.FlatList
        // A new list per density: FlatList can't change its column count in place.
        key={`density-${density}`}
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={density}
        renderItem={({ item }) => (
          <ListingTile
            item={item}
            density={density}
            width={layout.tileWidth}
            onPress={onPressItem}
          />
        )}
        columnWrapperStyle={density > 1 ? { gap: GAP } : undefined}
        contentContainerStyle={{
          paddingHorizontal: SIDE_PADDING,
          gap: GAP,
          paddingBottom: bottomInset,
        }}
        getItemLayout={(_, index) => ({
          length: layout.rowHeight,
          offset: layout.rowHeight * index,
          index,
        })}
        initialScrollIndex={startRow}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        windowSize={7}
        removeClippedSubviews
        testID={testID}
      />
    </GestureDetector>
  );
}
