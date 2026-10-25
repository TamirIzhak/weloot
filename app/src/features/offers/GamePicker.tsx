import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { PLATFORMS } from '@weloot/shared';

import { cn, Text } from '@/components';
import { coverUrl } from '@/features/catalog/igdbImages';
import type { Listing } from '@/features/listings/useListing';
import { colors } from '@/theme/tokens';

const CARD_WIDTH = 104;

/**
 * A horizontal picker of someone's active listings for an offer (PRD W5): tap to include or leave out. An optional
 * last card adds a game on the spot (Quick Add).
 */
export function GamePicker({
  listings,
  selected,
  onToggle,
  onQuickAdd,
  testID,
}: {
  listings: Listing[];
  selected: ReadonlySet<string>;
  onToggle: (listingId: string) => void;
  onQuickAdd?: () => void;
  testID: string;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-3"
      testID={testID}
    >
      {listings.map((listing) => {
        const on = selected.has(listing.id);
        return (
          <Pressable
            key={listing.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${listing.gameTitle}, ${PLATFORMS[listing.platform].label}`}
            onPress={() => onToggle(listing.id)}
            style={{ width: CARD_WIDTH }}
            className={cn(
              'gap-1.5 rounded-card border-2 p-1',
              on ? 'border-primary' : 'border-transparent',
            )}
            testID={`${testID}-${listing.id}`}
          >
            <View
              className="overflow-hidden rounded-button bg-surface-raised"
              style={{ height: (CARD_WIDTH * 4) / 3 }}
            >
              {listing.coverImageId ? (
                <Image
                  source={coverUrl(listing.coverImageId, 'cover_big')}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              ) : null}
              {on ? (
                <View className="absolute end-1 top-1 rounded-chip bg-primary p-0.5">
                  <Ionicons name="checkmark" size={14} color={colors['text-primary']} />
                </View>
              ) : null}
            </View>
            <Text variant="caption" numberOfLines={2}>
              {listing.gameTitle}
            </Text>
            <Text variant="caption" tone="muted">
              {PLATFORMS[listing.platform].label}
            </Text>
          </Pressable>
        );
      })}
      {onQuickAdd ? (
        <Pressable
          accessibilityRole="button"
          onPress={onQuickAdd}
          style={{ width: CARD_WIDTH, height: (CARD_WIDTH * 4) / 3 }}
          className="items-center justify-center gap-1 rounded-card border border-dashed border-border"
          testID={`${testID}-quick-add`}
        >
          <Ionicons name="add" size={24} color={colors.accent} />
          <Text variant="caption" tone="accent" className="font-medium">
            {t('offers.composer.quickAdd')}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
