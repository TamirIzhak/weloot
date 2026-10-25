import {
  getAnalytics,
  logEvent,
  setUserId as setAnalyticsUserId,
} from '@react-native-firebase/analytics';
import {
  getCrashlytics,
  recordError,
  setCrashlyticsCollectionEnabled,
  setUserId,
} from '@react-native-firebase/crashlytics';

// Crash reporting and the user ID on analytics (PRD §11, #39). IDs only: never phone numbers, names or emails.
// Development builds don't send crashes (they'd drown real ones).

/** Called once at startup. */
export function initMonitoring(): void {
  try {
    void setCrashlyticsCollectionEnabled(getCrashlytics(), !__DEV__);
  } catch {
    // No native module (web, tests): nothing to do.
  }
}

/** Ties crash reports and analytics to the signed-in user's ID (or clears it on sign-out). */
export function setMonitoringUser(uid: string | null): void {
  try {
    void setUserId(getCrashlytics(), uid ?? '');
    void setAnalyticsUserId(getAnalytics(), uid);
  } catch {
    // Monitoring never breaks the app.
  }
}

/** Reports a caught error (e.g. from the root error boundary) without crashing. */
export function reportError(error: unknown, context?: string): void {
  try {
    const value = error instanceof Error ? error : new Error(String(error));
    recordError(getCrashlytics(), value, context);
  } catch {
    // Monitoring never breaks the app.
  }
}

/** A tapped alert push (PRD W8: `alert_opened`, also logged when opened from New for you). */
export function trackAlertOpened(listingId: string): void {
  try {
    logEvent(getAnalytics(), 'alert_opened', { listing_id: listingId, from: 'push' });
  } catch {
    // Analytics never blocks the flow.
  }
}
