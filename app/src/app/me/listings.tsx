import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { MyListingsScreen } from '@/features/listings/MyListingsScreen';

/** Profile → My listings (#17). */
export default function MyListings() {
  const { t } = useTranslation();
  const auth = useAuth();
  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-4 py-4 pb-12">
      <Stack.Screen options={{ title: t('profile.games.listings') }} />
      <MyListingsScreen uid={auth.user.uid} />
    </ScrollView>
  );
}
