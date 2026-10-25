import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { BlockedUsersScreen } from '@/features/safety/BlockedUsersScreen';

/** Settings → Blocked users (#37). */
export default function BlockedUsers() {
  const { t } = useTranslation();
  const auth = useAuth();
  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-4 py-4 pb-12">
      <Stack.Screen options={{ title: t('safety.blocked.title') }} />
      <BlockedUsersScreen uid={auth.user.uid} />
    </ScrollView>
  );
}
