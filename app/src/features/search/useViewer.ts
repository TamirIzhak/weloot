import { DEFAULT_SEARCH_RADIUS_KM } from '@weloot/shared';

import { useAuth } from '@/features/auth/AuthProvider';
import { useUserSettings } from '@/features/profile/settingsApi';

/**
 * Who is looking at listings, for feeds and search: their own and blocked users' listings are excluded (PRD W3/W4),
 * and their search radius applies. While a signed-in user's settings load, `pending` is true so a blocked user's
 * listings never flash up; on a settings error the feed goes ahead without them.
 */
export function useViewer() {
  const auth = useAuth();
  const uid = auth.status === 'signedIn' ? auth.user.uid : undefined;
  const settings = useUserSettings(uid);
  const ready = settings.status === 'ready' ? settings.settings : null;
  return {
    uid,
    excludedUserIds: [...(uid ? [uid] : []), ...(ready?.blockedUserIds ?? [])],
    radiusKm: ready?.searchRadiusKm ?? DEFAULT_SEARCH_RADIUS_KM,
    pending: uid !== undefined && settings.status === 'loading',
  };
}
