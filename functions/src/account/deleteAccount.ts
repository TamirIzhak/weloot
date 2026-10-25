import type { Auth } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

// Delete account (PRD W9, §12; required by both app stores). Personal data is deleted; the public profile becomes a
// tombstone ("deleted_user", `deletedAt`) so other users' conversations and ratings stay readable. Every step is
// safe to repeat, so a retry after a partial failure finishes the job.

/** The public username a deleted account shows as (passes the username format, never claimable). */
export const DELETED_USERNAME = 'deleted_user';

export type AccountStore = {
  /** The account's username claim (lower-case), or null when profile setup was never finished. */
  usernameOf(uid: string): Promise<string | null>;
  /** Frees the username, only if this account still owns it. */
  releaseUsername(usernameLower: string, uid: string): Promise<void>;
  /** Private settings (names, email, consent, tokens) and saved addresses. */
  deletePrivateData(uid: string): Promise<void>;
  /** Anonymizes the public profile and marks it deleted; nothing to do when there's no profile. */
  tombstoneProfile(uid: string): Promise<void>;
};

export type DeleteAccountDeps = {
  store: AccountStore;
  auth: Pick<Auth, 'deleteUser'>;
  /**
   * Feature cleanups that run first, e.g. closing the user's listings (#16), cancelling open offers and deals
   * (#23), deleting listing photos (#15). Each must be idempotent.
   */
  cleanups?: readonly ((uid: string) => Promise<void>)[];
};

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

export async function handleDeleteAccount(
  auth: CallableRequest['auth'],
  deps: DeleteAccountDeps,
): Promise<{ deleted: true }> {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first', { reason: 'signInRequired' });
  const { uid } = auth;

  for (const cleanup of deps.cleanups ?? []) await cleanup(uid);

  const usernameLower = await deps.store.usernameOf(uid);
  if (usernameLower) await deps.store.releaseUsername(usernameLower, uid);
  await deps.store.deletePrivateData(uid);
  await deps.store.tombstoneProfile(uid);

  try {
    // Last: deleting the Auth user also revokes every session, which signs the app out.
    await deps.auth.deleteUser(uid);
  } catch (error) {
    if (!hasCode(error, 'auth/user-not-found')) throw error;
  }
  logger.info('deleteAccount: account deleted', { uid });
  return { deleted: true };
}

/** The Firestore side of account deletion, with the Admin SDK. */
export function firestoreAccountStore(db: Firestore): AccountStore {
  const userDoc = (uid: string) => db.collection('users').doc(uid);
  return {
    async usernameOf(uid) {
      const snapshot = await userDoc(uid).get();
      const lower: unknown = snapshot.get('usernameLower');
      return typeof lower === 'string' && lower !== '' ? lower : null;
    },
    async releaseUsername(usernameLower, uid) {
      const claim = db.collection('usernames').doc(usernameLower);
      await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(claim);
        if (snapshot.exists && snapshot.get('uid') === uid) tx.delete(claim);
      });
    },
    async deletePrivateData(uid) {
      await db.recursiveDelete(userDoc(uid).collection('locations'));
      await db.recursiveDelete(db.collection('wantlist').doc(uid));
      await userDoc(uid).collection('private').doc('settings').delete();
    },
    async tombstoneProfile(uid) {
      const ref = userDoc(uid);
      const snapshot = await ref.get();
      if (!snapshot.exists) return;
      await ref.update({
        username: DELETED_USERNAME,
        usernameLower: '',
        updatedAt: FieldValue.serverTimestamp(),
        deletedAt: snapshot.get('deletedAt') ?? FieldValue.serverTimestamp(),
      });
    },
  };
}
