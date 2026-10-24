import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';

/** The user's lists from the Profile tab, until their issues land: My listings (#17), Want list (#20), Alerts (#49). */
const SECTIONS = {
  listings: { title: 'profile.games.listings', body: 'profile.games.listingsSoon' },
  wantlist: { title: 'profile.games.wantlist', body: 'profile.games.wantlistSoon' },
  alerts: { title: 'profile.games.alerts', body: 'profile.games.alertsSoon' },
} as const;

export default function MySection() {
  const { t } = useTranslation();
  const { section } = useLocalSearchParams<{ section: string }>();
  const keys = SECTIONS[section as keyof typeof SECTIONS] ?? SECTIONS.listings;
  return (
    <>
      <Stack.Screen options={{ title: t(keys.title) }} />
      <PlaceholderScreen testID={`me-${section}`} title={t(keys.title)} body={t(keys.body)} />
    </>
  );
}
