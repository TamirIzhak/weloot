import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { PLATFORMS, type ListingRecord } from '@weloot/shared';

import { Button, Card, Text } from '@/components';
import {
  markOpened,
  markSeen,
  useNewForYou,
  type NewForYouItem,
} from '@/features/alerts/alertsApi';
import { useRequireAuth } from '@/features/auth/authGate';
import { useBrowsingLocation } from '@/features/location/browsingLocation';
import type { ListingTileData } from '@/features/listings/grid/ListingTile';
import { listingToTile } from '@/features/listings/tileData';
import { toTile } from '@/features/search/searchFilters';
import { useViewer } from '@/features/search/useViewer';
import { useWantToggle } from '@/features/wantlist/useWantToggle';
import { WantHeart } from '@/features/wantlist/WantHeart';
import { currentLanguage, formatNumber } from '@/i18n';
import { colors } from '@/theme/tokens';

import { Carousel } from './Carousel';
import { useMatchFeed, useNewNearYou, type FeedKind } from './feeds';
import { useListingsByIds, useWantedNearYou } from './homeData';

/** Cards per carousel; "See all" has the rest. */
export const CAROUSEL_SIZE = 10;

/**
 * Home feed (PRD W3, #22), real data only (PRD §1.2): Perfect Matches, Has games you want, New near you and Wanted
 * near you. Guests see New near you and an invitation to join. Empty carousels offer the next step (build the want
 * list, list a game) instead of fake content.
 */
export function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const viewer = useViewer();
  const want = useWantToggle();
  const requireAuth = useRequireAuth();
  const signedIn = viewer.uid !== undefined;

  const perfect = useMatchFeed('perfect', CAROUSEL_SIZE);
  const wanted = useMatchFeed('wanted', CAROUSEL_SIZE);
  const fresh = useNewNearYou();
  const language = currentLanguage();
  const newItems =
    fresh.pending || fresh.search.status === 'loading'
      ? null
      : fresh.search.status === 'ready'
        ? fresh.search.hits
            .slice(0, CAROUSEL_SIZE)
            .map((hit: ListingRecord) => toTile(hit, fresh.browsing, language))
        : [];

  const open = (item: ListingTileData) =>
    router.push({ pathname: '/listings/[id]', params: { id: item.id } });
  const seeAll = (kind: FeedKind) => () =>
    router.push({ pathname: '/feed/[kind]', params: { kind } });
  const heart = (item: ListingTileData) => (
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
      testID={`want-${item.id}`}
    />
  );

  return (
    <View className="gap-7" testID="home-feed">
      {signedIn && viewer.uid ? (
        <>
          <NewForYou uid={viewer.uid} renderAccessory={heart} />
          <Carousel
            title={t('home.perfect.title')}
            items={perfect}
            onSeeAll={seeAll('perfect')}
            onPressItem={open}
            renderAccessory={heart}
            testID="home-perfect"
          />
          <Carousel
            title={t('home.wanted.title')}
            items={wanted}
            onSeeAll={seeAll('wanted')}
            onPressItem={open}
            renderAccessory={heart}
            empty={
              <Card className="gap-3 p-4">
                <Text tone="secondary">{t('home.wanted.empty')}</Text>
                <Button
                  variant="secondary"
                  label={t('home.wanted.buildWantlist')}
                  onPress={() => router.push('/search')}
                  testID="home-build-wantlist"
                />
              </Card>
            }
            testID="home-wanted"
          />
        </>
      ) : (
        <Card className="mx-4 gap-3 p-4" testID="home-join">
          <Text variant="heading">{t('home.join.title')}</Text>
          <Text tone="secondary">{t('home.join.body')}</Text>
          <Button
            label={t('home.join.cta')}
            onPress={() => requireAuth('profile', () => undefined)}
            testID="home-join-cta"
          />
        </Card>
      )}
      <Carousel
        title={t(fresh.browsing ? 'home.new.title' : 'home.new.titleAnywhere')}
        items={newItems}
        onSeeAll={seeAll('new')}
        onPressItem={open}
        renderAccessory={heart}
        empty={
          <Card className="gap-3 p-4">
            <Text tone="secondary">{t('home.new.empty')}</Text>
            <Button
              variant="secondary"
              label={t('home.listGame')}
              onPress={() => router.push('/add')}
            />
          </Card>
        }
        testID="home-new"
      />
      {signedIn ? <WantedNearYou /> : null}
    </View>
  );
}

const NONE: NewForYouItem[] = [];

/** "New for you" (PRD W8): listings the user's alerts and want list found, newest first; hidden when there are none. */
function NewForYou({
  uid,
  renderAccessory,
}: {
  uid: string;
  renderAccessory: (item: ListingTileData) => ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const language = currentLanguage();
  const browsing = useBrowsingLocation((s) => s.location);
  const found = useNewForYou(uid);
  const items = found.status === 'ready' ? found.items : NONE;
  const listings = useListingsByIds(items.map((item) => item.listingId));

  useEffect(() => {
    if (items.length > 0) markSeen(uid, items);
  }, [uid, items]);

  const tiles =
    found.status === 'loading' || listings.status === 'loading'
      ? null
      : listings.status === 'ready'
        ? listings.value.map((l) => listingToTile(l, browsing, language))
        : [];
  return (
    <Carousel
      title={t('home.newForYou.title')}
      items={tiles}
      onPressItem={(tile) => {
        const item = items.find((i) => i.listingId === tile.id);
        if (item) markOpened(uid, item);
        router.push({ pathname: '/listings/[id]', params: { id: tile.id } });
      }}
      renderAccessory={renderAccessory}
      testID="home-new-for-you"
    />
  );
}

/** "4 people near you want Zelda (Switch)": real counts for the games the user has listed. */
function WantedNearYou() {
  const { t } = useTranslation();
  const router = useRouter();
  const viewer = useViewer();
  const language = currentLanguage();
  const browsing = useBrowsingLocation((s) => s.location);
  const state = useWantedNearYou(
    viewer.uid,
    browsing ? { lat: browsing.lat, lng: browsing.lng, radiusKm: viewer.radiusKm } : null,
  );

  let body;
  if (!browsing) {
    body = (
      <Pressable accessibilityRole="button" onPress={() => router.push('/location')}>
        <Text tone="secondary">{t('home.wantedNear.needsLocation')}</Text>
      </Pressable>
    );
  } else if (state.status === 'loading') {
    return null;
  } else if (state.status === 'error' || state.value.length === 0) {
    body = (
      <View className="gap-3">
        <Text tone="secondary">{t('home.wantedNear.empty')}</Text>
        <Button
          variant="secondary"
          label={t('home.listGame')}
          onPress={() => router.push('/add')}
        />
      </View>
    );
  } else {
    body = (
      <View className="gap-2.5">
        {state.value.map((game) => (
          <View
            key={`${game.igdbGameId}_${game.platform}`}
            className="flex-row items-center gap-3"
            testID={`wanted-near-${game.igdbGameId}_${game.platform}`}
          >
            <Ionicons name="people-outline" size={18} color={colors.accent} />
            <Text className="flex-1">
              {t('home.wantedNear.line', {
                count: formatNumber(game.count, language),
                title: game.gameTitle,
                platform: PLATFORMS[game.platform].label,
              })}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View className="gap-3 px-4" testID="home-wanted-near">
      <Text variant="heading">{t('home.wantedNear.title')}</Text>
      <Card className="p-4">{body}</Card>
    </View>
  );
}
