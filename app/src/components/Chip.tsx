import { Pressable, View } from 'react-native';

import type { Platform } from '@/theme/tokens';

import { cn } from './cn';
import { Text } from './Text';

const PLATFORM_BG: Record<Platform, string> = {
  ps: 'bg-ps',
  xbox: 'bg-xbox',
  nintendo: 'bg-nintendo',
};

export type ChipProps = {
  label: string;
  /** Console color for platform chips; otherwise a neutral chip. */
  platform?: Platform;
  /** Filter chips: selected state and a press handler. */
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
  className?: string;
};

/** Small pill: console labels on game cards, and toggleable search filters. */
export function Chip({ label, platform, selected = false, onPress, testID, className }: ChipProps) {
  const classes = cn(
    'self-start flex-row items-center rounded-chip px-3 py-1',
    platform
      ? PLATFORM_BG[platform]
      : selected
        ? 'bg-primary'
        : 'bg-surface-raised border border-border',
    className,
  );
  const text = (
    <Text
      variant="caption"
      className={cn(
        'font-medium',
        platform || selected ? 'text-on-primary' : 'text-text-secondary',
      )}
    >
      {label}
    </Text>
  );

  if (!onPress) {
    return (
      <View testID={testID} className={classes}>
        {text}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="togglebutton"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      className={classes}
    >
      {text}
    </Pressable>
  );
}
