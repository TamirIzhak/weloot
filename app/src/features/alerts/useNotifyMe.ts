import { getAuth } from '@react-native-firebase/auth';
import { useTranslation } from 'react-i18next';

import { MAX_ALERTS, wantKey, type PlatformKey } from '@weloot/shared';

import { useToast } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRequireAuth } from '@/features/auth/authGate';

import { createAlert, deleteAlert, useAlerts, type NewAlert } from './alertsApi';

/** "Notify me when it's listed" on/off for a game (PRD W8). Guests sign in first ("alert": no phone needed). */
export function useNotifyMe() {
  const { t } = useTranslation();
  const toast = useToast();
  const auth = useAuth();
  const requireAuth = useRequireAuth();
  const alerts = useAlerts(auth.status === 'signedIn' ? auth.user.uid : undefined);
  const ids = new Set(alerts.status === 'ready' ? alerts.items.map((a) => a.id) : []);
  const count = alerts.status === 'ready' ? alerts.items.length : 0;

  const isOn = (igdbGameId: number, platform?: PlatformKey) =>
    ids.has(wantKey(igdbGameId, platform));

  const toggle = (alert: NewAlert) => {
    requireAuth('alert', () => {
      // Also runs right after sign-in, while this render still has the guest state.
      const uid = getAuth().currentUser?.uid;
      if (!uid) return;
      const id = wantKey(alert.igdbGameId, alert.platform);
      if (ids.has(id)) {
        deleteAlert(uid, id).catch(() => toast.show(t('alerts.errors.saveFailed'), 'error'));
        return;
      }
      if (count >= MAX_ALERTS) {
        toast.show(t('alerts.errors.full', { max: MAX_ALERTS }), 'error');
        return;
      }
      createAlert(uid, alert).then(
        () => toast.show(t('alerts.created', { title: alert.gameTitle }), 'success'),
        () => toast.show(t('alerts.errors.saveFailed'), 'error'),
      );
    });
  };

  return { isOn, toggle };
}
