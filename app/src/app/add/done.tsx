import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components';
import { colors } from '@/theme/tokens';

/** After publishing (PRD W2): success, the one-time photo nudge, and what next. */
export default function AddDone() {
  const { t } = useTranslation();
  const router = useRouter();
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  return (
    <SafeAreaView className="flex-1 justify-center gap-6 bg-bg px-6" testID="add-done">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="items-center gap-3">
        <Ionicons name="checkmark-circle" size={64} color={colors.success} />
        <Text variant="title" className="text-center">
          {t('listings.done.title')}
        </Text>
        <Text tone="secondary" className="text-center">
          {t('listings.done.body')}
        </Text>
      </View>
      <Card className="gap-1 p-4">
        <Text className="font-medium">{t('listings.done.photoNudgeTitle')}</Text>
        <Text tone="secondary">{t('listings.done.photoNudgeBody')}</Text>
        <Button
          label={t('listings.done.addPhotos')}
          onPress={() =>
            router.replace({ pathname: '/listings/[id]/photos', params: { id: listingId } })
          }
          testID="add-photos"
          className="mt-2"
        />
      </Card>
      <View className="gap-3">
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          label={t('listings.done.another')}
          onPress={() => router.replace('/add')}
          testID="list-another"
        />
        <Button
          variant="ghost"
          fullWidth
          label={t('listings.done.finish')}
          onPress={() => router.replace('/')}
          testID="done-finish"
        />
      </View>
    </SafeAreaView>
  );
}
