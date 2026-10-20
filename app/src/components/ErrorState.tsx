import { View } from 'react-native';

import { Button } from './Button';
import { cn } from './cn';
import { Text } from './Text';

export type ErrorStateProps = {
  title: string;
  /** Human, localized message mapped from an error code. Never a raw provider/Firebase message (PRD §3.6). */
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
  testID?: string;
  className?: string;
};

/** Shown in place of content that failed to load. */
export function ErrorState({
  title,
  message,
  retryLabel,
  onRetry,
  testID,
  className,
}: ErrorStateProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      className={cn('items-center gap-3 px-6 py-10', className)}
    >
      <Text variant="subheading" className="text-center">
        {title}
      </Text>
      {message ? (
        <Text tone="secondary" className="text-center">
          {message}
        </Text>
      ) : null}
      {onRetry && retryLabel ? (
        <Button variant="secondary" label={retryLabel} onPress={onRetry} className="mt-2" />
      ) : null}
    </View>
  );
}
