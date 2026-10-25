import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { InboxScreen } from '@/features/inbox/InboxScreen';

/** Inbox tab (#26). Guests are asked to sign in by the tab bar before they get here. */
export default function InboxTab() {
  const { t } = useTranslation();
  const auth = useAuth();
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']} testID="inbox-screen">
      <View className="px-4 pt-2">
        <Text variant="heading">{t('tabs.inbox')}</Text>
      </View>
      {auth.status === 'signedIn' ? <InboxScreen me={auth.user.uid} /> : null}
    </SafeAreaView>
  );
}
