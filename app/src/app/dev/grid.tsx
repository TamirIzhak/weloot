import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { CONDITIONS, PLATFORM_KEYS } from '@weloot/shared';

import { DensityToggle, ListingGrid } from '@/features/listings/grid/ListingGrid';
import type { ListingTileData } from '@/features/listings/grid/ListingTile';

// Development only: 150 sample tiles to check the adaptive grid (pinch, toggle, scroll position, RTL) before real
// listings exist. Never shown to users (PRD §1.2: no fake listings in the product).
const SAMPLE_TITLES = [
  'Elden Ring',
  'Zelda: Tears of the Kingdom',
  'Spider-Man 2',
  'Halo Infinite',
  'FC 25',
];
const SAMPLES: ListingTileData[] = Array.from({ length: 150 }, (_, i) => ({
  id: `sample-${i}`,
  gameTitle: `${SAMPLE_TITLES[i % SAMPLE_TITLES.length] ?? ''} #${i + 1}`,
  platform: PLATFORM_KEYS[i % PLATFORM_KEYS.length] ?? 'ps5',
  hasPhotos: i % 4 === 0,
  condition: CONDITIONS[i % CONDITIONS.length] ?? 'good',
  isForTrade: i % 3 !== 0,
  isForSale: i % 2 === 0,
  ...(i % 2 === 0 ? { askingPriceAgorot: (50 + (i % 10) * 20) * 100 } : {}),
  areaName: i % 2 === 0 ? 'Tel Aviv - Yafo' : 'Haifa',
  distanceKm: (i % 30) + 0.4,
}));

export default function DevGrid() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: t('listings.grid.devTitle'), headerShown: true }} />
      <View className="px-4 py-2">
        <DensityToggle />
      </View>
      <ListingGrid items={SAMPLES} />
    </View>
  );
}
