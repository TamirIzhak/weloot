import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from './cn';

export type CardProps = {
  children: ReactNode;
  /** Makes the whole card tappable (e.g. a game card opening its detail page). */
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  className?: string;
};

/** Rounded surface for feed items and grouped content (PRD §3.3). */
export function Card({ children, onPress, accessibilityLabel, testID, className }: CardProps) {
  const classes = cn('bg-surface rounded-card overflow-hidden', className);
  if (!onPress) {
    return (
      <View testID={testID} className={classes}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      className={cn(classes, 'active:opacity-80')}
    >
      {children}
    </Pressable>
  );
}
