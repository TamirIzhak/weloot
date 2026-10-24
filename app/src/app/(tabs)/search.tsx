import { useTranslation } from 'react-i18next';

import { LocationChip } from '@/features/location/LocationChip';
import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';

/** Search tab: placeholder until its feature issue lands (docs/BACKLOG.md). */
export default function SearchTab() {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      testID="search-screen"
      title={t('tabs.search')}
      body={t('placeholders.search')}
    >
      <LocationChip />
    </PlaceholderScreen>
  );
}
