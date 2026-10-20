import type { ErrorBoundaryProps } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ErrorState } from './ErrorState';

/**
 * Root crash screen, exported as `ErrorBoundary` from the root layout (Expo Router convention).
 * Shows a calm, localized message and a retry instead of a blank screen. The error is still reported in dev
 * and, from #39, to Crashlytics.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  if (__DEV__) console.error('[ErrorBoundary]', error);
  return (
    <View className="flex-1 justify-center bg-bg">
      <ErrorState
        testID="app-error-boundary"
        title={t('errorBoundary.title')}
        message={t('errorBoundary.message')}
        retryLabel={t('common.tryAgain')}
        onRetry={() => void retry()}
      />
    </View>
  );
}
