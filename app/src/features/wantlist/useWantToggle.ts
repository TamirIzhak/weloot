import { getAuth } from '@react-native-firebase/auth';
import { useTranslation } from 'react-i18next';

import { MAX_WANTLIST_ITEMS, wantKey, type PlatformKey } from '@weloot/shared';

import { useToast } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRequireAuth } from '@/features/auth/authGate';

import { addWant, removeWant, useWantlist, type NewWant } from './wantlistApi';

/**
 * Want list hearts for a screen (search results, game page): one listener for the whole screen. Guests get the
 * sign-in sheet ("wantlist": an account, no phone), then the game is added.
 */
export function useWantToggle() {
  const { t } = useTranslation();
  const toast = useToast();
  const auth = useAuth();
  const requireAuth = useRequireAuth();
  const uid = auth.status === 'signedIn' ? auth.user.uid : undefined;
  const wantlist = useWantlist(uid);
  const keys = new Set(wantlist.status === 'ready' ? wantlist.items.map((item) => item.id) : []);
  const count = wantlist.status === 'ready' ? wantlist.items.length : 0;

  const isWanted = (igdbGameId: number, platform?: PlatformKey) =>
    keys.has(wantKey(igdbGameId, platform));

  const toggle = (want: NewWant) => {
    requireAuth('wantlist', () => {
      // Runs right after sign-in too, when this render still has the guest state: ask Auth for the user.
      const signedIn = getAuth().currentUser?.uid;
      if (!signedIn) return;
      const key = wantKey(want.igdbGameId, want.platform);
      if (keys.has(key)) {
        removeWant(signedIn, key).catch(() => toast.show(t('wantlist.errors.saveFailed'), 'error'));
        return;
      }
      if (count >= MAX_WANTLIST_ITEMS) {
        toast.show(t('wantlist.errors.full', { max: MAX_WANTLIST_ITEMS }), 'error');
        return;
      }
      addWant(signedIn, want).then(
        () => toast.show(t('wantlist.added', { title: want.gameTitle }), 'success'),
        () => toast.show(t('wantlist.errors.saveFailed'), 'error'),
      );
    });
  };

  return { isWanted, toggle };
}
