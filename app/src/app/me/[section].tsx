import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { AlertsScreen } from '@/features/alerts/AlertsScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { WantlistScreen } from '@/features/wantlist/WantlistScreen';

/** The user's lists from the Profile tab: Want list (#20) and Alerts (#49). */
export default function MySection() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { section } = useLocalSearchParams<{ section: string }>();
  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  const alerts = section === 'alerts';
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-4 py-4 pb-12">
      <Stack.Screen
        options={{ title: t(alerts ? 'profile.games.alerts' : 'profile.games.wantlist') }}
      />
      {alerts ? <AlertsScreen uid={auth.user.uid} /> : <WantlistScreen uid={auth.user.uid} />}
    </ScrollView>
  );
}
