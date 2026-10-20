import type { ErrorBoundaryProps } from 'expo-router';
import { View } from 'react-native';

import { ErrorState } from './ErrorState';

/**
 * Root crash screen, exported as `ErrorBoundary` from the root layout (Expo Router convention).
 * Shows a calm message and a retry instead of a blank screen. The error is still reported in dev and,
 * from #39, to Crashlytics. Text is English until i18n lands in #5.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) console.error('[ErrorBoundary]', error);
  return (
    <View className="flex-1 justify-center bg-bg">
      <ErrorState
        testID="app-error-boundary"
        title="Something went wrong"
        message="Try again. If it keeps happening, contact support from Settings."
        retryLabel="Try again"
        onRetry={() => void retry()}
      />
    </View>
  );
}
