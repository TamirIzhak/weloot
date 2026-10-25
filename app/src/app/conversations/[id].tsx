import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';

/** A conversation. The chat screen itself arrives with #25. */
export default function ConversationScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: t('offers.chat.title') }} />
      <PlaceholderScreen
        testID={`conversation-${id}`}
        title={t('offers.chat.title')}
        body={t('offers.chat.soon')}
      />
    </>
  );
}
