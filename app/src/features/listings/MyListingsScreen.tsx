import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import {
  listingMachine,
  PLATFORMS,
  type ListingStatus,
  type ManageListingAction,
} from '@weloot/shared';

import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Text,
  useToast,
  type BadgeTone,
} from '@/components';
import { coverUrl } from '@/features/catalog/igdbImages';
import { currentLanguage, formatPrice } from '@/i18n';
import { colors } from '@/theme/tokens';

import { manageListing, useMyListings } from './myListings';
import type { Listing } from './useListing';

const STATUS_TONE: Record<ListingStatus, BadgeTone> = {
  draft: 'neutral',
  active: 'success',
  paused: 'warning',
  reserved: 'primary',
  traded: 'neutral',
  sold: 'neutral',
  removed: 'neutral',
};

/**
 * Profile → My listings (#17, PRD W6): every listing in every status, newest first. Tapping one shows what can be
 * done with it now (from the state machine): photos, pause/resume, Swapped/Sold ("Who with?") and remove.
 */
export function MyListingsScreen({ uid }: { uid: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const state = useMyListings(uid);
  const [openId, setOpenId] = useState<string | null>(null);

  if (state.status === 'loading') return <ActivityIndicator color={colors.primary} />;
  if (state.status === 'error') return <ErrorState title={t('listings.mine.loadFailed')} />;
  if (state.listings.length === 0) {
    return (
      <EmptyState
        title={t('listings.mine.emptyTitle')}
        body={t('listings.mine.emptyBody')}
        primaryAction={{ label: t('listings.mine.listGame'), onPress: () => router.push('/add') }}
        testID="my-listings-empty"
      />
    );
  }
  return (
    <View className="gap-3" testID="my-listings">
      {state.listings.map((listing) => (
        <ListingItem
          key={listing.id}
          listing={listing}
          open={openId === listing.id}
          onToggle={() => setOpenId((id) => (id === listing.id ? null : listing.id))}
        />
      ))}
    </View>
  );
}

function ListingItem({
  listing,
  open,
  onToggle,
}: {
  listing: Listing;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const availability = [
    listing.isForTrade ? t('listings.form.forTrade') : null,
    listing.isForSale && listing.askingPriceAgorot !== undefined
      ? formatPrice(listing.askingPriceAgorot, language)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card className="overflow-hidden" testID={`my-listing-${listing.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        className="flex-row items-center gap-3 p-3 active:bg-surface-raised"
      >
        <View className="h-20 w-14 overflow-hidden rounded-button bg-surface-raised">
          {listing.coverImageId ? (
            <Image
              source={coverUrl(listing.coverImageId, 'cover_small')}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          ) : null}
        </View>
        <View className="flex-1 gap-1">
          <Text className="font-medium" numberOfLines={2}>
            {listing.gameTitle}
          </Text>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Chip
              platform={PLATFORMS[listing.platform].family}
              label={PLATFORMS[listing.platform].label}
            />
            <Badge
              tone={STATUS_TONE[listing.status]}
              label={t(`listings.status.${listing.status}`)}
            />
            {listing.hasPhotos ? <Badge tone="accent" label={t('listings.photos.badge')} /> : null}
          </View>
          <Text variant="caption" tone="muted">
            {availability}
          </Text>
        </View>
      </Pressable>
      {open ? <ListingActions listing={listing} /> : null}
    </Card>
  );
}

type Pending = 'closeTraded' | 'closeSold' | 'remove' | null;

function ListingActions({ listing }: { listing: Listing }) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<ManageListingAction | null>(null);
  const [confirming, setConfirming] = useState<Pending>(null);
  const can = (action: ManageListingAction) => listingMachine.canTransition(listing.status, action);
  const allowed = {
    pause: can('pause'),
    resume: can('resume'),
    swapped: listing.isForTrade && can('closeTraded'),
    sold: listing.isForSale && can('closeSold'),
    remove: can('remove'),
  };
  const open = listing.status === 'active' || listing.status === 'paused';

  const run = async (action: ManageListingAction) => {
    setBusy(action);
    try {
      await manageListing({
        listingId: listing.id,
        action,
        ...(action === 'closeTraded' || action === 'closeSold'
          ? { closedWith: { kind: 'outside' as const } }
          : {}),
      });
      setConfirming(null);
    } catch {
      toast.show(t('listings.mine.changeFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (confirming) {
    const closing = confirming !== 'remove';
    return (
      <View className="gap-3 border-t border-border p-3" testID="confirm-panel">
        <Text className="font-medium">
          {t(closing ? 'listings.mine.whoWith' : 'listings.mine.removeConfirm')}
        </Text>
        {closing ? (
          <Text variant="caption" tone="muted">
            {t('listings.mine.whoWithHint')}
          </Text>
        ) : null}
        <Button
          variant={closing ? 'primary' : 'danger'}
          label={t(closing ? 'listings.mine.outside' : 'listings.mine.remove')}
          loading={busy === confirming}
          onPress={() => void run(confirming)}
          testID="confirm-action"
        />
        <Button
          variant="ghost"
          label={t('listings.mine.cancel')}
          onPress={() => setConfirming(null)}
        />
      </View>
    );
  }

  if (!open && listing.status !== 'reserved') {
    return (
      <View className="border-t border-border p-3">
        <Text variant="caption" tone="muted">
          {t('listings.mine.closed')}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-2 border-t border-border p-3" testID="listing-actions">
      {open ? (
        <Button
          variant="secondary"
          label={t('listings.mine.photos')}
          onPress={() =>
            router.push({ pathname: '/listings/[id]/photos', params: { id: listing.id } })
          }
          testID="action-photos"
        />
      ) : null}
      {allowed.pause ? (
        <Button
          variant="secondary"
          label={t('listings.mine.pause')}
          loading={busy === 'pause'}
          onPress={() => void run('pause')}
          testID="action-pause"
        />
      ) : null}
      {allowed.resume ? (
        <Button
          variant="secondary"
          label={t('listings.mine.resume')}
          loading={busy === 'resume'}
          onPress={() => void run('resume')}
          testID="action-resume"
        />
      ) : null}
      {allowed.swapped ? (
        <Button
          label={t('listings.mine.swapped')}
          onPress={() => setConfirming('closeTraded')}
          testID="action-swapped"
        />
      ) : null}
      {allowed.sold ? (
        <Button
          label={t('listings.mine.sold')}
          onPress={() => setConfirming('closeSold')}
          testID="action-sold"
        />
      ) : null}
      {allowed.remove ? (
        <Button
          variant="ghost"
          label={t('listings.mine.remove')}
          onPress={() => setConfirming('remove')}
          testID="action-remove"
        />
      ) : null}
    </View>
  );
}
