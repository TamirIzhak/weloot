import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { EmptyState, ErrorState } from '@/components';
import { DensityToggle, ListingGrid } from '@/features/listings/grid/ListingGrid';
import type { ListingTileData } from '@/features/listings/grid/ListingTile';
import { toTile } from '@/features/search/searchFilters';
import { useWantToggle } from '@/features/wantlist/useWantToggle';
import { WantHeart } from '@/features/wantlist/WantHeart';
import { currentLanguage } from '@/i18n';
import { colors } from '@/theme/tokens';

import { MATCHES_SHOWN } from './homeData';
import { useMatchFeed, useNewNearYou, type FeedKind, type MatchFeed } from './feeds';

/** "See all" from a Home carousel (PRD W3): the full list in the adaptive grid. */
export function FeedScreen({ kind }: { kind: FeedKind }) {
  return kind === 'new' ? <NewFeed /> : <MatchList kind={kind} />;
}

function Grid({
  items,
  onEndReached,
  footer,
}: {
  items: ListingTileData[];
  onEndReached?: () => void;
  footer?: ReactElement;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const want = useWantToggle();
  if (items.length === 0) {
    return (
      <EmptyState
        title={t('home.feed.emptyTitle')}
        body={t('home.feed.emptyBody')}
        primaryAction={{ label: t('home.feed.search'), onPress: () => router.replace('/search') }}
        className="m-4"
        testID="feed-empty"
      />
    );
  }
  return (
    <View className="flex-1 gap-3 pt-3">
      <View className="px-4">
        <DensityToggle />
      </View>
      <ListingGrid
        items={items}
        onPressItem={(item) => router.push({ pathname: '/listings/[id]', params: { id: item.id } })}
        renderAccessory={(item) => (
          <WantHeart
            wanted={want.isWanted(item.igdbGameId, item.platform)}
            title={item.gameTitle}
            onPress={() =>
              want.toggle({
                igdbGameId: item.igdbGameId,
                platform: item.platform,
                gameTitle: item.gameTitle,
              })
            }
          />
        )}
        onEndReached={onEndReached}
        ListFooterComponent={footer}
        bottomInset={32}
        testID="feed-grid"
      />
    </View>
  );
}

function MatchList({ kind }: { kind: MatchFeed }) {
  const items = useMatchFeed(kind, MATCHES_SHOWN * 3);
  if (items === null) {
    return <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />;
  }
  return <Grid items={items} />;
}

function NewFeed() {
  const { t } = useTranslation();
  const language = currentLanguage();
  const { search, pending, browsing } = useNewNearYou();
  if (pending || search.status === 'loading') {
    return <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />;
  }
  if (search.status === 'error' || search.status === 'notConfigured') {
    return <ErrorState title={t('search.error')} className="m-4" />;
  }
  return (
    <Grid
      items={search.hits.map((hit) => toTile(hit, browsing, language))}
      onEndReached={search.hasMore ? search.loadMore : undefined}
      footer={
        search.loadingMore ? (
          <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} />
        ) : undefined
      }
    />
  );
}
