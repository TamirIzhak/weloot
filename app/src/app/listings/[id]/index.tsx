import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ListingDetailScreen } from '@/features/listings/ListingDetailScreen';

/** Game page for one listing (PRD §9-C, #19); open to guests. */
export default function ListingPage() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: t('listings.detail.title') }} />
      <ListingDetailScreen listingId={id} />
    </View>
  );
}
