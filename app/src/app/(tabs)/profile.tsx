import { getAuth, signOut } from '@react-native-firebase/auth';
import { useTranslation } from 'react-i18next';

import { Button, useToast } from '@/components';
import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';

/** Profile tab: placeholder until #10. Sign out lives here for now so sign-in can be tested repeatedly. */
export default function ProfileTab() {
  const { t } = useTranslation();
  const toast = useToast();
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
