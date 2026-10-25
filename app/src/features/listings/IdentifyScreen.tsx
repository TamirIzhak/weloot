import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { PLATFORMS, type BarcodeLookupResult, type PlatformKey } from '@weloot/shared';

import { Button, Card, Chip, Text } from '@/components';
import { GameRow, GameSearch } from '@/features/catalog/GameSearch';
import { colors } from '@/theme/tokens';

import { draftGameFrom, useAddDraft, type DraftGame } from './addDraft';
import { confirmBarcode, lookupBarcode } from './barcodeApi';
import { BarcodeScanner } from './BarcodeScanner';

type Step =
  | { kind: 'scan'; attempt: number }
  | { kind: 'looking'; ean: string }
  | { kind: 'result'; result: BarcodeLookupResult }
  | { kind: 'lookupFailed'; ean: string }
  | { kind: 'search'; ean: string | null; unknownBarcode: boolean }
  | { kind: 'platform'; game: DraftGame; ean: string | null; preset: PlatformKey | null };

/**
 * Add flow, step 1 (PRD W2): identify the game by scanning its barcode (our table, then suggestions) or by search,
 * then pick the exact platform. A scanned barcode is confirmed back to the server so the table improves.
 */
export function IdentifyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setIdentified = useAddDraft((s) => s.setIdentified);
  const [step, setStep] = useState<Step>({ kind: 'scan', attempt: 0 });
  const mode = step.kind === 'search' || step.kind === 'platform' ? 'search' : 'scan';

  // Back on + after publishing (the draft was cleared): start over.
  useFocusEffect(
    useCallback(() => {
      if (!useAddDraft.getState().game) setStep({ kind: 'scan', attempt: Date.now() });
    }, []),
  );

  const scanned = async (ean: string) => {
    setStep({ kind: 'looking', ean });
    try {
      setStep({ kind: 'result', result: await lookupBarcode(ean) });
    } catch {
      setStep({ kind: 'lookupFailed', ean });
    }
  };

  const finish = (game: DraftGame, platform: PlatformKey, ean: string | null) => {
    setIdentified(game, platform, ean);
    // Improves the barcode table for everyone; never blocks the user.
    if (ean) confirmBarcode({ ean, igdbGameId: game.igdbGameId, platform }).catch(() => undefined);
    router.push('/add/details');
  };

  return (
    <View className="gap-5" testID="identify">
      <View className="gap-2">
        <Text variant="title">{t('listings.identify.title')}</Text>
        <View className="flex-row gap-2">
          <Chip
            label={t('listings.identify.scan')}
            selected={mode === 'scan'}
            onPress={() => setStep({ kind: 'scan', attempt: Date.now() })}
            testID="mode-scan"
          />
          <Chip
            label={t('listings.identify.search')}
            selected={mode === 'search'}
            onPress={() => setStep({ kind: 'search', ean: null, unknownBarcode: false })}
            testID="mode-search"
          />
        </View>
      </View>

      {step.kind === 'scan' ? (
        <BarcodeScanner
          key={step.attempt}
          onScanned={(ean) => void scanned(ean)}
          onSearchInstead={() => setStep({ kind: 'search', ean: null, unknownBarcode: false })}
        />
      ) : null}

      {step.kind === 'looking' ? (
        <View className="items-center gap-2 py-6" testID="barcode-looking">
          <ActivityIndicator color={colors.primary} />
          <Text tone="secondary">{t('listings.identify.looking')}</Text>
        </View>
      ) : null}

      {step.kind === 'lookupFailed' ? (
        <Card className="gap-3 p-4" testID="barcode-failed">
          <Text>{t('listings.identify.lookupFailed')}</Text>
          <Button label={t('common.tryAgain')} onPress={() => void scanned(step.ean)} />
          <Button
            variant="ghost"
            label={t('listings.identify.searchInstead')}
            onPress={() => setStep({ kind: 'search', ean: step.ean, unknownBarcode: false })}
          />
        </Card>
      ) : null}

      {step.kind === 'result' ? (
        <ScanResult
          result={step.result}
          onPick={(game, preset) =>
            setStep({ kind: 'platform', game, ean: step.result.ean, preset })
          }
          onSearch={() =>
            setStep({
              kind: 'search',
              ean: step.result.ean,
              unknownBarcode: !step.result.match && step.result.suggestions.length === 0,
            })
          }
          onScanAgain={() => setStep({ kind: 'scan', attempt: Date.now() })}
        />
      ) : null}

      {step.kind === 'search' ? (
        <View className="gap-3">
          {step.unknownBarcode ? (
            <Text tone="secondary" testID="barcode-unknown">
              {t('listings.identify.unknownBarcode')}
            </Text>
          ) : null}
          <GameSearch
            autoFocus
            onSelect={(record) =>
              setStep({
                kind: 'platform',
                game: draftGameFrom(record),
                ean: step.ean,
                preset: null,
              })
            }
          />
        </View>
      ) : null}

      {step.kind === 'platform' ? (
        <PlatformStep
          game={step.game}
          preset={step.preset}
          onContinue={(platform) => finish(step.game, platform, step.ean)}
          onBack={() => setStep({ kind: 'search', ean: step.ean, unknownBarcode: false })}
        />
      ) : null}
    </View>
  );
}

