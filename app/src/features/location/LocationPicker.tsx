import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { MAX_SAVED_LOCATIONS } from '@weloot/shared';

import { Button, ErrorState, Text } from '@/components';
import { colors } from '@/theme/tokens';

import { SavedLocationList } from './SavedLocationList';
import { useSavedLocations, type SavedLocationWithId } from './savedLocations';

/**
 * Picks the saved address a listing is posted from (PRD W2 "Location" step, #16), with "Add an address". Only the
 * area of the chosen address is published.
 */
export function LocationPicker({
  uid,
  selectedId,
  onSelect,
  autoSelectFirst,
}: {
  uid: string;
  selectedId: string | undefined;
  onSelect: (item: SavedLocationWithId) => void;
  /** Called with the first address's ID when nothing is selected yet (e.g. the only address, Home). */
  autoSelectFirst?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const saved = useSavedLocations(uid);
  const firstId = saved.status === 'ready' ? saved.items[0]?.id : undefined;

  useEffect(() => {
    if (firstId && selectedId === undefined) autoSelectFirst?.(firstId);
  }, [firstId, selectedId, autoSelectFirst]);

  if (saved.status === 'loading') return <ActivityIndicator color={colors.primary} />;
  if (saved.status === 'error') return <ErrorState title={t('location.errors.loadFailed')} />;

  return (
    <View className="gap-3" testID="location-picker">
      {saved.items.length > 0 ? (
        <SavedLocationList
          items={saved.items}
          selectedId={selectedId ?? ''}
          onSelect={onSelect}
          onEdit={(item) => router.push({ pathname: '/addresses/[id]', params: { id: item.id } })}
        />
      ) : (
        <Text tone="secondary">{t('location.picker.empty')}</Text>
      )}
      {saved.items.length < MAX_SAVED_LOCATIONS ? (
        <Button
          variant="secondary"
          fullWidth
          label={t('location.picker.add')}
          icon={<Ionicons name="add" size={20} color={colors['text-primary']} />}
          onPress={() => router.push('/addresses/new')}
          testID="add-address"
        />
      ) : null}
    </View>
  );
}
