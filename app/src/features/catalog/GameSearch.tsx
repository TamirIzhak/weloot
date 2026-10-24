import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { PLATFORM_KEYS, PLATFORMS, type GameRecord, type PlatformKey } from '@weloot/shared';

import { Chip, cn, EmptyState, ErrorState, Input, Text } from '@/components';
import { useGameSearch } from '@/features/search/useGameSearch';
import { colors } from '@/theme/tokens';

import { coverUrl } from './igdbImages';

/**
 * Find a game in the catalog (PRD §5.1/§5.2): search box, optional platform filter, and results with cover,
 * year and platforms. Used by the Add flow's Identify step (#14) and the Search tab.
 */
export function GameSearch({
  onSelect,
  platform: fixedPlatform,
  autoFocus,
  testID = 'game-search',
}: {
  onSelect?: (game: GameRecord) => void;
  /** Restrict to one platform (no filter chips then). */
  platform?: PlatformKey;
  autoFocus?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [chosenPlatform, setChosenPlatform] = useState<PlatformKey | undefined>();
  const platform = fixedPlatform ?? chosenPlatform;
  const search = useGameSearch(query, platform);

  return (
    <View className="gap-3" testID={testID}>
      <Input
        label={t('catalog.search.label')}
        placeholder={t('catalog.search.placeholder')}
        value={query}
        onChangeText={setQuery}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        testID={`${testID}-input`}
      />
      {fixedPlatform ? null : (
        <View className="flex-row flex-wrap gap-2">
          {PLATFORM_KEYS.map((key) => (
            <Chip
              key={key}
              label={PLATFORMS[key].label}
              selected={chosenPlatform === key}
              onPress={() => setChosenPlatform((current) => (current === key ? undefined : key))}
              testID={`${testID}-platform-${key}`}
            />
          ))}
        </View>
      )}
      <Results state={search} onSelect={onSelect} testID={testID} />
    </View>
  );
}

function Results({
  state,
  onSelect,
  testID,
}: {
  state: ReturnType<typeof useGameSearch>;
  onSelect?: (game: GameRecord) => void;
  testID: string;
}) {
  const { t } = useTranslation();
  switch (state.status) {
    case 'notConfigured':
      return (
        <Text tone="muted" testID={`${testID}-not-configured`}>
          {t('catalog.search.notConfigured')}
        </Text>
      );
    case 'idle':
      return (
        <Text tone="muted" variant="caption">
          {t('catalog.search.hint')}
        </Text>
      );
    case 'loading':
      return <ActivityIndicator color={colors.primary} testID={`${testID}-loading`} />;
    case 'error':
      return <ErrorState title={t('catalog.search.error')} testID={`${testID}-error`} />;
    case 'ready':
      if (state.hits.length === 0) {
        return (
          <EmptyState
            title={t('catalog.search.emptyTitle')}
            body={t('catalog.search.emptyBody')}
            testID={`${testID}-empty`}
          />
        );
      }
      return (
        <View
          accessibilityRole="list"
          className="overflow-hidden rounded-card bg-surface"
          testID={`${testID}-results`}
        >
          {state.hits.map((game, index) => (
            <GameRow key={game.objectID} game={game} first={index === 0} onSelect={onSelect} />
          ))}
        </View>
      );
  }
}

export function GameRow({
  game,
  first,
  onSelect,
}: {
  game: GameRecord;
  first: boolean;
  onSelect?: (game: GameRecord) => void;
}) {
  const content = (
    <>
      <View className="h-16 w-12 overflow-hidden rounded-button bg-surface-raised">
        {game.coverImageId ? (
          <Image
            source={coverUrl(game.coverImageId, 'cover_small')}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="game-controller-outline" size={20} color={colors['text-muted']} />
          </View>
        )}
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-medium" numberOfLines={2}>
          {game.title}
        </Text>
        <View className="flex-row flex-wrap items-center gap-1.5">
          {game.releaseYear ? (
            <Text variant="caption" tone="muted">
              {game.releaseYear}
            </Text>
          ) : null}
          {game.platforms.map((key) => (
            <Chip key={key} platform={PLATFORMS[key].family} label={PLATFORMS[key].label} />
          ))}
        </View>
      </View>
    </>
  );
  const className = cn(
    'flex-row items-center gap-3 px-3 py-2.5',
    !first && 'border-t border-border',
  );
  if (!onSelect) {
    return (
      <View className={className} testID={`game-${game.objectID}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={game.title}
      onPress={() => onSelect(game)}
      className={cn(className, 'active:bg-surface-raised')}
      testID={`game-${game.objectID}`}
    >
      {content}
    </Pressable>
  );
}
