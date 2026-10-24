import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { Text } from '@/components';
import { currentLanguage } from '@/i18n';
import { colors } from '@/theme/tokens';

import { browsingLocationName, useBrowsingLocation } from './browsingLocation';

/** "Near: Haifa" chip on Home and Search; opens the browsing location picker (PRD W1). */
export function LocationChip() {
  const { t } = useTranslation();
  const router = useRouter();
  const location = useBrowsingLocation((s) => s.location);
  const label = location
    ? t('location.chip.near', { place: browsingLocationName(location, currentLanguage()) })
    : t('location.chip.choose');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('location.chip.hint')}
      onPress={() => router.push('/location')}
      className="flex-row items-center gap-1.5 self-start rounded-chip border border-border bg-surface-raised px-3 py-1.5 active:bg-surface"
      testID="location-chip"
    >
      <Ionicons name="location-outline" size={16} color={colors.accent} />
      <Text variant="caption" className="font-medium">
        {label}
      </Text>
      <Ionicons name="chevron-down" size={14} color={colors['text-muted']} />
    </Pressable>
  );
}
