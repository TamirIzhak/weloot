import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, useWindowDimensions, View } from 'react-native';

import { distanceKm, findCity, PLATFORMS } from '@weloot/shared';

import { Badge, Button, Card, Chip, EmptyState, ErrorState, Skeleton, Text } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRequireAuth } from '@/features/auth/authGate';
import { coverUrl } from '@/features/catalog/igdbImages';
import { useBrowsingLocation } from '@/features/location/browsingLocation';
import { usePublicProfile } from '@/features/profile/usePublicProfile';
import { useConversationFor } from '@/features/offers/offersApi';
import { useWantToggle } from '@/features/wantlist/useWantToggle';
import {
  currentLanguage,
  formatDate,
  formatMonthYear,
  formatNumber,
  formatPrice,
  isolate,
} from '@/i18n';
import { colors } from '@/theme/tokens';

import { useListing, type Listing } from './useListing';
import { usePhotoUrls } from './usePhotoUrls';

/**
 * Game page (PRD W5/§9-C, #19): everything a listing holds, for guests too (photos or cover, condition, case,
 * notes, trade/price, area and distance), the owner's trust signals, and Report. Offer / question buttons arrive
 * with #24, sharing with #50.
 */
export function ListingDetailScreen({ listingId }: { listingId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const state = useListing(listingId);
  const auth = useAuth();

  if (state.status === 'loading') {
    return (
      <ActivityIndicator
        color={colors.primary}
        style={{ marginTop: 48 }}
        testID="listing-loading"
      />
    );
  }
  if (state.status === 'error') {
    return <ErrorState title={t('listings.detail.loadFailed')} className="m-4" />;
  }
  // Others can't read a paused or closed listing (rules); a cached copy mustn't show it either.
  const own =
    state.status === 'ready' &&
    auth.status === 'signedIn' &&
    auth.user.uid === state.listing.userId;
  if (state.status === 'missing' || (state.listing.status !== 'active' && !own)) {
    return (
      <EmptyState
        title={t('listings.detail.goneTitle')}
        body={t('listings.detail.goneBody')}
        primaryAction={{
          label: t('listings.detail.searchOthers'),
          onPress: () => router.replace('/search'),
        }}
        className="m-4"
        testID="listing-gone"
      />
    );
  }
  return <ListingDetail listing={state.listing} />;
}

function ListingDetail({ listing }: { listing: Listing }) {
  const { t } = useTranslation();
  const router = useRouter();
  const language = currentLanguage();
  const auth = useAuth();
  const requireAuth = useRequireAuth();
  const browsing = useBrowsingLocation((s) => s.location);
  const own = auth.status === 'signedIn' && auth.user.uid === listing.userId;
  const want = useWantToggle();
  const wanted = want.isWanted(listing.igdbGameId, listing.platform);

  const city = listing.location.cityId ? findCity(listing.location.cityId) : undefined;
  const area = city?.[language] ?? listing.location.areaName;
  const km = browsing ? Math.max(1, Math.round(distanceKm(browsing, listing.location))) : null;
  const offer = [
    listing.isForTrade ? t('listings.form.forTrade') : null,
    listing.isForSale && listing.askingPriceAgorot !== undefined
      ? formatPrice(listing.askingPriceAgorot, language)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const where =
    km === null
      ? area
      : t('listings.detail.areaDistance', { area, distance: formatNumber(km, language) });
  const listedOn = t('listings.detail.listedOn', {
    date: formatDate(listing.createdAt.toMillis(), language),
  });

  return (
    <ScrollView contentContainerClassName="gap-4 pb-12" testID="listing-detail">
      <Gallery listing={listing} />
      <View className="gap-4 px-4">
        <View className="gap-2">
          <Text variant="heading">{listing.gameTitle}</Text>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Chip
              platform={PLATFORMS[listing.platform].family}
              label={PLATFORMS[listing.platform].label}
            />
            {listing.hasPhotos ? <Badge tone="accent" label={t('listings.photos.badge')} /> : null}
            {listing.status !== 'active' ? (
              <Badge tone="warning" label={t(`listings.status.${listing.status}`)} />
            ) : null}
          </View>
          <Text variant="heading" tone="accent" testID="listing-offer">
            {offer}
          </Text>
        </View>

        <Card className="gap-3 p-4">
          <Fact
            icon="sparkles-outline"
            label={t('listings.form.condition')}
            value={t(`listings.condition.${listing.condition}`)}
          />
          <Fact
            icon="cube-outline"
            label={t('listings.detail.case')}
            value={t(listing.hasCase ? 'listings.detail.caseYes' : 'listings.detail.caseNo')}
          />
          <Fact icon="location-outline" label={t('listings.detail.area')} value={where} />
          <Fact icon="calendar-outline" label={t('listings.detail.listed')} value={listedOn} />
        </Card>

        {listing.notes ? (
          <View className="gap-1.5">
            <Text variant="label" tone="secondary">
              {t('listings.detail.notes')}
            </Text>
            <Text testID="listing-notes">{listing.notes}</Text>
          </View>
        ) : null}

        {own || listing.status !== 'active' ? null : <Openers listingId={listing.id} />}

        {own ? null : (
          <Button
            variant="secondary"
            label={t(wanted ? 'wantlist.onList' : 'wantlist.addButton')}
            onPress={() =>
              want.toggle({
                igdbGameId: listing.igdbGameId,
                platform: listing.platform,
                gameTitle: listing.gameTitle,
              })
            }
            testID="listing-want"
          />
        )}

        <OwnerCard uid={listing.userId} />

        {own ? (
          <Card className="gap-3 p-4" testID="listing-own">
            <Text tone="secondary">{t('listings.detail.yours')}</Text>
            <Button
              variant="secondary"
              label={t('listings.detail.manage')}
              onPress={() => router.push('/me/listings')}
            />
          </Card>
        ) : (
          <Button
            variant="ghost"
            label={t('listings.detail.report')}
            onPress={() =>
              requireAuth('report', () =>
                router.push({ pathname: '/listings/[id]/report', params: { id: listing.id } }),
              )
            }
            testID="listing-report"
          />
        )}
      </View>
    </ScrollView>
  );
}

/**
 * Game page openers (PRD W5): "Make an offer" (primary) and "Ask a question" while the viewer has no conversation
 * about this listing, then "Open chat". Both need an account and a verified phone (asked once, PRD W1).
 */
function Openers({ listingId }: { listingId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const requireAuth = useRequireAuth();
  const existing = useConversationFor(
    listingId,
    auth.status === 'signedIn' ? auth.user.uid : undefined,
  );
  if (existing === 'loading') return null;
  if (existing !== 'none') {
    return (
      <Button
        size="lg"
        label={t('offers.openChat')}
        onPress={() => router.push({ pathname: '/conversations/[id]', params: { id: existing } })}
        testID="listing-open-chat"
      />
    );
  }
  return (
    <View className="gap-2">
      <Button
        size="lg"
        label={t('offers.makeOffer')}
        onPress={() =>
          requireAuth('offer', () =>
            router.push({ pathname: '/offer/[listingId]', params: { listingId } }),
          )
        }
        testID="listing-make-offer"
      />
      <Button
        variant="secondary"
        label={t('offers.askQuestion')}
        onPress={() =>
          requireAuth('question', () =>
            router.push({ pathname: '/listings/[id]/ask', params: { id: listingId } }),
          )
        }
        testID="listing-ask"
      />
    </View>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View
      className="flex-row items-center gap-3"
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Ionicons name={icon} size={18} color={colors['text-muted']} />
      <Text tone="secondary" className="w-24">
        {label}
      </Text>
      <Text className="flex-1">{value}</Text>
    </View>
  );
}

/** The owner's real photos (swipe through), or the game's cover when there are none. */
function Gallery({ listing }: { listing: Listing }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const photos = usePhotoUrls(listing.photoPaths);
  const [index, setIndex] = useState(0);
  const height = Math.round(width * 0.9);

  if (photos.length === 0) {
    return (
      <View className="items-center bg-surface py-6" testID="listing-cover">
        <View
          className="overflow-hidden rounded-card bg-surface-raised"
          style={{ width: height * 0.6, height }}
        >
          {listing.coverImageId ? (
            <Image
              source={coverUrl(listing.coverImageId, 'cover_big')}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              accessibilityLabel={t('listings.detail.coverLabel', { title: listing.gameTitle })}
            />
          ) : null}
        </View>
      </View>
    );
  }
  return (
    <View testID="listing-gallery">
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {photos.map((url, i) => (
          <Image
            key={url}
            source={url}
            style={{ width, height }}
            contentFit="cover"
            accessibilityLabel={t('listings.detail.photoLabel', {
              n: i + 1,
              total: photos.length,
            })}
          />
        ))}
      </ScrollView>
      {photos.length > 1 ? (
        <View className="absolute bottom-3 self-center rounded-chip bg-bg/80 px-2.5 py-1">
          <Text variant="caption">
            {isolate(t('listings.detail.photoCount', { n: index + 1, total: photos.length }))}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Who's offering it, with real trust signals only (PRD §1.2, W9): rating, completed trades, member since. */
function OwnerCard({ uid }: { uid: string }) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const state = usePublicProfile(uid);
  if (state.status !== 'ready') {
    return state.status === 'loading' ? (
      <Skeleton className="h-20 w-full rounded-card" testID="owner-loading" />
    ) : null;
  }
  const { profile } = state;
  const rating =
    profile.ratingCount > 0
      ? t('listings.detail.rating', {
          avg: formatNumber(Math.round(profile.ratingAvg * 10) / 10, language),
          count: formatNumber(profile.ratingCount, language),
        })
      : t('listings.detail.noRatings');
  return (
    <Card className="flex-row items-center gap-3 p-4" testID="owner-card">
      <View className="h-11 w-11 items-center justify-center rounded-chip bg-surface-raised">
        <Ionicons name="person-outline" size={22} color={colors['text-secondary']} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-medium">{isolate(profile.username)}</Text>
        <Text variant="caption" tone="secondary">
          {rating}
        </Text>
        <Text variant="caption" tone="muted">
          {t('listings.detail.trustLine', {
            trades: formatNumber(profile.completedTrades, language),
            since: formatMonthYear(profile.createdAt.toMillis(), language),
          })}
        </Text>
      </View>
    </Card>
  );
}
