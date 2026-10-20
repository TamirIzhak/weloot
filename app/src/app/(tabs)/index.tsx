import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { APP_NAME } from '@weloot/shared';

import { Button, Text } from '@/components';
import { FirebaseStatus } from '@/features/dev/FirebaseStatus';
import { initFirebase } from '@/lib/firebase';

// Placeholder home screen. Replaced by the tab navigator in #06.
export default function Index() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center bg-bg px-6">
      <Text variant="title" className="text-[40px] leading-[48px] text-center">
        {APP_NAME}
      </Text>
      {__DEV__ && (
        <>
          <FirebaseStatus emulatorHost={initFirebase()} />
          <Button
            variant="ghost"
            label={t('home.kitchenSink')}
            onPress={() => router.push('/dev/kitchen-sink')}
            className="mt-6"
          />
        </>
      )}
    </View>
  );
}
