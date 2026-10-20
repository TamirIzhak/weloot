import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';

/** Add tab: placeholder until its feature issue lands (docs/BACKLOG.md). */
export default function AddTab() {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen testID="add-screen" title={t('tabs.add')} body={t('placeholders.add')} />
  );
}
