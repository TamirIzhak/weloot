import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { CONDITIONS, PLATFORM_KEYS, PLATFORMS, type Condition } from '@weloot/shared';

import { Button, Chip, Input, Text } from '@/components';
import { useTabBarInset } from '@/navigation/TabBarVisibility';

import { DISTANCE_OPTIONS_KM, EMPTY_FILTERS, type SearchFilterState } from './searchFilters';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text variant="label" tone="secondary">
        {title}
      </Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

/** Search filters (PRD W4): console, trade/sale, condition, price and distance. Changes apply as they're made. */
export function FiltersPanel({
  value,
  onChange,
  defaultRadiusKm,
  hasLocation,
  onDone,
}: {
  value: SearchFilterState;
  onChange: (next: SearchFilterState) => void;
  /** The user's search radius (Settings), used while no distance is picked here. */
  defaultRadiusKm: number;
  /** Distance needs a browsing location. */
  hasLocation: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const bottomInset = useTabBarInset();
  const set = (patch: Partial<SearchFilterState>) => onChange({ ...value, ...patch });
  const toggleCondition = (condition: Condition) =>
    set({
      conditions: value.conditions.includes(condition)
        ? value.conditions.filter((c) => c !== condition)
        : [...value.conditions, condition],
    });
  const radius = value.radiusKm === undefined ? defaultRadiusKm : value.radiusKm;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-5 px-4"
      contentContainerStyle={{ paddingBottom: bottomInset }}
      testID="search-filters"
    >
      <Section title={t('search.filters.platform')}>
        <Chip
          label={t('search.filters.any')}
          selected={value.platform === undefined}
          onPress={() => set({ platform: undefined })}
          testID="filter-platform-any"
        />
        {PLATFORM_KEYS.map((key) => (
          <Chip
            key={key}
            label={PLATFORMS[key].label}
            selected={value.platform === key}
            onPress={() => set({ platform: value.platform === key ? undefined : key })}
            testID={`filter-platform-${key}`}
          />
        ))}
      </Section>
      <Section title={t('search.filters.mode')}>
        <Chip
          label={t('search.filters.any')}
          selected={value.mode === undefined}
          onPress={() => set({ mode: undefined })}
          testID="filter-mode-any"
        />
        <Chip
          label={t('search.filters.trade')}
          selected={value.mode === 'trade'}
          onPress={() => set({ mode: 'trade' })}
          testID="filter-mode-trade"
        />
        <Chip
          label={t('search.filters.sale')}
          selected={value.mode === 'sale'}
          onPress={() => set({ mode: 'sale' })}
          testID="filter-mode-sale"
        />
      </Section>
      <Section title={t('search.filters.condition')}>
        {CONDITIONS.map((condition) => (
          <Chip
            key={condition}
            label={t(`listings.condition.${condition}`)}
            selected={value.conditions.includes(condition)}
            onPress={() => toggleCondition(condition)}
            testID={`filter-condition-${condition}`}
          />
        ))}
      </Section>
      <View className="gap-2">
        <Text variant="label" tone="secondary">
          {t('search.filters.price')}
        </Text>
        <View className="flex-row gap-3">
          <Input
            label={t('search.filters.min')}
            value={value.minShekels}
            onChangeText={(text) => set({ minShekels: text.replace(/[^\d]/g, '') })}
            keyboardType="number-pad"
            maxLength={4}
            className="flex-1"
            testID="filter-price-min"
          />
          <Input
            label={t('search.filters.max')}
            value={value.maxShekels}
            onChangeText={(text) => set({ maxShekels: text.replace(/[^\d]/g, '') })}
            keyboardType="number-pad"
            maxLength={4}
            className="flex-1"
            testID="filter-price-max"
          />
        </View>
        <Text variant="caption" tone="muted">
          {t('search.filters.priceHint')}
        </Text>
      </View>
      {hasLocation ? (
        <Section title={t('search.filters.distance')}>
          {DISTANCE_OPTIONS_KM.map((km) => (
            <Chip
              key={km ?? 'any'}
              label={km === null ? t('search.filters.anywhere') : t('common.km', { value: km })}
              selected={radius === km}
              onPress={() => set({ radiusKm: km })}
              testID={`filter-distance-${km ?? 'any'}`}
            />
          ))}
        </Section>
      ) : (
        <Text variant="caption" tone="muted">
          {t('search.filters.distanceNeedsLocation')}
        </Text>
      )}
      <View className="gap-2">
        <Button label={t('search.filters.show')} onPress={onDone} testID="filters-done" />
        <Button
          variant="ghost"
          label={t('search.filters.reset')}
          onPress={() => onChange(EMPTY_FILTERS)}
          testID="filters-reset"
        />
      </View>
    </ScrollView>
  );
}
