import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from './cn';
import { Text } from './Text';

export type BadgeTone = 'accent' | 'primary' | 'success' | 'warning' | 'neutral';

const TONE: Record<BadgeTone, { bg: string; text: string }> = {
  accent: { bg: 'bg-accent', text: 'text-on-accent' },
  primary: { bg: 'bg-primary', text: 'text-on-primary' },
  success: { bg: 'bg-success', text: 'text-bg' },
  warning: { bg: 'bg-warning', text: 'text-bg' },
  neutral: { bg: 'bg-surface-raised', text: 'text-text-secondary' },
};

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  icon?: ReactNode;
  testID?: string;
  className?: string;
};

/** Compact status label, e.g. "Real photos" (accent), "Perfect match", "Trade". */
export function Badge({ label, tone = 'accent', icon, testID, className }: BadgeProps) {
  const t = TONE[tone];
  return (
    <View
      testID={testID}
      className={cn(
        'self-start flex-row items-center gap-1 rounded-md px-2 py-0.5',
        t.bg,
        className,
      )}
    >
      {icon}
      <Text variant="caption" className={cn('font-bold text-[11px] leading-[16px]', t.text)}>
        {label}
      </Text>
    </View>
  );
}
