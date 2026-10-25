import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { CASH_TOP_UP_MAX_AGOROT, shekelsToAgorot, type OfferInput } from '@weloot/shared';

import { Button, Chip, ErrorState, Input, Text, useToast } from '@/components';
import { useAddDraft } from '@/features/listings/addDraft';
import { useListing, type Listing } from '@/features/listings/useListing';
import { parseShekels } from '@/features/search/searchFilters';
import { currentLanguage, formatPrice } from '@/i18n';
import { colors } from '@/theme/tokens';

import { registerForPush } from '@/features/notifications/push';

import { GamePicker } from './GamePicker';
import {
  OfferError,
  sendOffer,
  startConversation,
  useActiveListingsOf,
  useConversation,
  useOffer,
  type Offer,
} from './offersApi';

const CASH_MODES = ['none', 'me', 'them'] as const;
type CashMode = (typeof CASH_MODES)[number];
type Form = {
  give: string[];
  get: string[];
  cash: CashMode;
  shekels: string;
  note: string;
};

const ERROR_KEY: Partial<Record<OfferError['reason'], string>> = {
  listingUnavailable: 'offers.errors.listingUnavailable',
  notForSale: 'offers.errors.notForSale',
  dealExists: 'offers.errors.dealExists',
  blocked: 'offers.errors.blocked',
  ownListing: 'offers.errors.ownListing',
  rateLimited: 'offers.errors.rateLimited',
};

const MAX_SHEKELS = CASH_TOP_UP_MAX_AGOROT / 100;

/** The form a new offer starts from: the game page's listing, or a counter-offer with the sides swapped. */
function initialForm(me: string, listing: Listing, counter: Offer | null): Form {
  if (counter) {
    return {
      give: counter.itemsTo,
      get: counter.itemsFrom,
      cash: counter.cashAgorot === 0 ? 'none' : counter.cashPayerId === me ? 'me' : 'them',
      shekels: counter.cashAgorot > 0 ? String(counter.cashAgorot / 100) : '',
      note: '',
    };
  }
  // The game page's listing starts on its owner's side: theirs to get, or mine to give when I own it.
  const own = listing.userId === me;
  return {
    give: own ? [listing.id] : [],
    get: own ? [] : [listing.id],
    cash: 'none',
    shekels: '',
    note: '',
  };
}

/**
 * Offer composer (PRD W5, #24): your games, theirs, an optional cash top-up either way (whole ₪, up to ₪2,000,
 * recorded, not processed), and a note. A counter-offer opens prefilled. Quick Add lists a game without leaving.
 */
