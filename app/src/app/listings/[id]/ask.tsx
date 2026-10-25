import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { QuestionComposer } from '@/features/offers/QuestionComposer';

/** Ask the owner a question about a listing (PRD W5, #24). */
export default function AskQuestion() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  return (
    <ScrollView
      className="flex-1 bg-bg"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-4 py-4 pb-12"
    >
      <Stack.Screen options={{ title: t('offers.question.title') }} />
      <QuestionComposer listingId={id} />
    </ScrollView>
  );
}
