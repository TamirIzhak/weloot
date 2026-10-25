import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { PhotosScreen } from '@/features/listings/PhotosScreen';

/** A listing's photos (PRD W2): after publishing, or later from My listings (#17). */
export default function ListingPhotos() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-4 py-4 pb-12">
      <Stack.Screen options={{ title: t('listings.photos.title') }} />
      <PhotosScreen
        listingId={id}
        onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </ScrollView>
  );
}
