import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import {
  addToAverage,
  dealCountsForTrust,
  rateUserInputSchema,
  ratingIdFor,
  type ConversationError,
  type DealStatus,
} from '@weloot/shared';

// Ratings (PRD W9, #36): only for completed deals, once per deal and rater. The rated user's public average and
// count change in the same transaction, so the trust signals on profiles and owner cards are always real.

function fail(
  code:
    | 'invalid-argument'
    | 'not-found'
    | 'permission-denied'
    | 'failed-precondition'
    | 'unauthenticated',
  reason: ConversationError | 'signInRequired',
): never {
  throw new HttpsError(code, `Rating failed: ${reason}`, { reason });
}

export async function handleRateUser(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: { db: Firestore; now?: () => Date },
): Promise<{ ratingId: string }> {
  if (!auth) fail('unauthenticated', 'signInRequired');
  const parsed = rateUserInputSchema.safeParse(data);
  if (!parsed.success) fail('invalid-argument', 'invalidInput');
  const { conversationId, stars, comment } = parsed.data;
  const { db } = deps;
  const uid = auth.uid;
  const ratingId = ratingIdFor(conversationId, uid);

  await db.runTransaction(async (tx) => {
    const conversation = await tx.get(db.collection('conversations').doc(conversationId));
    if (!conversation.exists) fail('not-found', 'notFound');
    const participants = (conversation.get('participants') as string[] | undefined) ?? [];
    if (!participants.includes(uid)) fail('permission-denied', 'notParticipant');
    const status = conversation.get('deal.status') as DealStatus | undefined;
    if (!status || !dealCountsForTrust(status)) fail('failed-precondition', 'notCompleted');
    const ratee = participants.find((p) => p !== uid) as string;

    const ratingRef = db.collection('ratings').doc(ratingId);
    const rateeRef = db.collection('users').doc(ratee);
    const [existing, rateeProfile] = await Promise.all([tx.get(ratingRef), tx.get(rateeRef)]);
    if (existing.exists) fail('failed-precondition', 'alreadyRated');

    const now = Timestamp.fromDate(deps.now?.() ?? new Date());
    tx.set(ratingRef, {
      raterId: uid,
      rateeId: ratee,
      stars,
      ...(comment ? { comment } : {}),
      createdAt: now,
    });
    const average = (rateeProfile.get('ratingAvg') as number | undefined) ?? 0;
    const count = (rateeProfile.get('ratingCount') as number | undefined) ?? 0;
    tx.set(
      rateeRef,
      { ratingAvg: addToAverage(average, count, stars), ratingCount: count + 1, updatedAt: now },
      { merge: true },
    );
  });
  return { ratingId };
}
