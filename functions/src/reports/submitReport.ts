import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import { REPORTS_PER_DAY, reportInputSchema, type SubmitReportError } from '@weloot/shared';

// Reports (PRD W9): land in `reports` for manual review in the console. Written only here (rules deny clients),
// so the reporter is the signed-in user, the target exists and nobody can flood support.

function fail(
  code:
    | 'unauthenticated'
    | 'invalid-argument'
    | 'not-found'
    | 'failed-precondition'
    | 'resource-exhausted'
    | 'unimplemented',
  reason: SubmitReportError,
): never {
  throw new HttpsError(code, `Report failed: ${reason}`, { reason });
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

  // TODO(#37): users, messages and deals can be reported once those screens exist.
  if (targetType !== 'listing') fail('unimplemented', 'notSupported');
  const listing = await deps.db.collection('listings').doc(targetId).get();
  if (!listing.exists) fail('not-found', 'notFound');
  if (listing.get('userId') === uid) fail('failed-precondition', 'ownTarget');

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
