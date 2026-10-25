import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, View } from 'react-native';

import { Skeleton, Text } from '@/components';
import { ListingTile, type ListingTileData } from '@/features/listings/grid/ListingTile';

/** Carousel cards keep one fixed size (PRD §3.3: the adaptive grid is for vertical feeds only). */
export const CAROUSEL_TILE_WIDTH = 148;
const SKELETONS = [0, 1, 2];

/**
 * A Home carousel: title, "See all", a row of fixed-size listing cards. While loading it shows skeleton cards (real
 * work in progress, PRD §1.2); with nothing to show it shows `empty` (an action), or hides itself when there's none.
 */
export function Carousel({
  title,
  items,
  onSeeAll,
  onPressItem,
  renderAccessory,
  empty,
  testID,
}: {
  title: string;
  /** `null` while loading. */
  items: ListingTileData[] | null;
  onSeeAll?: () => void;
  onPressItem?: (item: ListingTileData) => void;
  renderAccessory?: (item: ListingTileData) => ReactNode;
  empty?: ReactNode;
  testID: string;
}) {
  const { t } = useTranslation();
  if (items && items.length === 0 && !empty) return null;
  return (
    <View className="gap-3" testID={testID}>
      <View className="flex-row items-center justify-between px-4">
        <Text variant="heading">{title}</Text>
        {onSeeAll && items && items.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSeeAll}
            hitSlop={8}
            testID={`${testID}-all`}
          >
            <Text variant="caption" tone="accent" className="font-medium">
              {t('home.seeAll')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {items === null ? (
        <View className="flex-row gap-3 px-4" testID={`${testID}-loading`}>
          {SKELETONS.map((i) => (
            // Card-sized (148 wide, cover 3:4 + info), so nothing jumps when the real ones arrive.
            <Skeleton key={i} className="h-[269px] w-[148px] rounded-card" />
          ))}
        </View>
      ) : items.length === 0 ? (
        <View className="px-4">{empty}</View>
      ) : (
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4"
          renderItem={({ item }) => (
            <ListingTile
              item={item}
              density={2}
              width={CAROUSEL_TILE_WIDTH}
              onPress={onPressItem}
              accessory={renderAccessory?.(item)}
            />
          )}
        />
      )}
    </View>
  );
}
