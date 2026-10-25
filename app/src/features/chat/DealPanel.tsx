import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Input, Text, useToast } from '@/components';
import { dealAction, OfferError, type Conversation, type Offer } from '@/features/offers/offersApi';
import { currentLanguage, formatPrice, isolate } from '@/i18n';

/**
 * The deal at the top of the chat (PRD W6, #47): what each side gives, the cash line and the status, with the
 * actions that fit: Swapped / Cancel deal while agreed; "Did you swap…?" Yes / No for the person asked to confirm.
 */
export function DealPanel({
  conversation,
  offers,
  me,
  names,
}: {
  conversation: Conversation;
  offers: ReadonlyMap<string, Offer>;
  me: string;
  names: { me: string; them: string };
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const language = currentLanguage();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const deal = conversation.deal;
  if (!deal) return null;

  const offer = deal.offerId ? offers.get(deal.offerId) : undefined;
  const title = (ids: string[]) =>
    ids
      .map((id) => offer?.items[id]?.gameTitle)
      .filter(Boolean)
      .join(', ');
  const mineIds = conversation.ownerId === me ? deal.itemsOwner : deal.itemsOther;
  const theirIds = conversation.ownerId === me ? deal.itemsOther : deal.itemsOwner;
  const iConfirmed = deal.confirmedBy.includes(me);
  const games = title([...mineIds, ...theirIds]) || t('chat.deal.theGames');

  const run = async (action: 'confirm' | 'dispute' | 'cancel') => {
    setBusy(action);
    try {
      await dealAction({
        conversationId: conversation.id,
        action,
        ...(action === 'cancel' ? { reason: reason.trim() } : {}),
      });
      setCancelling(false);
    } catch (error) {
      const stale = error instanceof OfferError && error.reason === 'invalidTransition';
      toast.show(t(stale ? 'chat.deal.errors.changed' : 'offers.errors.failed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-2 border-b border-border bg-surface px-4 py-3" testID="deal-header">
      <Text className="font-medium">{t(`chat.deal.status.${deal.status}`)}</Text>
      {offer ? (
        <Text variant="caption" tone="secondary">
          {t('chat.deal.summary', {
            give: title(mineIds) || t('chat.offer.noGames'),
            get: title(theirIds) || t('chat.offer.noGames'),
          })}
        </Text>
      ) : null}
      {deal.cashAgorot > 0 ? (
        <Text variant="caption" tone="secondary">
          {t('chat.offer.cash', {
            amount: isolate(formatPrice(deal.cashAgorot, language)),
            payer: deal.cashPayerId === me ? names.me : names.them,
          })}
        </Text>
      ) : null}

      {deal.status === 'agreed' && !cancelling ? (
        <View className="flex-row flex-wrap gap-2">
          <Button
            label={t('chat.deal.swapped')}
            loading={busy === 'confirm'}
            disabled={busy !== null}
            onPress={() => void run('confirm')}
            testID="deal-swapped"
          />
          <Button
            variant="ghost"
            label={t('chat.deal.cancel')}
            disabled={busy !== null}
            onPress={() => setCancelling(true)}
            testID="deal-cancel"
          />
        </View>
      ) : null}

      {cancelling ? (
        <View className="gap-2" testID="deal-cancel-panel">
          <Input
            label={t('chat.deal.cancelReason')}
            value={reason}
            onChangeText={setReason}
            maxLength={300}
            testID="deal-cancel-reason"
          />
          <View className="flex-row flex-wrap gap-2">
            <Button
              variant="danger"
              label={t('chat.deal.cancelConfirm')}
              disabled={reason.trim() === '' || busy !== null}
              loading={busy === 'cancel'}
              onPress={() => void run('cancel')}
              testID="deal-cancel-confirm"
            />
            <Button
              variant="ghost"
              label={t('chat.deal.keep')}
              onPress={() => setCancelling(false)}
            />
          </View>
        </View>
      ) : null}

      {deal.status === 'awaiting_confirmation' && !iConfirmed ? (
        <View className="gap-2 rounded-card bg-surface-raised p-3" testID="deal-confirm-banner">
          <Text className="font-medium">
            {t('chat.deal.didYouSwap', { games, name: names.them })}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Button
              label={t('chat.deal.yes')}
              loading={busy === 'confirm'}
              disabled={busy !== null}
              onPress={() => void run('confirm')}
              testID="deal-yes"
            />
            <Button
              variant="ghost"
              label={t('chat.deal.no')}
              loading={busy === 'dispute'}
              disabled={busy !== null}
              onPress={() => void run('dispute')}
              testID="deal-no"
            />
          </View>
        </View>
      ) : null}

      {deal.status === 'awaiting_confirmation' && iConfirmed ? (
        <Text variant="caption" tone="muted" testID="deal-waiting">
          {t('chat.deal.waitingFor', { name: names.them })}
        </Text>
      ) : null}
    </View>
  );
}
