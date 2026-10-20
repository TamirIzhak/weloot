import { getAuth, signOut } from '@react-native-firebase/auth';
import { useTranslation } from 'react-i18next';

import { Button, useToast } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRequireAuth } from '@/features/auth/authGate';
import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';

/**
 * Profile tab. Guests get a "Join WeLoot" invitation (PRD W1); signed-in users get a placeholder until #10, with
 * sign out here for now so sign-in can be tested repeatedly.
 */
export default function ProfileTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const auth = useAuth();
  const requireAuth = useRequireAuth();

  if (auth.status !== 'signedIn') {
    return (
      <PlaceholderScreen
        testID="profile-guest"
        title={t('profile.join.title')}
        body={t('profile.join.body')}
      >
        <Button
          label={t('profile.join.cta')}
          onPress={() => requireAuth('profile', () => undefined)}
          testID="join-weloot"
        />
      </PlaceholderScreen>
    );
  }

  return (
    <PlaceholderScreen
      testID="profile-screen"
      title={t('tabs.profile')}
      body={t('placeholders.profile')}
    >
      <Button
        variant="secondary"
        label={t('auth.signOut')}
        onPress={() => {
          signOut(getAuth()).catch(() => toast.show(t('auth.errors.generic'), 'error'));
        }}
        testID="sign-out"
      />
    </PlaceholderScreen>
  );
}
