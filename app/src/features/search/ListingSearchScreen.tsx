import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEFAULT_SEARCH_RADIUS_KM, type ListingFilters } from '@weloot/shared';

import { Button, Chip, EmptyState, ErrorState, Input, Skeleton, Text } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { DensityToggle, ListingGrid } from '@/features/listings/grid/ListingGrid';
import { useBrowsingLocation } from '@/features/location/browsingLocation';
import { LocationChip } from '@/features/location/LocationChip';
import { useUserSettings } from '@/features/profile/settingsApi';
import { currentLanguage, formatNumber } from '@/i18n';
import { useHideOnScroll, useTabBarInset } from '@/navigation/TabBarVisibility';
import { colors } from '@/theme/tokens';

import { FiltersPanel } from './FiltersPanel';
import { useRecentSearches } from './recentSearches';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  toListingFilters,
  toTile,
  type SearchFilterState,
} from './searchFilters';
import { usePopularGames } from './usePopularGames';
import { useListingSearch, type SearchArea } from './useListingSearch';

/**
 * Search tab (PRD W4, #18): listings by game title over the `listings` index, with filters (console, trade/sale,
 * condition, price, distance from the browsing location) and results in the adaptive grid. An empty query with no
 * filters shows recent searches and popular games. The searcher's own and blocked users' listings never show.
 */
export function ListingSearchScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  const uid = auth.status === 'signedIn' ? auth.user.uid : undefined;
  const settings = useUserSettings(uid);
  const browsing = useBrowsingLocation((s) => s.location);
  const addRecent = useRecentSearches((s) => s.add);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);

  const ready = settings.status === 'ready' ? settings.settings : null;
  const excluded = [...(uid ? [uid] : []), ...(ready?.blockedUserIds ?? [])];
  const radiusKm =
    filters.radiusKm === undefined
      ? (ready?.searchRadiusKm ?? DEFAULT_SEARCH_RADIUS_KM)
      : filters.radiusKm;
  const area: SearchArea | null = browsing
    ? { lat: browsing.lat, lng: browsing.lng, radiusKm }
    : null;
  const filterCount = activeFilterCount(filters);
  const searching = query.trim() !== '' || filterCount > 0 || browseAll;

  const search = (text: string) => {
    setQuery(text);
    addRecent(text);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']} testID="search-screen">
      <View className="gap-3 px-4 pb-3 pt-2">
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="heading">{t('tabs.search')}</Text>
          <LocationChip />
        </View>
        <Input
          label={t('search.input.label')}
          placeholder={t('search.input.placeholder')}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => addRecent(query)}
          autoCorrect={false}
          returnKeyType="search"
          testID="search-input"
        />
        <View className="flex-row items-center justify-between gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersOpen }}
            onPress={() => setFiltersOpen((open) => !open)}
            className="flex-row items-center gap-1.5 rounded-chip border border-border bg-surface-raised px-3 py-1.5 active:bg-surface"
            testID="search-filters-toggle"
          >
            <Ionicons name="options-outline" size={16} color={colors.accent} />
            <Text variant="caption" className="font-medium">
              {filterCount > 0
                ? t('search.filters.buttonCount', { count: filterCount })
                : t('search.filters.button')}
            </Text>
          </Pressable>
          {searching && !filtersOpen ? <DensityToggle /> : null}
        </View>
      </View>
      {filtersOpen ? (
        <FiltersPanel
          value={filters}
          onChange={setFilters}
          defaultRadiusKm={ready?.searchRadiusKm ?? DEFAULT_SEARCH_RADIUS_KM}
          hasLocation={browsing !== null}
          onDone={() => setFiltersOpen(false)}
        />
      ) : searching ? (
        <Results
          query={query}
          filters={toListingFilters(filters, excluded)}
          area={area}
          canClearFilters={filterCount > 0}
          onClearFilters={() => setFilters(EMPTY_FILTERS)}
          onSearchEverywhere={
            radiusKm !== null && area ? () => setFilters({ ...filters, radiusKm: null }) : undefined
          }
        />
      ) : (
        <Idle area={area} onSearch={search} onBrowseAll={() => setBrowseAll(true)} />
      )}
    </SafeAreaView>
  );
}

