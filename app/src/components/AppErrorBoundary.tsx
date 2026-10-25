import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { reportError } from '@/features/monitoring/crash';

import { ErrorState } from './ErrorState';

/**
 * Root crash screen, exported as `ErrorBoundary` from the root layout (Expo Router convention).
 * Shows a calm, localized message and a retry instead of a blank screen. The error goes to Crashlytics (#39) and,
 * in development, to the console.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  useEffect(() => {
    reportError(error, 'ErrorBoundary');
  }, [error]);
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
