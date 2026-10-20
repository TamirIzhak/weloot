import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, Text } from '@/components';

import { useTabBarInset } from './TabBarVisibility';

export type PlaceholderScreenProps = {
  title: string;
  body: string;
  icon?: ReactNode;
  testID?: string;
};

/** Temporary screen for a tab whose feature isn't built yet (the issue that builds it replaces this). */
export function PlaceholderScreen({ title, body, icon, testID }: PlaceholderScreenProps) {
  const bottom = useTabBarInset();
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']} testID={testID}>
      <View className="px-4 pt-2">
        <Text variant="heading">{title}</Text>
      </View>
      <View className="flex-1 justify-center" style={{ paddingBottom: bottom }}>
        <EmptyState title={title} body={body} icon={icon} />
      </View>
    </SafeAreaView>
  );
}
