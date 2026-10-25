import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { WantlistScreen } from '@/features/wantlist/WantlistScreen';
import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';

/** The user's lists from the Profile tab: Want list (#20), and Alerts until #49 lands. */
export default function MySection() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { section } = useLocalSearchParams<{ section: string }>();
  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  if (section === 'alerts') {
    return (
      <>
        <Stack.Screen options={{ title: t('profile.games.alerts') }} />
        <PlaceholderScreen
          testID="me-alerts"
          title={t('profile.games.alerts')}
          body={t('profile.games.alertsSoon')}
        />
      </>
    );
  }
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-4 py-4 pb-12">
      <Stack.Screen options={{ title: t('profile.games.wantlist') }} />
      <WantlistScreen uid={auth.user.uid} />
    </ScrollView>
  );
}
