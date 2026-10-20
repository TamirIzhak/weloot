import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';

/** Profile tab: placeholder until its feature issue lands (docs/BACKLOG.md). */
export default function ProfileTab() {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      testID="profile-screen"
      title={t('tabs.profile')}
      body={t('placeholders.profile')}
    />
  );
}
