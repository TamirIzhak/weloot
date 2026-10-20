import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cn } from './cn';

export type SkeletonProps = {
  /** Size and shape via classes, e.g. "h-40 w-full rounded-card". */
  className?: string;
  testID?: string;
};

/** Pulsing placeholder shown while real content loads. Never used to fake activity (PRD §1.2). */
export function Skeleton({ className, testID }: SkeletonProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={style}
      className={cn('bg-surface-raised rounded-md', className)}
    />
  );
}
