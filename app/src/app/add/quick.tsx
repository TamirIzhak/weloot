import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { IdentifyScreen } from '@/features/listings/IdentifyScreen';

/** Quick Add from the offer composer (PRD W2): list a game without leaving the offer. */
export default function QuickAdd() {
  const { t } = useTranslation();
  const auth = useAuth();
  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  return (
    <ScrollView
      className="flex-1 bg-bg"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-4 py-4 pb-12"
    >
      <Stack.Screen options={{ title: t('offers.composer.quickAdd') }} />
      <IdentifyScreen />
    </ScrollView>
  );
}
