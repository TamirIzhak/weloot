import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { PLATFORMS } from '@weloot/shared';

import { Button, Card, Chip, EmptyState, ErrorState, Text, useToast } from '@/components';
import { currentLanguage, formatNumber } from '@/i18n';
import { colors } from '@/theme/tokens';

import { deleteAlert, useAlerts } from './alertsApi';

/**
 * Profile → Alerts (PRD W8, #49): the "Notify me" alerts, each with its console and distance, removable. Want list
 * games alert too, which the screen says, so nobody is surprised by a push.
 */
export function AlertsScreen({ uid }: { uid: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const language = currentLanguage();
  const state = useAlerts(uid);

  if (state.status === 'loading') return <ActivityIndicator color={colors.primary} />;
  if (state.status === 'error') return <ErrorState title={t('alerts.loadFailed')} />;
  return (
    <View className="gap-4" testID="alerts">
      <Card className="gap-2 p-4">
        <Text tone="secondary">{t('alerts.wantlistNote')}</Text>
        <Text variant="caption" tone="muted">
          {t('alerts.limitsNote')}
        </Text>
        <Button
          variant="ghost"
          label={t('alerts.openWantlist')}
          onPress={() => router.push('/me/wantlist')}
        />
      </Card>
      {state.items.length === 0 ? (
        <EmptyState
          title={t('alerts.emptyTitle')}
          body={t('alerts.emptyBody')}
          primaryAction={{ label: t('wantlist.findGames'), onPress: () => router.push('/search') }}
          testID="alerts-empty"
        />
      ) : (
        state.items.map((alert) => (
          <Card
            key={alert.id}
            className="flex-row items-center gap-3 p-3"
            testID={`alert-${alert.id}`}
          >
            <View className="flex-1 gap-1.5">
              <Text className="font-medium" numberOfLines={2}>
                {alert.gameTitle}
              </Text>
              <View className="flex-row flex-wrap items-center gap-1.5">
                {alert.platform ? (
                  <Chip
                    platform={PLATFORMS[alert.platform].family}
                    label={PLATFORMS[alert.platform].label}
                  />
                ) : (
                  <Chip label={t('wantlist.anyConsole')} />
                )}
                <Text variant="caption" tone="muted">
                  {alert.lat === undefined
                    ? t('alerts.anywhere')
                    : t('alerts.within', { km: formatNumber(alert.radiusKm, language) })}
                </Text>
              </View>
            </View>
            <Button
              variant="ghost"
              label={t('alerts.remove')}
              onPress={() =>
                deleteAlert(uid, alert.id).catch(() =>
                  toast.show(t('alerts.errors.saveFailed'), 'error'),
                )
              }
              testID={`alert-remove-${alert.id}`}
            />
          </Card>
        ))
      )}
    </View>
  );
}
