import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from './Button';
import { cn } from './cn';
import { Text } from './Text';

export type EmptyStateAction = { label: string; onPress: () => void };

export type EmptyStateProps = {
  title: string;
  body?: string;
  icon?: ReactNode;
  /** Main next step (e.g. "Notify me when it's listed"). Every empty state should offer one (PRD W4). */
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  testID?: string;
  className?: string;
};

/** An invitation to act, never a dead end. */
export function EmptyState({
  title,
  body,
  icon,
  primaryAction,
  secondaryAction,
  testID,
  className,
}: EmptyStateProps) {
  return (
    <View testID={testID} className={cn('items-center gap-3 px-6 py-10', className)}>
      {icon}
      <Text variant="subheading" className="text-center">
        {title}
      </Text>
      {body ? (
        <Text tone="secondary" className="text-center">
          {body}
        </Text>
      ) : null}
      {primaryAction || secondaryAction ? (
        <View className="mt-2 items-center gap-2">
          {primaryAction ? (
            <Button label={primaryAction.label} onPress={primaryAction.onPress} />
          ) : null}
          {secondaryAction ? (
            <Button
              variant="ghost"
              label={secondaryAction.label}
              onPress={secondaryAction.onPress}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
