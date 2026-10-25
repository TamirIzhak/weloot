import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { PLATFORMS, type Condition, type PlatformKey } from '@weloot/shared';

import { Badge, Chip, cn, Text } from '@/components';
import { coverUrl } from '@/features/catalog/igdbImages';
import { currentLanguage, formatNumber, formatPrice } from '@/i18n';
import { colors } from '@/theme/tokens';

import { FULL_CARD_HEIGHT, TILE_INFO_HEIGHT, type Density } from './density';

/** What a listing tile shows (from the listings search index, #18, or Firestore). */
export type ListingTileData = {
  id: string;
  igdbGameId: number;
  gameTitle: string;
  platform: PlatformKey;
  coverImageId?: string;
  /** The owner's first photo, when the listing has photos (shown instead of the cover). */
  photoUrl?: string;
  hasPhotos: boolean;
  condition: Condition;
  isForTrade: boolean;
  isForSale: boolean;
  askingPriceAgorot?: number;
  areaName?: string;
  distanceKm?: number;
};

const FAMILY_STRIP: Record<string, string> = {
  ps: 'bg-ps',
  xbox: 'bg-xbox',
  nintendo: 'bg-nintendo',
};

/** Price, "Trade", or both ("Trade · ₪150"). */
function useOfferLabel(item: ListingTileData): string {
  const { t } = useTranslation();
  const language = currentLanguage();
  return [
    item.isForTrade ? t('listings.form.forTrade') : null,
    item.isForSale && item.askingPriceAgorot !== undefined
      ? formatPrice(item.askingPriceAgorot, language)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * One listing in the adaptive grid (PRD §3.3). Content adapts to density; every density has the same screen-reader
 * label (title, platform, condition, offer, distance).
 */
export function ListingTile({
  item,
  density,
  width,
  onPress,
  accessory,
}: {
  item: ListingTileData;
  density: Density;
  width: number;
  onPress?: (item: ListingTileData) => void;
  /** A control on the tile's top-end corner (e.g. the want list heart), reachable on its own by screen readers. */
  accessory?: ReactNode;
}) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const offer = useOfferLabel(item);
  const distance =
    item.distanceKm !== undefined
      ? t('listings.tile.distance', {
          km: formatNumber(Math.max(1, Math.round(item.distanceKm)), language),
        })
      : undefined;
  const label = [
    item.gameTitle,
    PLATFORMS[item.platform].label,
    t(`listings.condition.${item.condition}`),
    offer,
    item.hasPhotos ? t('listings.photos.badge') : null,
    [item.areaName, distance].filter(Boolean).join(', ') || null,
  ]
    .filter(Boolean)
    .join(', ');

  const image =
    item.photoUrl ?? (item.coverImageId ? coverUrl(item.coverImageId, 'cover_big') : undefined);
  const cover = (
    <View className="flex-1 overflow-hidden rounded-card bg-surface-raised">
      {image ? (
        <Image
          source={image}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          recyclingKey={item.id}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <Ionicons name="game-controller-outline" size={28} color={colors['text-muted']} />
        </View>
      )}
    </View>
  );

  let content;
  if (density === 1) {
    content = (
      <View
        className="flex-row gap-3 rounded-card bg-surface p-2"
        style={{ height: FULL_CARD_HEIGHT }}
      >
        <View style={{ width: 90 }}>{cover}</View>
        <View className="flex-1 justify-between py-1">
          <View className="gap-1">
            <Text className="font-medium" numberOfLines={2}>
              {item.gameTitle}
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              <Chip
                platform={PLATFORMS[item.platform].family}
                label={PLATFORMS[item.platform].label}
              />
              {item.hasPhotos ? <Badge tone="accent" label={t('listings.photos.badge')} /> : null}
            </View>
            <Text variant="caption" tone="secondary">
              {t(`listings.condition.${item.condition}`)}
            </Text>
          </View>
          <View className="flex-row items-center justify-between gap-2">
            <Text className="font-medium" tone="accent">
              {offer}
            </Text>
            {item.areaName || distance ? (
              <Text variant="caption" tone="muted" numberOfLines={1} className="shrink">
                {[item.areaName, distance].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  } else if (density === 2) {
    content = (
      <View className="gap-1.5">
        <View style={{ height: (width * 4) / 3 }}>
          {cover}
          {item.hasPhotos ? (
            <View className="absolute start-1.5 top-1.5">
              <Badge tone="accent" label={t('listings.photos.badge')} />
            </View>
          ) : null}
        </View>
        <View style={{ height: TILE_INFO_HEIGHT - 6 }} className="gap-1">
          <Text variant="caption" className="font-medium" numberOfLines={2}>
            {item.gameTitle}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Chip
              platform={PLATFORMS[item.platform].family}
              label={PLATFORMS[item.platform].label}
            />
            <Text variant="caption" tone="accent" numberOfLines={1} className="flex-1">
              {offer}
            </Text>
          </View>
        </View>
      </View>
    );
  } else {
    content = (
      <View style={{ height: (width * 4) / 3 }}>
        {cover}
        <View
          className={cn(
            'absolute inset-x-0 top-0 h-1 rounded-t-card',
            FAMILY_STRIP[PLATFORMS[item.platform].family],
          )}
        />
        <View className="absolute bottom-1.5 start-1.5 rounded-chip bg-bg/80 px-1.5 py-0.5">
          <Text variant="caption" className="font-medium" numberOfLines={1}>
            {offer}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ width }}>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress ? () => onPress(item) : undefined}
        disabled={!onPress}
        testID={`listing-tile-${item.id}`}
      >
        {content}
      </Pressable>
      {accessory ? <View className="absolute end-1.5 top-1.5">{accessory}</View> : null}
    </View>
  );
}
