import { getApp } from '@react-native-firebase/app';
import { getAuth, signOut } from '@react-native-firebase/auth';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { FIREBASE_REGION } from '@weloot/shared';

/**
 * Deletes the account (PRD W9, §12) through the `deleteAccount` function, then signs out on this device (the server
 * already revoked every session by deleting the Auth user).
 */
export async function deleteMyAccount(): Promise<void> {
  const call = httpsCallable<void, { deleted: true }>(
    getFunctions(getApp(), FIREBASE_REGION),
    'deleteAccount',
  );
  await call();
  await signOut(getAuth()).catch(() => undefined);
}
