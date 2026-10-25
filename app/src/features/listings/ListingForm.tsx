import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';

import {
  ASKING_PRICE_MAX_AGOROT,
  ASKING_PRICE_MIN_AGOROT,
  CONDITIONS,
  isWholeShekelAmount,
  PLATFORMS,
  shekelsToAgorot,
  type Condition,
} from '@weloot/shared';

import { Button, Card, Chip, Input, Text } from '@/components';
import { coverUrl } from '@/features/catalog/igdbImages';
import { LocationPicker } from '@/features/location/LocationPicker';
import { isolate } from '@/i18n';
import { colors } from '@/theme/tokens';

import { useAddDraft } from './addDraft';
import { newListingId, publishErrorReason, publishListing } from './listingsApi';

const PUBLISH_ERROR_KEYS: Record<string, string> = {
  unknownLocation: 'listings.errors.unknownLocation',
  wrongPlatform: 'listings.errors.wrongPlatform',
  unknownGame: 'listings.errors.unknownGame',
  phoneRequired: 'listings.errors.phoneRequired',
  profileRequired: 'listings.errors.profileRequired',
};

/**
 * Add flow, steps 2–3 (PRD W2): where you swap from (a saved address; only its area is published), condition,
 * case, trade and/or sale with a price, and notes. Publishing goes through the server; the request ID makes a
 * double tap create one listing.
 */
export function ListingForm({ uid }: { uid: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const game = useAddDraft((s) => s.game);
  const platform = useAddDraft((s) => s.platform);
  const reset = useAddDraft((s) => s.reset);
  const [requestId] = useState(newListingId);
  const [locationId, setLocationId] = useState<string | undefined>();
  const [condition, setCondition] = useState<Condition | null>(null);
  const [hasCase, setHasCase] = useState(true);
  const [isForTrade, setIsForTrade] = useState(true);
  const [isForSale, setIsForSale] = useState(false);
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!game || !platform) return null;

  const shekels = Number.parseInt(price, 10);
  const priceAgorot = Number.isNaN(shekels) ? undefined : shekelsToAgorot(shekels);
  const priceValid =
    !isForSale ||
    (/^\d+$/.test(price) &&
      isWholeShekelAmount(priceAgorot, ASKING_PRICE_MIN_AGOROT, ASKING_PRICE_MAX_AGOROT));
  const canPublish =
    locationId !== undefined &&
    condition !== null &&
    (isForTrade || isForSale) &&
    priceValid &&
    !publishing;

  const publish = async () => {
    if (!canPublish || !condition || !locationId) return;
    setPublishing(true);
    setError(undefined);
    try {
      const listingId = await publishListing({
        requestId,
        locationId,
        listing: {
          igdbGameId: game.igdbGameId,
          platform,
          condition,
          hasCase,
          notes: notes.trim(),
          isForTrade,
          isForSale,
          ...(isForSale ? { askingPriceAgorot: priceAgorot } : {}),
        },
      });
      reset();
      router.replace({ pathname: '/add/done', params: { listingId } });
    } catch (e) {
      const reason = publishErrorReason(e);
      setError(t(PUBLISH_ERROR_KEYS[reason ?? ''] ?? 'listings.errors.publishFailed'));
      setPublishing(false);
    }
  };

  return (
    <View className="gap-6" testID="listing-form">
      <Card className="flex-row items-center gap-3 p-3">
        <View className="h-20 w-14 overflow-hidden rounded-button bg-surface-raised">
          {game.coverImageId ? (
            <Image
              source={coverUrl(game.coverImageId, 'cover_small')}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          ) : null}
        </View>
        <View className="flex-1 gap-1">
          <Text variant="subheading" numberOfLines={2}>
            {game.title}
          </Text>
          <Chip platform={PLATFORMS[platform].family} label={PLATFORMS[platform].label} />
        </View>
      </Card>

      <Section title={t('listings.form.location')} hint={t('listings.form.locationHint')}>
        <LocationPicker
          uid={uid}
          selectedId={locationId}
          onSelect={(item) => setLocationId(item.id)}
          autoSelectFirst={(id) => setLocationId((current) => current ?? id)}
        />
      </Section>

      <Section title={t('listings.form.condition')}>
        <View className="flex-row flex-wrap gap-2">
          {CONDITIONS.map((c) => (
            <Chip
              key={c}
              label={t(`listings.condition.${c}`)}
              selected={condition === c}
              onPress={() => setCondition(c)}
              testID={`condition-${c}`}
            />
          ))}
        </View>
      </Section>

      <View className="flex-row items-center justify-between">
        <Text>{t('listings.form.hasCase')}</Text>
        <Switch
          value={hasCase}
          onValueChange={setHasCase}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors['text-primary']}
          accessibilityLabel={t('listings.form.hasCase')}
          testID="has-case"
        />
      </View>

      <Section title={t('listings.form.availability')} hint={t('listings.form.availabilityHint')}>
        <View className="flex-row gap-2">
          <Chip
            label={t('listings.form.forTrade')}
            selected={isForTrade}
            onPress={() => setIsForTrade((v) => !v)}
            testID="for-trade"
          />
          <Chip
            label={t('listings.form.forSale')}
            selected={isForSale}
            onPress={() => setIsForSale((v) => !v)}
            testID="for-sale"
          />
        </View>
        {isForSale ? (
          <Input
            label={t('listings.form.price', { currency: isolate('₪') })}
            placeholder={t('listings.form.pricePlaceholder')}
            value={price}
            onChangeText={(value) => setPrice(value.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            maxLength={4}
            error={price !== '' && !priceValid ? t('listings.form.priceInvalid') : undefined}
            helper={t('listings.form.priceHint')}
            testID="price-input"
          />
        ) : null}
      </Section>

      <Input
        label={t('listings.form.notes')}
        placeholder={t('listings.form.notesPlaceholder')}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={300}
        helper={t('listings.form.notesHint', { count: notes.length })}
        testID="notes-input"
      />

      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite" testID="publish-error">
          {error}
        </Text>
      ) : null}

      <Button
        size="lg"
        fullWidth
        label={t('listings.form.publish')}
        loading={publishing}
        disabled={!canPublish}
        onPress={() => void publish()}
        testID="publish"
      />
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <View className="gap-0.5">
        <Text variant="label" tone="secondary">
          {title}
        </Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
