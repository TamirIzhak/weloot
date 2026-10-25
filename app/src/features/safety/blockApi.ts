import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { FIREBASE_REGION, type SetBlockedInput } from '@weloot/shared';

/** Block or unblock someone (PRD W9, #37) through the `setBlocked` function. */
export async function setBlocked(userId: string, blocked: boolean): Promise<void> {
  await httpsCallable<SetBlockedInput, { blocked: boolean }>(
    getFunctions(getApp(), FIREBASE_REGION),
    'setBlocked',
  )({ userId, blocked });
}
