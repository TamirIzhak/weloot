import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useAddDraft } from '@/features/listings/addDraft';
import { ListingForm } from '@/features/listings/ListingForm';

/** Add flow: location, details and publish (PRD W2), after the game was identified on the + tab. */
export default function AddDetails() {
  const { t } = useTranslation();
  const auth = useAuth();
  const game = useAddDraft((s) => s.game);
  if (auth.status !== 'signedIn' || !game) return <Redirect href="/add" />;
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: t('listings.form.title') }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-4 py-4 pb-12">
        <ListingForm uid={auth.user.uid} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
