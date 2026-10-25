import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { ReportScreen } from '@/features/safety/ReportScreen';

/** Report a listing (PRD W9). */
export default function ReportListing() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-4 py-4 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: t('safety.report.title') }} />
      <ReportScreen
        targetType="listing"
        targetId={id}
        onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </ScrollView>
  );
}
