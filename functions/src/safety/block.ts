import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import { MAX_BLOCKED_USERS, setBlockedInputSchema } from '@weloot/shared';

import { recomputePair } from '../matching/matches';

// Blocking (PRD W9, #37): blocked users can't see each other's listings or message each other. The blocker's list
// is `blockedUserIds`; the blocked user's settings get the blocker in `blockedByUserIds`, so their own feeds and
// search hide the blocker's listings too. Matches between the two are recomputed (and so removed).

function fail(
  code: 'unauthenticated' | 'invalid-argument' | 'not-found' | 'failed-precondition',
  reason: string,
): never {
  throw new HttpsError(code, `Block failed: ${reason}`, { reason });
}

export async function handleSetBlocked(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: { db: Firestore; recompute?: (a: string, b: string) => Promise<void> },
): Promise<{ blocked: boolean }> {
  if (!auth) fail('unauthenticated', 'signInRequired');
  const parsed = setBlockedInputSchema.safeParse(data);
  if (!parsed.success) fail('invalid-argument', 'invalidInput');
  const { userId, blocked } = parsed.data;
  const uid = auth.uid;
  if (userId === uid) fail('failed-precondition', 'ownTarget');
  const { db } = deps;

  const settingsOf = (id: string) =>
    db.collection('users').doc(id).collection('private').doc('settings');
  await db.runTransaction(async (tx) => {
    const [mine, theirs, theirProfile] = await Promise.all([
      tx.get(settingsOf(uid)),
      tx.get(settingsOf(userId)),
      tx.get(db.collection('users').doc(userId)),
    ]);
    if (!mine.exists) fail('failed-precondition', 'profileRequired');
    if (blocked && !theirProfile.exists) fail('not-found', 'notFound');
    const list = (mine.get('blockedUserIds') as string[] | undefined) ?? [];
    if (blocked && !list.includes(userId) && list.length >= MAX_BLOCKED_USERS) {
      fail('failed-precondition', 'tooMany');
    }
    tx.update(settingsOf(uid), {
      blockedUserIds: blocked ? FieldValue.arrayUnion(userId) : FieldValue.arrayRemove(userId),
    });
    if (theirs.exists) {
      tx.update(settingsOf(userId), {
        blockedByUserIds: blocked ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid),
      });
    }
  });
  await (deps.recompute ?? ((a, b) => recomputePair(db, a, b)))(uid, userId);
  return { blocked };
}
