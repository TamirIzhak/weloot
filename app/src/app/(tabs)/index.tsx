import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_NAME } from '@weloot/shared';

import { Button, Text } from '@/components';
import { FirebaseStatus } from '@/features/dev/FirebaseStatus';
import { SampleFeed } from '@/features/dev/SampleFeed';
import { HomeScreen } from '@/features/home/HomeScreen';
import { LocationChip } from '@/features/location/LocationChip';
import { initFirebase } from '@/lib/firebase';
import { useHideOnScroll, useTabBarInset } from '@/navigation/TabBarVisibility';

/** Home tab: the feed (#22), plus development tools in dev builds. */
export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const onScroll = useHideOnScroll();
  const bottomInset = useTabBarInset();

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerClassName="gap-6 pt-2"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        testID="home-scroll"
      >
        <View className="gap-3 px-4">
          <Text variant="title" className="text-[34px] leading-[40px]">
            {APP_NAME}
          </Text>
          <LocationChip />
        </View>
        <HomeScreen />
        {__DEV__ && (
          <View className="gap-4 px-4">
            <FirebaseStatus emulatorHost={initFirebase()} />
            <Button
              variant="secondary"
              label={t('home.kitchenSink')}
              onPress={() => router.push('/dev/kitchen-sink')}
            />
            <Button
              variant="secondary"
              label={t('listings.grid.devTitle')}
              onPress={() => router.push('/dev/grid')}
            />
            <SampleFeed />
          </View>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
