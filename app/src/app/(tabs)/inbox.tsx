import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';

/** Inbox tab: placeholder until its feature issue lands (docs/BACKLOG.md). */
export default function InboxTab() {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      testID="inbox-screen"
      title={t('tabs.inbox')}
      body={t('placeholders.inbox')}
    />
  );
}
