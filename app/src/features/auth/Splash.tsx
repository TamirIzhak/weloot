import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { APP_NAME } from '@weloot/shared';

import { Text } from '@/components';

/** Shown while the app checks whether the user is signed in (PRD §9-A). The wordmark fades and scales in. */
export function Splash() {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) progress.set(withTiming(1, { duration: 500 }));
  }, [progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: withSpring(0.9 + progress.get() * 0.1) }],
  }));

  return (
    <View className="flex-1 items-center justify-center bg-bg" testID="splash">
      <Animated.View style={style}>
        <Text variant="title" className="text-[44px] leading-[52px] text-center">
          {APP_NAME}
        </Text>
      </Animated.View>
    </View>
  );
}
