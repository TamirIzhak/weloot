import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { MAX_WANTLIST_ITEMS, PLATFORMS } from '@weloot/shared';

import { Card, Chip, EmptyState, ErrorState, Text, useToast } from '@/components';
import { formatNumber, currentLanguage } from '@/i18n';
import { colors } from '@/theme/tokens';

import { WantHeart } from './WantHeart';
import { removeWant, useWantlist } from './wantlistApi';

/**
 * Profile → Want list (PRD W3, #20): the games the user is looking for, newest first. Matches (#21) and alerts
 * (#49) work from this list. Games are added from search results and game pages.
 */
export function WantlistScreen({ uid }: { uid: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const state = useWantlist(uid);

  if (state.status === 'loading') return <ActivityIndicator color={colors.primary} />;
  if (state.status === 'error') return <ErrorState title={t('wantlist.loadFailed')} />;
  if (state.items.length === 0) {
    return (
      <EmptyState
        title={t('wantlist.emptyTitle')}
        body={t('wantlist.emptyBody')}
        primaryAction={{ label: t('wantlist.findGames'), onPress: () => router.push('/search') }}
        testID="wantlist-empty"
      />
    );
  }
  return (
    <View className="gap-3" testID="wantlist">
      <Text variant="caption" tone="muted">
        {t('wantlist.count', {
          count: formatNumber(state.items.length, currentLanguage()),
          max: formatNumber(MAX_WANTLIST_ITEMS, currentLanguage()),
        })}
      </Text>
      {state.items.map((item) => (
        <Card
          key={item.id}
          className="flex-row items-center gap-3 p-3"
          testID={`want-item-${item.id}`}
        >
          <View className="flex-1 gap-1.5">
            <Text className="font-medium" numberOfLines={2}>
              {item.gameTitle}
            </Text>
            {item.platform ? (
              <Chip
                platform={PLATFORMS[item.platform].family}
                label={PLATFORMS[item.platform].label}
              />
            ) : (
              <Chip label={t('wantlist.anyConsole')} />
            )}
          </View>
          <WantHeart
            wanted
            title={item.gameTitle}
            onPress={() =>
              removeWant(uid, item.id).catch(() =>
                toast.show(t('wantlist.errors.saveFailed'), 'error'),
              )
            }
            testID={`want-remove-${item.id}`}
          />
        </Card>
      ))}
    </View>
  );
}
