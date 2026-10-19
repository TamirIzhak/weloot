import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { colors } from '@/theme/tokens';

import { cn } from './cn';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

const CONTAINER: Record<ButtonVariant, string> = {
  primary: 'bg-primary active:bg-primary-pressed',
  secondary: 'bg-surface-raised border border-border active:bg-surface',
  ghost: 'bg-transparent active:bg-surface',
  danger: 'bg-danger active:opacity-80',
};

const LABEL: Record<ButtonVariant, string> = {
  primary: 'text-on-primary',
  secondary: 'text-text-primary',
  ghost: 'text-accent',
  danger: 'text-on-primary',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'h-11 px-4',
  lg: 'h-14 px-6',
};

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Icon shown before the label (start side, so it flips in RTL). */
  icon?: ReactNode;
  fullWidth?: boolean;
  accessibilityHint?: string;
  testID?: string;
  className?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  accessibilityHint,
  testID,
  className,
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      className={cn(
        'flex-row items-center justify-center rounded-button',
        CONTAINER[variant],
        SIZE[size],
        fullWidth && 'self-stretch',
        inactive && 'opacity-50',
        className,
      )}
    >
      {loading ? (
        <ActivityIndicator
          testID={testID ? `${testID}-loading` : undefined}
          color={
            variant === 'secondary' || variant === 'ghost'
              ? colors['text-primary']
              : colors['on-primary']
          }
        />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon}
          <Text variant="label" className={cn(LABEL[variant], size === 'lg' && 'text-[16px]')}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