function ScanResult({
  result,
  onPick,
  onSearch,
  onScanAgain,
}: {
  result: BarcodeLookupResult;
  onPick: (game: DraftGame, preset: PlatformKey | null) => void;
  onSearch: () => void;
  onScanAgain: () => void;
}) {
  const { t } = useTranslation();
  if (result.match) {
    const { match } = result;
    return (
      <Card className="gap-3 p-4" testID="barcode-match">
        <Text variant="subheading">{t('listings.identify.isThisIt')}</Text>
        <View className="overflow-hidden rounded-card bg-surface-raised">
          <GameRow game={match.game} first />
        </View>
        <Button
          label={t('listings.identify.yesThatsIt')}
          onPress={() => onPick(draftGameFrom(match.game), match.platform)}
          testID="match-yes"
        />
        <Button
          variant="ghost"
          label={t('listings.identify.noSearch')}
          onPress={onSearch}
          testID="match-no"
        />
      </Card>
    );
  }
  if (result.suggestions.length > 0) {
    return (
      <View className="gap-3" testID="barcode-suggestions">
        <Text variant="subheading">{t('listings.identify.whichOne')}</Text>
        <View className="overflow-hidden rounded-card bg-surface">
          {result.suggestions.map((game, index) => (
            <GameRow
              key={game.objectID}
              game={game}
              first={index === 0}
              onSelect={(record) => onPick(draftGameFrom(record), null)}
            />
          ))}
        </View>
        <Button variant="ghost" label={t('listings.identify.noneOfThese')} onPress={onSearch} />
      </View>
    );
  }
  return (
    <Card className="gap-3 p-4" testID="barcode-not-found">
      <Text>{t('listings.identify.unknownBarcode')}</Text>
      <Button
        label={t('listings.identify.searchInstead')}
        onPress={onSearch}
        testID="unknown-search"
      />
      <Button variant="ghost" label={t('listings.identify.scanAgain')} onPress={onScanAgain} />
    </Card>
  );
}

function PlatformStep({
  game,
  preset,
  onContinue,
  onBack,
}: {
  game: DraftGame;
  preset: PlatformKey | null;
  onContinue: (platform: PlatformKey) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  // One platform: nothing to choose. Otherwise the user picks the exact one (PRD W2).
  const [platform, setPlatform] = useState<PlatformKey | null>(
    preset ?? (game.platforms.length === 1 ? (game.platforms[0] ?? null) : null),
  );
  return (
    <Card className="gap-4 p-4" testID="platform-step">
      <Text variant="subheading" numberOfLines={2}>
        {game.title}
      </Text>
      <View className="gap-2">
        <Text tone="secondary">{t('listings.identify.whichPlatform')}</Text>
        <View className="flex-row flex-wrap gap-2">
          {game.platforms.map((key) => (
            <Chip
              key={key}
              label={PLATFORMS[key].label}
              selected={platform === key}
              onPress={() => setPlatform(key)}
              testID={`pick-platform-${key}`}
            />
          ))}
        </View>
      </View>
      <Button
        size="lg"
        fullWidth
        label={t('listings.identify.continue')}
        disabled={platform === null}
        onPress={() => platform && onContinue(platform)}
        testID="identify-continue"
      />
      <Button variant="ghost" label={t('listings.identify.otherGame')} onPress={onBack} />
    </Card>
  );
}
