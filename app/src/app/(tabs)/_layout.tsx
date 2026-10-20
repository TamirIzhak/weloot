import { Tabs } from 'expo-router';

import { TabBar } from '@/navigation/TabBar';
import { TabBarVisibilityProvider } from '@/navigation/TabBarVisibility';

/** Main tab navigator (PRD §9-B) with the custom hide-on-scroll tab bar. */
export default function TabsLayout() {
  return (
    <TabBarVisibilityProvider>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="search" />
        <Tabs.Screen name="add" />
        <Tabs.Screen name="inbox" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </TabBarVisibilityProvider>
  );
}
