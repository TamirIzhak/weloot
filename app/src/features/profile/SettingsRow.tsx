import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { I18nManager, Pressable, View } from 'react-native';

import { cn, Text } from '@/components';
import { colors } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** A titled group of rows on a card (Settings, Profile). */
export function SettingsSection({
  title,
  children,
  testID,
}: {
  title?: string;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View className="gap-2" testID={testID}>
      {title ? (
        <Text variant="label" tone="secondary" className="px-1">
          {title}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-card bg-surface">{children}</View>
    </View>
  );
}

/**
 * One row: icon, label, optional value, and a chevron when it opens something. `disabled` rows explain why in
 * `value` (e.g. "Coming soon"). Pass `right` for a custom control (e.g. a switch).
 */
export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  disabled,
  right,
  first,
  testID,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
  right?: ReactNode;
  first?: boolean;
  testID?: string;
}) {
  const content = (
    <>
      <Ionicons name={icon} size={20} color={colors['text-secondary']} />
      <Text className="flex-1">{label}</Text>
      {value ? (
        <Text tone="muted" variant="caption" numberOfLines={1} className="max-w-[50%]">
          {value}
        </Text>
      ) : null}
      {right}
      {onPress && !disabled && !right ? (
        <Ionicons
          name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
          size={18}
          color={colors['text-muted']}
        />
      ) : null}
    </>
  );
  const className = cn(
    'flex-row items-center gap-3 px-4 py-3.5',
    !first && 'border-t border-border',
    disabled && 'opacity-50',
  );
  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={value ? `${label}, ${value}` : label}
        accessibilityState={disabled ? { disabled: true } : undefined}
        className={className}
        testID={testID}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className={cn(className, 'active:bg-surface-raised')}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}
