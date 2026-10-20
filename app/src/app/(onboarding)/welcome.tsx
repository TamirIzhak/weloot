import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';

/** Placeholder entry of the onboarding group until phone sign-in (#8) replaces it. Not linked yet. */
export default function Welcome() {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      title={t('placeholders.onboardingTitle')}
      body={t('placeholders.onboarding')}
    />
  );
}
