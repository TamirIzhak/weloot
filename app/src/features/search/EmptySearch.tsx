import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { PLATFORMS, type ListingFilters, type PlatformKey } from '@weloot/shared';

import { Button, Chip, EmptyState, Skeleton, Text } from '@/components';
import { useNotifyMe } from '@/features/alerts/useNotifyMe';
import { Carousel } from '@/features/home/Carousel';
import { useWantToggle } from '@/features/wantlist/useWantToggle';
import { currentLanguage, formatNumber } from '@/i18n';
import { useTabBarInset } from '@/navigation/TabBarVisibility';

import { toTile } from './searchFilters';
import { useEmptySuggestions } from './useEmptySuggestions';
import type { SearchArea } from './useListingSearch';
import { useViewer } from './useViewer';

/**
 * A search that found nothing (PRD W4 "never a dead end", #48), in the PRD's order, real data only: the game with
 * "Add to my want list", the same game on other consoles, similar games that are listed, and how many results wider
 * filters would give. There's always at least one action.
 */
export function EmptySearch({
  query,
  filters,
  area,
  onPlatform,
  onRadius,
  onClearFilters,
}: {
  query: string;
  filters: ListingFilters;
  area: SearchArea | null;
  onPlatform: (platform: PlatformKey) => void;
  onRadius: (radiusKm: number | null) => void;
  onClearFilters: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const language = currentLanguage();
  const bottomInset = useTabBarInset();
  const want = useWantToggle();
  const notify = useNotifyMe();
  const viewer = useViewer();
  const suggestions = useEmptySuggestions({ query, filters, area });

  if (!suggestions) {
    return (
      <View className="gap-3 px-4" testID="search-empty-loading">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-40 w-full rounded-card" />
      </View>
    );
  }

  const { game, otherPlatforms, similar, wider, unfiltered } = suggestions;
  const n = (value: number) => formatNumber(value, language);
  const wantPlatform = filters.platform;
  const wanted = game ? want.isWanted(Number(game.objectID), wantPlatform) : false;
  const notifying = game ? notify.isOn(Number(game.objectID), wantPlatform) : false;
  const hasRelaxed = wider !== null || unfiltered > 0;
  const hasSuggestion =
    game !== null || otherPlatforms.length > 0 || similar.length > 0 || hasRelaxed;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-6"
      contentContainerStyle={{ paddingBottom: bottomInset }}
      testID="search-empty"
    >
      <View className="gap-3 px-4">
        <Text variant="heading">
          {game ? t('search.empty.noOneHas', { title: game.title }) : t('search.empty.title')}
        </Text>
        <Text tone="secondary">{t(game ? 'search.empty.noOneHasBody' : 'search.empty.body')}</Text>
        {game ? (
          <Button
            variant={notifying ? 'secondary' : 'primary'}
            label={t(notifying ? 'alerts.on' : 'alerts.notifyMe')}
            onPress={() =>
              notify.toggle({
                igdbGameId: Number(game.objectID),
                ...(wantPlatform ? { platform: wantPlatform } : {}),
                gameTitle: game.title,
                radiusKm: area?.radiusKm ?? viewer.radiusKm,
                ...(area && area.radiusKm !== null
                  ? { center: { lat: area.lat, lng: area.lng } }
                  : {}),
              })
            }
            testID="empty-notify"
          />
        ) : null}
        {game ? (
          <Button
            variant="secondary"
            label={t(wanted ? 'wantlist.onList' : 'wantlist.addButton')}
            onPress={() =>
              want.toggle({
                igdbGameId: Number(game.objectID),
                ...(wantPlatform ? { platform: wantPlatform } : {}),
                gameTitle: game.title,
              })
            }
            testID="empty-want"
          />
        ) : null}
      </View>

      {otherPlatforms.length > 0 ? (
        <View className="gap-2 px-4" testID="empty-other-platforms">
          <Text variant="label" tone="secondary">
            {t('search.empty.otherPlatforms')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {otherPlatforms.map(({ platform, count }) => (
              <Chip
                key={platform}
                label={t('search.empty.platformCount', {
                  platform: PLATFORMS[platform].label,
                  count: n(count),
                })}
                onPress={() => onPlatform(platform)}
                testID={`empty-platform-${platform}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {similar.length > 0 ? (
        <Carousel
          title={t('search.empty.similar')}
          items={similar.map((hit) => toTile(hit, area, language))}
          onPressItem={(item) =>
            router.push({ pathname: '/listings/[id]', params: { id: item.id } })
          }
          testID="empty-similar"
        />
      ) : null}

      <View className="gap-2 px-4">
        {wider ? (
          <Button
            variant="secondary"
            label={
              wider.radiusKm === null
                ? t('search.empty.widerAnywhere', { count: n(wider.count) })
                : t('search.empty.wider', { count: n(wider.count), km: n(wider.radiusKm) })
            }
            onPress={() => onRadius(wider.radiusKm)}
            testID="empty-wider"
          />
        ) : null}
        {unfiltered > 0 ? (
          <Button
            variant="secondary"
            label={t('search.empty.unfiltered', { count: n(unfiltered) })}
            onPress={onClearFilters}
            testID="empty-unfiltered"
          />
        ) : null}
        {!hasSuggestion ? (
          <EmptyState
            title={t('search.empty.nothingYet')}
            primaryAction={
              area
                ? { label: t('search.empty.everywhere'), onPress: () => onRadius(null) }
                : {
                    label: t('search.empty.chooseLocation'),
                    onPress: () => router.push('/location'),
                  }
            }
            secondaryAction={{ label: t('home.listGame'), onPress: () => router.push('/add') }}
            testID="empty-fallback"
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
