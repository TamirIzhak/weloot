import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { FIREBASE_REGION, type ReportInput, type SubmitReportError } from '@weloot/shared';

export class ReportError extends Error {
  readonly reason: SubmitReportError | 'unknown';
  constructor(reason: SubmitReportError | 'unknown') {
    super(reason);
    this.reason = reason;
  }
}

/** Sends a report for review (PRD W9) through the `submitReport` function. */
export async function submitReport(input: ReportInput): Promise<void> {
  const call = httpsCallable<ReportInput, { reportId: string }>(
    getFunctions(getApp(), FIREBASE_REGION),
    'submitReport',
  );
  try {
    await call(input);
  } catch (error) {
    const reason = (error as { details?: { reason?: unknown } } | null)?.details?.reason;
    throw new ReportError(typeof reason === 'string' ? (reason as SubmitReportError) : 'unknown');
  }
  try {
    logEvent(getAnalytics(), 'report_submitted', { target_type: input.targetType });
  } catch {
    // Analytics never blocks a report.
  }
}
