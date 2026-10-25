import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/features/auth/AuthProvider';
import { ConversationScreen } from '@/features/chat/ConversationScreen';

/** A conversation (PRD W5, #25). */
export default function Conversation() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen options={{ title: t('chat.title') }} />
      <ConversationScreen conversationId={id} me={auth.user.uid} />
    </>
  );
}
