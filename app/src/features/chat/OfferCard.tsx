import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PLATFORMS, type OfferStatus } from '@weloot/shared';

import { Badge, Button, Card, Text, useToast, type BadgeTone } from '@/components';
import { coverUrl } from '@/features/catalog/igdbImages';
import { OfferError, respondToOffer, type Offer } from '@/features/offers/offersApi';
import { currentLanguage, formatPrice, isolate } from '@/i18n';

const STATUS_TONE: Record<OfferStatus, BadgeTone> = {
  pending: 'primary',
  accepted: 'success',
  declined: 'neutral',
  superseded: 'neutral',
  withdrawn: 'neutral',
  expired: 'neutral',
};

const ERROR_KEY: Partial<Record<OfferError['reason'], string>> = {
  listingUnavailable: 'offers.errors.listingUnavailable',
  offerExpired: 'chat.errors.offerExpired',
  offerNotPending: 'chat.errors.offerNotPending',
  notLatestOffer: 'chat.errors.offerNotPending',
  dealExists: 'offers.errors.dealExists',
};

function Side({ title, ids, offer }: { title: string; ids: string[]; offer: Offer }) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 gap-1.5">
      <Text variant="caption" tone="secondary">
        {title}
      </Text>
      {ids.length === 0 ? (
        <Text variant="caption" tone="muted">
          {t('chat.offer.noGames')}
        </Text>
      ) : (
        ids.map((id) => {
          const item = offer.items[id];
          if (!item) return null;
          return (
            <View key={id} className="flex-row items-center gap-2">
              <View className="h-12 w-9 overflow-hidden rounded-button bg-surface-raised">
                {item.coverImageId ? (
                  <Image
                    source={coverUrl(item.coverImageId, 'cover_small')}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : null}
              </View>
              <View className="flex-1">
                <Text variant="caption" className="font-medium" numberOfLines={2}>
                  {item.gameTitle}
                </Text>
                <Text variant="caption" tone="muted">
                  {PLATFORMS[item.platform].label}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

/**
 * An offer in the chat (PRD W5): both sides' games, the cash line, the note and its status. The recipient of the
 * latest pending offer can Accept / Counter / Decline; its sender can Withdraw.
 */
export function OfferCard({
  offer,
  me,
  latest,
  conversationId,
  names,
  onCounter,
}: {
  offer: Offer;
  me: string;
  /** Only the conversation's current offer can be acted on. */
  latest: boolean;
  conversationId: string;
  names: { me: string; them: string };
  onCounter: (offer: Offer) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const language = currentLanguage();
  const [busy, setBusy] = useState<string | null>(null);
  const mine = offer.fromUid === me;
  const actionable = latest && offer.status === 'pending';

  const act = async (action: 'accept' | 'decline' | 'withdraw') => {
    setBusy(action);
    try {
      await respondToOffer({ conversationId, offerId: offer.id, action });
    } catch (error) {
      const key = error instanceof OfferError ? ERROR_KEY[error.reason] : undefined;
      toast.show(t(key ?? 'offers.errors.failed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const cash =
    offer.cashAgorot > 0
      ? t('chat.offer.cash', {
          amount: isolate(formatPrice(offer.cashAgorot, language)),
          payer: offer.cashPayerId === me ? names.me : names.them,
        })
      : null;

  return (
    <Card className="gap-3 p-3" testID={`offer-${offer.id}`}>
      <View className="flex-row items-center justify-between">
        <Text className="font-medium">
          {t(mine ? 'chat.offer.fromMe' : 'chat.offer.fromThem', { name: names.them })}
        </Text>
        <Badge tone={STATUS_TONE[offer.status]} label={t(`chat.offer.status.${offer.status}`)} />
      </View>
      <View className="flex-row gap-3">
        {/* Always from the reader's side: what I give, what I get. */}
        <Side
          title={t('chat.offer.youGive')}
          ids={mine ? offer.itemsFrom : offer.itemsTo}
          offer={offer}
        />
        <Side
          title={t('chat.offer.youGet')}
          ids={mine ? offer.itemsTo : offer.itemsFrom}
          offer={offer}
        />
      </View>
      {cash ? (
        <View className="gap-0.5">
          <Text variant="caption">{cash}</Text>
          <Text variant="caption" tone="muted">
            {t('offers.composer.cashHint')}
          </Text>
        </View>
      ) : null}
      {offer.note ? (
        <Text variant="caption" tone="secondary">
          {offer.note}
        </Text>
      ) : null}
      {actionable && !mine ? (
        <View className="flex-row flex-wrap gap-2">
          <Button
            label={t('chat.offer.accept')}
            loading={busy === 'accept'}
            disabled={busy !== null}
            onPress={() => void act('accept')}
            testID={`offer-accept-${offer.id}`}
          />
          <Button
            variant="secondary"
            label={t('chat.offer.counter')}
            disabled={busy !== null}
            onPress={() => onCounter(offer)}
            testID={`offer-counter-${offer.id}`}
          />
          <Button
            variant="ghost"
            label={t('chat.offer.decline')}
            loading={busy === 'decline'}
            disabled={busy !== null}
            onPress={() => void act('decline')}
            testID={`offer-decline-${offer.id}`}
          />
        </View>
      ) : null}
      {actionable && mine ? (
        <Button
          variant="ghost"
          label={t('chat.offer.withdraw')}
          loading={busy === 'withdraw'}
          onPress={() => void act('withdraw')}
          testID={`offer-withdraw-${offer.id}`}
        />
      ) : null}
    </Card>
  );
}
