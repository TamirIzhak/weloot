import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';

/** Game detail placeholder until #19. Not linked yet. */
export default function GameDetail() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('placeholders.gameTitle')} body={t('placeholders.game')} />;
}
