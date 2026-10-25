import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, EmptyState, Text, useToast } from '@/components';
import { useUserSettings } from '@/features/profile/settingsApi';
import { usePublicProfile } from '@/features/profile/usePublicProfile';
import { colors } from '@/theme/tokens';

import { setBlocked } from './blockApi';

/** Settings → Blocked users (PRD W9, #37): everyone the user blocked, each with Unblock. */
export function BlockedUsersScreen({ uid }: { uid: string }) {
  const { t } = useTranslation();
  const settings = useUserSettings(uid);
  if (settings.status === 'loading') return <ActivityIndicator color={colors.primary} />;
  const blocked = settings.status === 'ready' ? settings.settings.blockedUserIds : [];
  if (blocked.length === 0) {
    return (
      <EmptyState
        title={t('safety.blocked.emptyTitle')}
        body={t('safety.blocked.emptyBody')}
        testID="blocked-empty"
      />
    );
  }
  return (
    <View className="gap-3" testID="blocked-users">
      <Text variant="caption" tone="muted">
        {t('safety.blocked.hint')}
      </Text>
      {blocked.map((id) => (
        <BlockedRow key={id} userId={id} />
      ))}
    </View>
  );
}

function BlockedRow({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const profile = usePublicProfile(userId);
  const name = profile.status === 'ready' ? profile.profile.username : t('chat.someone');
  return (
    <Card className="flex-row items-center gap-3 p-3" testID={`blocked-${userId}`}>
      <Text className="flex-1 font-medium">{name}</Text>
      <Button
        variant="secondary"
        label={t('safety.block.unblock')}
        onPress={() =>
          setBlocked(userId, false).then(
            () => toast.show(t('safety.block.unblocked', { name }), 'success'),
            () => toast.show(t('offers.errors.failed'), 'error'),
          )
        }
        testID={`unblock-${userId}`}
      />
    </Card>
  );
}
