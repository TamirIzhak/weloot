import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components';
import { GameSearch } from '@/features/catalog/GameSearch';
import { LocationChip } from '@/features/location/LocationChip';
import { useHideOnScroll, useTabBarInset } from '@/navigation/TabBarVisibility';

/** Search tab: game search over the catalog for now; listings near you arrive with #18. */
export default function SearchTab() {
  const { t } = useTranslation();
  const onScroll = useHideOnScroll();
  const bottomInset = useTabBarInset();
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']} testID="search-screen">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-4 px-4 pt-2"
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <View className="gap-3">
          <Text variant="heading">{t('tabs.search')}</Text>
          <LocationChip />
        </View>
        <GameSearch />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
