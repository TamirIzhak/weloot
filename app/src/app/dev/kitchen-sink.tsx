import { Redirect, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  Text,
  useToast,
} from '@/components';
import {
  currentLanguage,
  formatNumber,
  formatPrice,
  isolate,
  LANGUAGES,
  setLanguage,
  type Language,
} from '@/i18n';

// Sample data: product names stay in English in both languages (PRD §3.5), so they aren't translation keys.
const SAMPLE_GAME = 'The Legend of Zelda: Tears of the Kingdom';
const SAMPLE_GAME_SHORT = 'Zelda TOTK';
const PLATFORM_LABELS = { ps: 'PS5', xbox: 'Xbox Series X|S', nintendo: 'Switch' } as const;
const SAMPLE_PRICE_AGOROT = 15000;
const FILTERS = ['all', 'trade', 'sale'] as const;

/**
 * Development-only gallery of the base components (issues #4, #5), for checking them on a real phone in both
 * languages. Redirects home in release builds.
 */
export default function KitchenSink() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const language = currentLanguage();
  const [selected, setSelected] = useState<(typeof FILTERS)[number]>('all');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  if (!__DEV__) return <Redirect href="/" />;

  const pressed = (label: string) => () => toast.show(t('kitchenSink.buttons.pressed', { label }));

  const switchTo = (next: Language) => {
    if (next === language) return;
    toast.show(t('language.applying'));
    setLanguage(next).catch((error: unknown) => {
      console.warn('[i18n] language switch failed', error);
      toast.show(t('language.failed'), 'error');
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerClassName="gap-8 p-4 pb-24">
        <View className="flex-row items-center justify-between">
          <Text variant="heading">{t('kitchenSink.title')}</Text>
          <Button variant="ghost" label={t('common.back')} onPress={() => router.back()} />
        </View>

        <Section title={t('kitchenSink.sections.language')}>
          <View className="flex-row gap-2">
            {LANGUAGES.map((lang) => (
              <Chip
                key={lang}
                label={t(lang === 'en' ? 'language.english' : 'language.hebrew')}
                selected={lang === language}
                onPress={() => switchTo(lang)}
                testID={`language-${lang}`}
              />
            ))}
          </View>
          <Text variant="caption" tone="muted">
            {t('kitchenSink.languageHint')}
          </Text>
        </Section>

        <Section title={t('kitchenSink.sections.text')}>
          <Text variant="title">{t('kitchenSink.text.title')}</Text>
          <Text variant="heading">{t('kitchenSink.text.heading')}</Text>
          <Text variant="subheading">{t('kitchenSink.text.subheading')}</Text>
          <Text>{t('kitchenSink.text.body')}</Text>
          <Text variant="label" tone="secondary">
            {t('kitchenSink.text.label')}
          </Text>
          <Text variant="caption" tone="muted">
            {t('kitchenSink.text.caption')}
          </Text>
          <View className="flex-row gap-3">
            <Text tone="accent">{t('kitchenSink.text.accent')}</Text>
            <Text tone="success">{t('kitchenSink.text.success')}</Text>
            <Text tone="danger">{t('kitchenSink.text.danger')}</Text>
          </View>
        </Section>

        <Section title={t('kitchenSink.sections.formatting')}>
          <Text>
            {t('kitchenSink.formatting.price', {
              price: isolate(formatPrice(SAMPLE_PRICE_AGOROT, language)),
            })}
          </Text>
          <Text>
            {t('kitchenSink.formatting.mixed', {
              count: isolate(formatNumber(4, language)),
              game: isolate(SAMPLE_GAME_SHORT),
            })}
          </Text>
        </Section>

        <Section title={t('kitchenSink.sections.buttons')}>
          <Button
            label={t('kitchenSink.buttons.makeOffer')}
            onPress={pressed(t('kitchenSink.buttons.makeOffer'))}
          />
          <Button
            variant="secondary"
            label={t('kitchenSink.buttons.askQuestion')}
            onPress={pressed(t('kitchenSink.buttons.askQuestion'))}
          />
          <Button
            variant="ghost"
            label={t('kitchenSink.buttons.ghost')}
            onPress={pressed(t('kitchenSink.buttons.ghost'))}
          />
          <Button
            variant="danger"
            label={t('kitchenSink.buttons.cancelDeal')}
            onPress={() =>
              toast.show(
                t('kitchenSink.buttons.pressed', { label: t('kitchenSink.buttons.cancelDeal') }),
                'error',
              )
            }
          />
          <Button
            size="lg"
            fullWidth
            label={t('kitchenSink.buttons.large')}
            onPress={pressed(t('kitchenSink.buttons.large'))}
          />
          <Button
            label={t('kitchenSink.buttons.tapToLoad')}
            loading={loading}
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          />
          <Button label={t('kitchenSink.buttons.disabled')} disabled onPress={() => undefined} />
        </Section>

        <Section title={t('kitchenSink.sections.chips')}>
          <View className="flex-row flex-wrap gap-2">
            <Chip platform="ps" label={PLATFORM_LABELS.ps} />
            <Chip platform="xbox" label={PLATFORM_LABELS.xbox} />
            <Chip platform="nintendo" label={PLATFORM_LABELS.nintendo} />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {FILTERS.map((value) => (
              <Chip
                key={value}
                label={t(
                  value === 'all'
                    ? 'kitchenSink.chips.all'
                    : value === 'trade'
                      ? 'kitchenSink.chips.forTrade'
                      : 'kitchenSink.chips.forSale',
                )}
                selected={selected === value}
                onPress={() => setSelected(value)}
              />
            ))}
          </View>
          <View className="flex-row flex-wrap gap-2">
            <Badge label={t('kitchenSink.chips.realPhotos')} />
            <Badge tone="primary" label={t('kitchenSink.chips.perfectMatch')} />
            <Badge tone="success" label={t('kitchenSink.chips.traded')} />
            <Badge tone="warning" label={t('kitchenSink.chips.reserved')} />
            <Badge tone="neutral" label={t('kitchenSink.chips.trade')} />
          </View>
        </Section>

        <Section title={t('kitchenSink.sections.card')}>
          <Card
            onPress={() => toast.show(t('kitchenSink.card.pressed'))}
            accessibilityLabel={SAMPLE_GAME}
          >
            <View className="h-40 bg-surface-raised" />
            <View className="gap-2 p-4">
              <View className="flex-row gap-2">
                <Chip platform="nintendo" label={PLATFORM_LABELS.nintendo} />
                <Badge label={t('kitchenSink.chips.realPhotos')} />
              </View>
              <Text variant="subheading">{SAMPLE_GAME}</Text>
              <Text variant="caption" tone="secondary">
                {t('kitchenSink.card.condition', {
                  distance: isolate(t('common.km', { value: formatNumber(3, language) })),
                })}
              </Text>
            </View>
          </Card>
        </Section>

        <Section title={t('kitchenSink.sections.input')}>
          <Input
            label={t('kitchenSink.input.username')}
            placeholder={t('kitchenSink.input.usernamePlaceholder')}
            value={name}
            onChangeText={setName}
            helper={t('kitchenSink.input.usernameHelper')}
          />
          <Input
            label={t('kitchenSink.input.usernameErrorLabel')}
            value="ab"
            error={t('kitchenSink.input.usernameError')}
          />
        </Section>

        <Section title={t('kitchenSink.sections.skeleton')}>
          <Skeleton className="h-40 w-full rounded-card" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </Section>

        <Section title={t('kitchenSink.sections.states')}>
          <Card>
            <EmptyState
              title={t('kitchenSink.states.emptyTitle')}
              body={t('kitchenSink.states.emptyBody')}
              primaryAction={{
                label: t('kitchenSink.states.notifyMe'),
                onPress: () => toast.show(t('kitchenSink.states.alertCreated'), 'success'),
              }}
              secondaryAction={{
                label: t('kitchenSink.states.addToWantList'),
                onPress: () => toast.show(t('kitchenSink.states.added')),
              }}
            />
          </Card>
          <Card>
            <ErrorState
              title={t('kitchenSink.states.errorTitle')}
              message={t('kitchenSink.states.errorMessage')}
              retryLabel={t('common.tryAgain')}
              onRetry={() => toast.show(t('kitchenSink.states.retrying'))}
            />
          </Card>
        </Section>

        <Section title={t('kitchenSink.sections.toasts')}>
          <View className="flex-row flex-wrap gap-2">
            <Button
              variant="secondary"
              label={t('kitchenSink.toasts.info')}
              onPress={() => toast.show(t('kitchenSink.toasts.offerSent'))}
            />
            <Button
              variant="secondary"
              label={t('kitchenSink.toasts.success')}
              onPress={() => toast.show(t('kitchenSink.toasts.tradeCompleted'), 'success')}
            />
            <Button
              variant="secondary"
              label={t('kitchenSink.toasts.error')}
              onPress={() => toast.show(t('kitchenSink.toasts.sendFailed'), 'error')}
            />
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="label" tone="muted" className="uppercase tracking-widest">
        {title}
      </Text>
      {children}
    </View>
  );
}
