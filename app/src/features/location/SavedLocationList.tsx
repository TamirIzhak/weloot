import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { findCity } from '@weloot/shared';

import { cn, Text } from '@/components';
import { currentLanguage } from '@/i18n';
import { colors } from '@/theme/tokens';

import type { SavedLocationWithId } from './savedLocations';

/** The area others see for a saved address, in the reader's language. */
export function areaNameOf(item: { cityId?: string; areaName: string }): string {
  const city = item.cityId ? findCity(item.cityId) : undefined;
  return city ? city[currentLanguage()] : item.areaName;
}

/**
 * Saved addresses as a list (PRD W2): label, address and the area others see. With `selectedId` it's a picker
 * (radio marks); with `onEdit` each row gets an edit button.
 */
export function SavedLocationList({
  items,
  onSelect,
  selectedId,
  onEdit,
}: {
  items: SavedLocationWithId[];
  onSelect: (item: SavedLocationWithId) => void;
  selectedId?: string;
  onEdit?: (item: SavedLocationWithId) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="list"
      className="overflow-hidden rounded-card border border-border bg-surface"
      testID="saved-locations"
    >
      {items.map((item, index) => {
        const selected = item.id === selectedId;
        return (
          <View
            key={item.id}
            className={cn('flex-row items-center', index > 0 && 'border-t border-border')}
          >
            <Pressable
              accessibilityRole={selectedId === undefined ? 'button' : 'radio'}
              accessibilityState={selectedId === undefined ? undefined : { checked: selected }}
              onPress={() => onSelect(item)}
              className="flex-1 flex-row items-center gap-3 px-4 py-3 active:bg-surface-raised"
              testID={`saved-location-${item.id}`}
            >
              <Ionicons
                name={
                  selectedId === undefined
                    ? 'home-outline'
                    : selected
                      ? 'radio-button-on'
                      : 'radio-button-off'
                }
                size={20}
                color={selected ? colors.primary : colors['text-secondary']}
              />
              <View className="flex-1 gap-0.5">
                <Text className="font-medium">{item.label}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {item.address}
                </Text>
                <Text variant="caption" tone="secondary">
                  {t('location.saved.shownAs', { area: areaNameOf(item) })}
                </Text>
              </View>
            </Pressable>
            {onEdit ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('location.saved.edit', { label: item.label })}
                onPress={() => onEdit(item)}
                hitSlop={8}
                className="px-4 py-3"
                testID={`edit-location-${item.id}`}
              >
                <Ionicons name="create-outline" size={20} color={colors['text-secondary']} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