function Results({
  query,
  filters,
  area,
  canClearFilters,
  onClearFilters,
  onSearchEverywhere,
}: {
  query: string;
  filters: ListingFilters;
  area: SearchArea | null;
  canClearFilters: boolean;
  onClearFilters: () => void;
  onSearchEverywhere?: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const language = currentLanguage();
  const onScroll = useHideOnScroll();
  const bottomInset = useTabBarInset();
  const state = useListingSearch({ query, filters, area });

  switch (state.status) {
    case 'notConfigured':
      return (
        <Text tone="muted" className="px-4" testID="search-not-configured">
          {t('search.notConfigured')}
        </Text>
      );
    case 'loading':
      return <SkeletonGrid />;
    case 'error':
      return <ErrorState title={t('search.error')} className="mx-4" testID="search-error" />;
    case 'ready':
      break;
  }

  if (state.hits.length === 0) {
    const actions = [
      ...(onSearchEverywhere
        ? [{ label: t('search.empty.everywhere'), onPress: onSearchEverywhere }]
        : []),
      ...(canClearFilters ? [{ label: t('search.filters.reset'), onPress: onClearFilters }] : []),
      ...(!area
        ? [{ label: t('search.empty.chooseLocation'), onPress: () => router.push('/location') }]
        : []),
    ];
    return (
      <EmptyState
        title={t('search.empty.title')}
        body={t('search.empty.body')}
        primaryAction={actions[0]}
        secondaryAction={actions[1]}
        className="px-4"
        testID="search-empty"
      />
    );
  }

  const tiles = state.hits.map((hit) => toTile(hit, area, language));
  const count = formatNumber(state.total, language);
  return (
    <View className="flex-1 gap-2">
      <Text variant="caption" tone="muted" className="px-4" testID="search-count">
        {t('search.results.count', { count })}
      </Text>
      <ListingGrid
        items={tiles}
        onScroll={onScroll}
        onEndReached={state.hasMore ? state.loadMore : undefined}
        bottomInset={bottomInset}
        ListFooterComponent={
          state.loadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} />
          ) : undefined
        }
        testID="search-results"
      />
    </View>
  );
}

const SKELETON_TILES = Array.from({ length: 6 }, (_, i) => i);

/** Placeholder tiles while the first page loads (real work in progress, PRD §1.2). */
function SkeletonGrid() {
  return (
    <View className="flex-row flex-wrap gap-3 px-4" testID="search-loading">
      {SKELETON_TILES.map((i) => (
        <Skeleton key={i} className="aspect-[3/4] w-[47%] rounded-card" />
      ))}
    </View>
  );
}

/** Empty query, no filters: recent searches, popular games and a way to browse everything. */
function Idle({
  area,
  onSearch,
  onBrowseAll,
}: {
  area: SearchArea | null;
  onSearch: (query: string) => void;
  onBrowseAll: () => void;
}) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const recent = useRecentSearches((s) => s.queries);
  const removeRecent = useRecentSearches((s) => s.remove);
  const clearRecent = useRecentSearches((s) => s.clear);
  const popular = usePopularGames(area);
  const bottomInset = useTabBarInset();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-6 px-4"
      contentContainerStyle={{ paddingBottom: bottomInset }}
      testID="search-idle"
    >
      {recent.length > 0 ? (
        <View className="gap-2" testID="search-recent">
          <View className="flex-row items-center justify-between">
            <Text variant="label" tone="secondary">
              {t('search.recent.title')}
            </Text>
            <Button variant="ghost" label={t('search.recent.clear')} onPress={clearRecent} />
          </View>
          {recent.map((q) => (
            <View key={q} className="flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={() => onSearch(q)}
                className="flex-1 flex-row items-center gap-2 py-2"
                testID={`recent-${q}`}
              >
                <Ionicons name="time-outline" size={18} color={colors['text-muted']} />
                <Text numberOfLines={1} className="flex-1">
                  {q}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('search.recent.remove', { query: q })}
                onPress={() => removeRecent(q)}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={colors['text-muted']} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {popular.length > 0 ? (
        <View className="gap-2" testID="search-popular">
          <Text variant="label" tone="secondary">
            {t(area ? 'search.popular.nearYou' : 'search.popular.title')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {popular.map((game) => (
              <Chip
                key={game.title}
                label={t('search.popular.game', {
                  title: game.title,
                  count: formatNumber(game.count, language),
                })}
                onPress={() => onSearch(game.title)}
                testID={`popular-${game.title}`}
              />
            ))}
          </View>
        </View>
      ) : null}
      <Button
        variant="secondary"
        label={t(area ? 'search.browseNearYou' : 'search.browseAll')}
        onPress={onBrowseAll}
        testID="search-browse-all"
      />
    </ScrollView>
  );
}
