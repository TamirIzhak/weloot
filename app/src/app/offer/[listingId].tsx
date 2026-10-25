import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { OfferComposer } from '@/features/offers/OfferComposer';

/** Make an offer, or counter one (PRD W5, #24). */
export default function ComposeOffer() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { listingId, conversationId, counter } = useLocalSearchParams<{
    listingId: string;
    conversationId?: string;
    counter?: string;
  }>();
  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{ title: t(counter ? 'offers.composer.counterTitle' : 'offers.composer.title') }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-4 py-4 pb-12">
        <OfferComposer
          me={auth.user.uid}
          listingId={listingId}
          {...(conversationId ? { conversationId } : {})}
          {...(counter ? { counterOfferId: counter } : {})}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
