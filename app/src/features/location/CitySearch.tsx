import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { searchCities, type City } from '@weloot/shared';

import { cn, Input, Text } from '@/components';
import { currentLanguage } from '@/i18n';
import { colors } from '@/theme/tokens';

/** How many matching localities to show under the search field. */
const MAX_RESULTS = 6;

/**
 * Search field over every Israeli locality (CBS list), matching Hebrew or English. Suggestions show as an outlined
 * list with pin icons and the name in both languages, so a single result doesn't look like another field.
 */
export function CitySearch({
  onSelect,
  label,
  autoFocus,
  onFocus,
  testID = 'city',
}: {
  onSelect: (city: City) => void;
  label: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  testID?: string;
}) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const otherLanguage = language === 'he' ? 'en' : 'he';
  const [query, setQuery] = useState('');

  // Only while searching: an empty query would sort every locality on each render.
  const results = query.trim() === '' ? [] : searchCities(query, language).slice(0, MAX_RESULTS);

  return (
    <View className="gap-2">
      <Input
        label={label}
        placeholder={t('location.citySearch.placeholder')}
        value={query}
        onChangeText={setQuery}
        onFocus={onFocus}
        autoFocus={autoFocus}
        autoCorrect={false}
        helper={
          query.trim() !== '' && results.length === 0
            ? t('location.citySearch.noResults')
            : undefined
        }
        testID={`${testID}-input`}
      />
      {results.length > 0 ? (
        <View
          accessibilityRole="list"
          className="overflow-hidden rounded-card border border-border bg-surface"
          testID={`${testID}-results`}
        >
          {results.map((city, index) => (
            <Pressable
              key={city.id}
              accessibilityRole="button"
              accessibilityLabel={city[language]}
              onPress={() => {
                setQuery('');
                onSelect(city);
              }}
              className={cn(
                'flex-row items-center gap-3 px-4 py-2.5 active:bg-surface-raised',
                index > 0 && 'border-t border-border',
              )}
              testID={`${testID}-${city.id}`}
            >
              <Ionicons name="location-outline" size={18} color={colors['text-muted']} />
              <View className="flex-1">
                <Text>{city[language]}</Text>
                <Text variant="caption" tone="muted">
                  {city[otherLanguage]}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