export function OfferComposer({
  me,
  listingId,
  conversationId,
  counterOfferId,
}: {
  me: string;
  listingId: string;
  conversationId?: string;
  counterOfferId?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const language = currentLanguage();
  const listingState = useListing(listingId);
  const conversation = useConversation(conversationId);
  const counter = useOffer(conversationId, counterOfferId);
  const listing = listingState.status === 'ready' ? listingState.listing : null;
  const them =
    conversation && conversation !== 'loading'
      ? conversation.participants.find((p) => p !== me)
      : listing?.userId !== me
        ? listing?.userId
        : undefined;
  const mine = useActiveListingsOf(me);
  const theirs = useActiveListingsOf(them);
  const [edited, setEdited] = useState<Form | null>(null);
  const [sending, setSending] = useState(false);

  // A game just listed with Quick Add goes straight into the offer.
  useFocusEffect(
    useCallback(() => {
      const added = useAddDraft.getState().takeQuickResult();
      if (added) {
        setEdited((current) =>
          current ? { ...current, give: [...current.give, added] } : current,
        );
      }
    }, []),
  );

  const waitingForCounter = counterOfferId !== undefined && counter === null;
  if (
    listingState.status === 'loading' ||
    conversation === 'loading' ||
    mine === null ||
    theirs === null ||
    waitingForCounter
  ) {
    return <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />;
  }
  if (!listing || !them) {
    return <ErrorState title={t('offers.errors.listingUnavailable')} className="m-4" />;
  }

  const form = edited ?? initialForm(me, listing, counter);
  const update = (patch: Partial<Form>) => setEdited({ ...form, ...patch });
  const toggle = (side: 'give' | 'get', id: string) =>
    update({
      [side]: form[side].includes(id) ? form[side].filter((x) => x !== id) : [...form[side], id],
    });

  const shekels = parseShekels(form.shekels);
  const cashValid =
    form.cash === 'none' || (shekels !== undefined && shekels >= 1 && shekels <= MAX_SHEKELS);
  const byId = new Map([...mine, ...theirs].map((l) => [l.id, l]));
  const forSale = (ids: string[]) => ids.every((id) => byId.get(id)?.isForSale === true);
  const cashOnlyOk =
    (form.give.length > 0 || forSale(form.get)) && (form.get.length > 0 || forSale(form.give));
  const hasGames = form.give.length + form.get.length > 0;
  const canSend = hasGames && cashValid && cashOnlyOk && !sending;

  const send = async () => {
    const offer: OfferInput = {
      itemsFrom: form.give,
      itemsTo: form.get,
      cashAgorot: form.cash === 'none' || shekels === undefined ? 0 : shekelsToAgorot(shekels),
      ...(form.cash !== 'none' ? { cashPayerId: form.cash === 'me' ? me : them } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    };
    setSending(true);
    try {
      const id = conversationId
        ? (await sendOffer(conversationId, offer, counterOfferId !== undefined), conversationId)
        : (await startConversation({ listingId, opener: 'offer', offer })).conversationId;
      // A push when they answer is the point of sending an offer: ask now, if not asked yet.
      void registerForPush(true);
      router.replace({ pathname: '/conversations/[id]', params: { id } });
    } catch (error) {
      const key = error instanceof OfferError ? ERROR_KEY[error.reason] : undefined;
      toast.show(t(key ?? 'offers.errors.failed'), 'error');
      setSending(false);
    }
  };

  return (
    <View className="gap-6" testID="offer-composer">
      <View className="gap-2">
        <Text variant="label" tone="secondary">
          {t('offers.composer.youGive')}
        </Text>
        {mine.length === 0 ? (
          <Text variant="caption" tone="muted">
            {t('offers.composer.noGames')}
          </Text>
        ) : null}
        <GamePicker
          listings={mine}
          selected={new Set(form.give)}
          onToggle={(id) => toggle('give', id)}
          onQuickAdd={() => {
            useAddDraft.getState().startQuick();
            router.push('/add/quick');
          }}
          testID="give"
        />
      </View>

      <View className="gap-2">
        <Text variant="label" tone="secondary">
          {t('offers.composer.youGet')}
        </Text>
        <GamePicker
          listings={theirs}
          selected={new Set(form.get)}
          onToggle={(id) => toggle('get', id)}
          testID="get"
        />
      </View>

      <View className="gap-2">
        <Text variant="label" tone="secondary">
          {t('offers.composer.cash')}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {CASH_MODES.map((mode) => (
            <Chip
              key={mode}
              label={t(`offers.composer.cashMode.${mode}`)}
              selected={form.cash === mode}
              onPress={() => update({ cash: mode })}
              testID={`cash-${mode}`}
            />
          ))}
        </View>
        {form.cash !== 'none' ? (
          <Input
            label={t('offers.composer.amount', {
              max: formatPrice(CASH_TOP_UP_MAX_AGOROT, language),
            })}
            value={form.shekels}
            onChangeText={(text) => update({ shekels: text.replace(/[^\d]/g, '') })}
            keyboardType="number-pad"
            maxLength={4}
            error={
              form.shekels !== '' && !cashValid ? t('offers.composer.amountInvalid') : undefined
            }
            testID="cash-amount"
          />
        ) : null}
        <Text variant="caption" tone="muted">
          {t('offers.composer.cashHint')}
        </Text>
      </View>

      <Input
        label={t('offers.composer.note')}
        value={form.note}
        onChangeText={(note) => update({ note })}
        multiline
        maxLength={300}
        testID="offer-note"
      />

      {!hasGames ? (
        <Text variant="caption" tone="muted" testID="offer-needs-game">
          {t('offers.composer.needsGame')}
        </Text>
      ) : !cashOnlyOk ? (
        <Text variant="caption" tone="danger" testID="offer-not-for-sale">
          {t('offers.errors.notForSale')}
        </Text>
      ) : null}

      <Button
        size="lg"
        label={t(counterOfferId ? 'offers.composer.sendCounter' : 'offers.composer.send')}
        disabled={!canSend}
        loading={sending}
        onPress={() => void send()}
        testID="offer-send"
      />
    </View>
  );
}
