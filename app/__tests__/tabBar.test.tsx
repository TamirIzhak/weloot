import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TabBar } from '@/navigation/TabBar';
import { TabBarVisibilityProvider } from '@/navigation/TabBarVisibility';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};

const ROUTES = ['index', 'search', 'add', 'inbox', 'profile'].map((name) => ({
  key: `${name}-key`,
  name,
}));

async function renderTabBar(index = 0, defaultPrevented = false) {
  const emit = jest.fn(() => ({ defaultPrevented }));
  const navigateToTab = jest.fn();
  const props = {
    state: { index, routes: ROUTES },
    descriptors: {},
    emitter: { emit },
    navigateToTab,
    insets: SAFE_AREA.insets,
  } as unknown as BottomTabBarProps;
  const result = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <TabBarVisibilityProvider>
        <TabBar {...props} />
      </TabBarVisibilityProvider>
    </SafeAreaProvider>,
  );
  return { ...result, emit, navigateToTab };
}

describe('TabBar', () => {
  it('renders the five tabs with translated labels', async () => {
    await renderTabBar();
    for (const name of ['Home', 'Search', 'Add a game', 'Inbox', 'Profile']) {
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    }
  });

  it('marks the focused tab as selected', async () => {
    await renderTabBar(3);
    expect(screen.getByRole('tab', { name: 'Inbox' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByRole('tab', { name: 'Home' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('emits tabPress and navigates to another tab', async () => {
    const { emit, navigateToTab } = await renderTabBar(0);
    await fireEvent.press(screen.getByRole('tab', { name: 'Search' }));
    expect(emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'search-key',
      canPreventDefault: true,
    });
    expect(navigateToTab).toHaveBeenCalledWith('search-key');
  });

  it('opens the add flow from the center button', async () => {
    const { navigateToTab } = await renderTabBar(0);
    await fireEvent.press(screen.getByRole('tab', { name: 'Add a game' }));
    expect(navigateToTab).toHaveBeenCalledWith('add-key');
  });

  it('does not navigate when pressing the focused tab or when the press is prevented', async () => {
    const focused = await renderTabBar(1);
    await fireEvent.press(screen.getByRole('tab', { name: 'Search' }));
    expect(focused.navigateToTab).not.toHaveBeenCalled();
    focused.unmount();

    const prevented = await renderTabBar(0, true);
    await fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));
    expect(prevented.navigateToTab).not.toHaveBeenCalled();
  });
});
