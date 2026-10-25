import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import {
  parseMessageTargetId,
  REPORTS_PER_DAY,
  reportInputSchema,
  type ReportTarget,
  type SubmitReportError,
} from '@weloot/shared';

// Reports (PRD W9): land in `reports` for manual review in the console. Written only here (rules deny clients),
// so the reporter is the signed-in user, the target exists and nobody can flood support.

function fail(
  code:
    | 'unauthenticated'
    | 'invalid-argument'
    | 'not-found'
    | 'failed-precondition'
    | 'resource-exhausted',
  reason: SubmitReportError,
): never {
  throw new HttpsError(code, `Report failed: ${reason}`, { reason });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The target must exist, not be the reporter's own, and (for messages and deals) be in a conversation the reporter
 * takes part in: nobody can report what they've never seen.
 */
async function checkTarget(db: Firestore, uid: string, type: ReportTarget, targetId: string) {
  if (type === 'listing') {
    const listing = await db.collection('listings').doc(targetId).get();
    if (!listing.exists) fail('not-found', 'notFound');
    if (listing.get('userId') === uid) fail('failed-precondition', 'ownTarget');
    return;
  }
  if (type === 'user') {
    if (targetId === uid) fail('failed-precondition', 'ownTarget');
    if (!(await db.collection('users').doc(targetId).get()).exists) fail('not-found', 'notFound');
    return;
  }
  const { conversationId, messageId } =
    type === 'message'
      ? parseMessageTargetId(targetId)
      : { conversationId: targetId, messageId: null };
  if (!conversationId) fail('invalid-argument', 'invalidInput');
  const conversation = await db.collection('conversations').doc(conversationId).get();
  if (!conversation.exists) fail('not-found', 'notFound');
  const participants = (conversation.get('participants') as string[] | undefined) ?? [];
  if (!participants.includes(uid)) fail('not-found', 'notFound');
  if (type === 'deal') {
    if (!conversation.get('deal')) fail('not-found', 'notFound');
    return;
  }
  if (!messageId) fail('invalid-argument', 'invalidInput');
  const message = await conversation.ref.collection('messages').doc(messageId).get();
  if (!message.exists) fail('not-found', 'notFound');
  const sender = message.get('senderId') as string;
  if (sender === uid || sender === 'system') fail('failed-precondition', 'ownTarget');
}

/**
 * Files a report. Reporting needs an account but not a verified phone (it isn't trading, PRD W1). One report per
 * reporter and target: reporting the same thing again updates it instead of adding another.
 */
export async function handleSubmitReport(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: { db: Firestore; now?: () => Date },
): Promise<{ reportId: string }> {
  if (!auth) fail('unauthenticated', 'signInRequired');
  const uid = auth.uid;
  const input = reportInputSchema.safeParse(data);
  if (!input.success) fail('invalid-argument', 'invalidInput');
  const { targetType, targetId, reason, details } = input.data;

  await checkTarget(deps.db, uid, targetType, targetId);

  const now = deps.now?.() ?? new Date();
  const reports = deps.db.collection('reports');
  const reportId = `${uid}_${targetType}_${targetId}`;
  const ref = reports.doc(reportId);
  await deps.db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists) {
      const recent = await tx.get(
        reports
          .where('reporterId', '==', uid)
          .where('createdAt', '>', Timestamp.fromMillis(now.getTime() - DAY_MS))
          .count(),
      );
      if (recent.data().count >= REPORTS_PER_DAY) fail('resource-exhausted', 'rateLimited');
    }
    tx.set(
      ref,
      {
        reporterId: uid,
        targetType,
        targetId,
        reason,
        ...(details ? { details } : {}),
        ...(existing.exists ? {} : { createdAt: Timestamp.fromDate(now) }),
      },
      { merge: true },
    );
  });
  return { reportId };
}
