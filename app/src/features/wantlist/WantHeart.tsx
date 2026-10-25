import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { cn } from '@/components';
import { colors } from '@/theme/tokens';

/** Heart toggle: add a game to the want list, or take it off (PRD W3). */
export function WantHeart({
  wanted,
  title,
  onPress,
  className,
  testID,
}: {
  wanted: boolean;
  /** The game, for the screen-reader label. */
  title: string;
  onPress: () => void;
  className?: string;
  testID?: string;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(wanted ? 'wantlist.remove' : 'wantlist.add', { title })}
      accessibilityState={{ selected: wanted }}
      onPress={onPress}
      hitSlop={8}
      className={cn('h-8 w-8 items-center justify-center rounded-chip bg-bg/80', className)}
      testID={testID}
    >
      <Ionicons
        name={wanted ? 'heart' : 'heart-outline'}
        size={18}
        color={wanted ? colors.danger : colors['text-primary']}
      />
    </Pressable>
  );
}
