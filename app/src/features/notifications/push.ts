import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import {
  AuthorizationStatus,
  deleteToken,
  getInitialNotification,
  getMessaging,
  getToken,
  hasPermission,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';

import { FIREBASE_REGION } from '@weloot/shared';

/** A push as the messaging SDK hands it over. */
export type RemoteMessage = Parameters<Parameters<typeof onMessage>[1]>[0];

// Push notifications on the device (PRD §10, #27): permission, this device's token (registered with a Cloud
// Function, since settings don't let clients write tokens), and where a tapped push leads.

const callable = (name: string) =>
  httpsCallable<{ token: string }, { ok: true }>(getFunctions(getApp(), FIREBASE_REGION), name);

const granted = (status: number) =>
  status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL;

/** Android 13+ asks separately for notifications. */
async function androidPermission(ask: boolean): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return true;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) return true;
  if (!ask) return false;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Registers this device for pushes. With `ask`, the system permission prompt may appear: it's asked at moments
 * where a push obviously helps (after making an offer, asking a question, or turning on an alert), not at launch.
 * Never throws: pushes are a convenience.
 */
export async function registerForPush(ask: boolean): Promise<boolean> {
  try {
    const messaging = getMessaging();
    const status = await hasPermission(messaging);
    let ok = granted(status);
    if (!ok && ask) ok = granted(await requestPermission(messaging));
    if (!ok || !(await androidPermission(ask))) return false;
    await callable('registerPushToken')({ token: await getToken(messaging) });
    return true;
  } catch {
    return false;
  }
}

/** Before signing out: this device stops getting the account's pushes. */
export async function unregisterPush(): Promise<void> {
  try {
    const messaging = getMessaging();
    const token = await getToken(messaging);
    await callable('unregisterPushToken')({ token });
    await deleteToken(messaging);
  } catch {
    // Signing out never waits on this.
  }
}

/** Keeps the registration current when the push service rotates this device's token. */
export function watchTokenRefresh(): () => void {
  return onTokenRefresh(getMessaging(), (token) => {
    callable('registerPushToken')({ token }).catch(() => undefined);
  });
}

/** Where a push leads (the data the functions send). */
export type PushTarget =
  | { pathname: '/conversations/[id]'; params: { id: string } }
  | { pathname: '/listings/[id]'; params: { id: string } };

export function targetOf(data: Record<string, unknown> | undefined): PushTarget | null {
  if (data?.type === 'conversation' && typeof data.conversationId === 'string') {
    return { pathname: '/conversations/[id]', params: { id: data.conversationId } };
  }
  if (data?.type === 'listing' && typeof data.listingId === 'string') {
    return { pathname: '/listings/[id]', params: { id: data.listingId } };
  }
  return null;
}

/**
 * Taps on pushes (app closed or in the background) open the right screen; pushes that arrive while the app is open
 * are handed to `onForeground` (shown as a toast), since the system doesn't display them then.
 */
export function watchPushes(
  open: (target: PushTarget, data: Record<string, unknown> | undefined) => void,
  onForeground: (message: RemoteMessage) => void,
): () => void {
  const messaging = getMessaging();
  const go = (message: RemoteMessage | null) => {
    const target = targetOf(message?.data);
    if (target) open(target, message?.data);
  };
  getInitialNotification(messaging).then(go, () => undefined);
  const offOpened = onNotificationOpenedApp(messaging, go);
  const offMessage = onMessage(messaging, async (message) => onForeground(message));
  return () => {
    offOpened();
    offMessage();
  };
}
