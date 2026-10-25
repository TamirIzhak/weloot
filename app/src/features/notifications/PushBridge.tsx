import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useToast } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';

import { registerForPush, watchPushes, watchTokenRefresh } from './push';

/**
 * Connects pushes to the app (PRD §10, #27): a signed-in user's device is registered (without prompting; the
 * prompt comes with the first offer, question or alert), taps on pushes open their screen, and pushes arriving
 * while the app is open show as a toast.
 */
export function PushBridge() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const uid =
    auth.status === 'signedIn' && auth.profile.status === 'ready' ? auth.user.uid : undefined;

  useEffect(() => {
    if (!uid) return;
    void registerForPush(false);
    return watchTokenRefresh();
  }, [uid]);

  useEffect(
    () =>
      watchPushes(
        (target) => router.push(target),
        (message) => {
          const title = message.notification?.title;
          const body = message.notification?.body;
          if (title || body) toast.show([title, body].filter(Boolean).join(': '), 'info');
        },
      ),
    [router, toast],
  );

  return null;
}
