import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { UserProfile } from '@weloot/shared';

import { Button, Card, Text } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRequireAuth } from '@/features/auth/authGate';
import { SettingsRow, SettingsSection } from '@/features/profile/SettingsRow';
import { currentLanguage, formatNumber } from '@/i18n';
import { useHideOnScroll, useTabBarInset } from '@/navigation/TabBarVisibility';
import { PlaceholderScreen } from '@/navigation/PlaceholderScreen';
import { colors } from '@/theme/tokens';

/**
 * Profile tab (PRD §9-B5). Signed-in users see their trust signals and their games (listings, want list, alerts) and
 * reach Settings. Guests get a "Join WeLoot" card; users who left profile setup unfinished get a card to finish it.
 * Both can still open Settings (language, support, legal).
 */
export default function ProfileTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const requireAuth = useRequireAuth();
  const settingsButton = (
    <Button
      variant="ghost"
      label={t('settings.title')}
      onPress={() => router.push('/settings')}
      testID="open-settings"
    />
  );

  if (auth.status !== 'signedIn') {
    return (
      <PlaceholderScreen
        testID="profile-guest"
        title={t('profile.join.title')}
        body={t('profile.join.body')}
      >
        <Button
          label={t('profile.join.cta')}
          onPress={() => requireAuth('profile', () => undefined)}
          testID="join-weloot"
        />
        {settingsButton}
      </PlaceholderScreen>
    );
  }

  if (auth.profile.status === 'missing' || auth.profile.status === 'error') {
    return (
      <PlaceholderScreen
        testID="profile-unfinished"
        title={t('profile.finish.title')}
        body={t('profile.finish.body')}
      >
        <Button
          label={t('profile.finish.cta')}
          onPress={() => requireAuth('profile', () => undefined)}
          testID="finish-profile"
        />
        {settingsButton}
      </PlaceholderScreen>
    );
  }

  if (auth.profile.status === 'loading') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg" testID="profile-loading">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return <ProfileScreen profile={auth.profile.profile} />;
}

function ProfileScreen({ profile }: { profile: UserProfile }) {
  const { t } = useTranslation();
  const router = useRouter();
  const onScroll = useHideOnScroll();
  const bottomInset = useTabBarInset();

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']} testID="profile-screen">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerClassName="gap-6 px-4 pt-2"
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <ProfileHeader profile={profile} />
        <SettingsSection title={t('profile.games.title')}>
          <SettingsRow
            first
            icon="albums-outline"
            label={t('profile.games.listings')}
            onPress={() =>
              router.push({ pathname: '/me/[section]', params: { section: 'listings' } })
            }
            testID="my-listings"
          />
          <SettingsRow
            icon="heart-outline"
            label={t('profile.games.wantlist')}
            onPress={() =>
              router.push({ pathname: '/me/[section]', params: { section: 'wantlist' } })
            }
            testID="my-wantlist"
          />
          <SettingsRow
            icon="notifications-outline"
            label={t('profile.games.alerts')}
            onPress={() =>
              router.push({ pathname: '/me/[section]', params: { section: 'alerts' } })
            }
            testID="my-alerts"
          />
        </SettingsSection>
        <SettingsSection>
          <SettingsRow
            first
            icon="settings-outline"
            label={t('settings.title')}
            onPress={() => router.push('/settings')}
            testID="open-settings"
          />
        </SettingsSection>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

/** Username and trust signals (PRD W9): rating, completed swaps and account age. Real numbers only (PRD §1.2). */
function ProfileHeader({ profile }: { profile: UserProfile }) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const memberSince = new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(profile.createdAt.toMillis()));

  return (
    <Card className="items-center gap-3 p-5" testID="profile-header">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-primary">
        <Text variant="title" className="text-[28px] leading-[34px]">
          {profile.username.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View className="items-center gap-1">
        <Text variant="heading">{profile.username}</Text>
        <Text variant="caption" tone="muted">
          {t('profile.memberSince', { date: memberSince })}
        </Text>
      </View>
      <View className="flex-row gap-6">
        <View className="items-center">
          <Text variant="subheading" testID="profile-rating">
            {profile.ratingCount > 0 ? `★ ${formatNumber(profile.ratingAvg, language)}` : '—'}
          </Text>
          <Text variant="caption" tone="muted">
            {profile.ratingCount > 0
              ? t('profile.rating', { n: formatNumber(profile.ratingCount, language) })
              : t('profile.noRatings')}
          </Text>
        </View>
        <View className="items-center">
          <Text variant="subheading" testID="profile-trades">
            {formatNumber(profile.completedTrades, language)}
          </Text>
          <Text variant="caption" tone="muted">
            {t('profile.trades')}
          </Text>
        </View>
      </View>
    </Card>
  );
}
