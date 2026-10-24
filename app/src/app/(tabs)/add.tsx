import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IdentifyScreen } from '@/features/listings/IdentifyScreen';
import { useTabBarInset } from '@/navigation/TabBarVisibility';

/**
 * Add tab (+): the Add flow's first step, Identify (PRD W2). Reached through the tab bar, which asks guests to
 * sign in and verify their phone first (PRD W1).
 */
export default function AddTab() {
  const bottomInset = useTabBarInset();
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']} testID="add-screen">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-4 pt-2"
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <IdentifyScreen />
      </ScrollView>
    </SafeAreaView>
  );
}
