import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { REPORT_TARGETS, type ReportTarget } from '@weloot/shared';

import { useAuth } from '@/features/auth/AuthProvider';
import { ReportScreen } from '@/features/safety/ReportScreen';

/** Report a user, message or deal (PRD W9, #37). Listings have their own route next to the game page. */
export default function Report() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const { targetType, targetId } = useLocalSearchParams<{ targetType: string; targetId: string }>();
  if (
    auth.status !== 'signedIn' ||
    !REPORT_TARGETS.includes(targetType as ReportTarget) ||
    !targetId
  ) {
    return <Redirect href="/" />;
  }
  return (
    <ScrollView
      className="flex-1 bg-bg"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-4 py-4 pb-12"
    >
      <Stack.Screen options={{ title: t('safety.report.title') }} />
      <ReportScreen
        targetType={targetType as ReportTarget}
        targetId={targetId}
        onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </ScrollView>
  );
}
