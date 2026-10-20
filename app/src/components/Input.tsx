import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '@/theme/tokens';

import { cn } from './cn';
import { Text } from './Text';

export type InputProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  label: string;
  /** Validation message; shows the field in the error state. */
  error?: string;
  helper?: string;
  className?: string;
};

/** Labeled text field with helper and error text. Text aligns to the start side, so it follows RTL. */
export function Input({
  label,
  error,
  helper,
  className,
  onFocus,
  onBlur,
  testID,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const message = error ?? helper;
  return (
    <View className={cn('gap-1.5', className)}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={message}
        placeholderTextColor={colors['text-muted']}
        selectionColor={colors.primary}
        testID={testID}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn(
          'h-12 rounded-button bg-surface-raised px-4 font-sans text-[16px] text-text-primary border',
          error ? 'border-danger' : focused ? 'border-primary' : 'border-transparent',
        )}
        {...props}
      />
      {message ? (
        <Text
          variant="caption"
          tone={error ? 'danger' : 'muted'}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
          testID={testID ? `${testID}-message` : undefined}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}
