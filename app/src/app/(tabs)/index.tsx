import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_NAME } from '@weloot/shared';

import { Button, EmptyState, Text } from '@/components';
import { FirebaseStatus } from '@/features/dev/FirebaseStatus';
import { SampleFeed } from '@/features/dev/SampleFeed';
import { initFirebase } from '@/lib/firebase';
import { useHideOnScroll, useTabBarInset } from '@/navigation/TabBarVisibility';

/** Home tab. The real feed (matches, near you) arrives in #22; until then a welcome state and dev tools. */
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
        contentContainerClassName="gap-6 px-4 pt-2"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        testID="home-scroll"
      >
        <Text variant="title" className="text-[34px] leading-[40px]">
          {APP_NAME}
        </Text>
        <EmptyState title={t('home.welcomeTitle')} body={t('home.welcomeBody')} />
        {__DEV__ && (
          <View className="gap-4">
            <FirebaseStatus emulatorHost={initFirebase()} />
            <Button
              variant="secondary"
              label={t('home.kitchenSink')}
              onPress={() => router.push('/dev/kitchen-sink')}
            />
            <SampleFeed />
          </View>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
