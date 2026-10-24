import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuthGate } from '@/features/auth/authGate';
import { TabBar } from '@/navigation/TabBar';
import { TabBarVisibilityProvider } from '@/navigation/TabBarVisibility';

const mockPush = jest.fn();
const SIGNED_IN = {
  status: 'signedIn',
  user: { uid: 'u1' },
  profile: { status: 'ready', profile: { username: 'Gamer_1' } },
};
let mockAuthState: Record<string, unknown> = SIGNED_IN;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/features/auth/AuthProvider', () => ({
  ...jest.requireActual<object>('@/features/auth/AuthProvider'),
  useAuth: () => mockAuthState,
}));
jest.mock('@/features/profile/profileApi', () => ({}));
jest.mock('@react-native-firebase/auth', () => ({}));
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState = SIGNED_IN;
  useAuthGate.getState().cancel();
});

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
    await focused.unmount();

    const prevented = await renderTabBar(0, true);
    await fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));
    expect(prevented.navigateToTab).not.toHaveBeenCalled();
  });

  describe('as a guest (PRD W1)', () => {
    beforeEach(() => {
      mockAuthState = { status: 'signedOut' };
    });

    it('lets guests open Home, Search and Profile directly', async () => {
      const { navigateToTab } = await renderTabBar(0);
      await fireEvent.press(screen.getByRole('tab', { name: 'Search' }));
      await fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));
      expect(navigateToTab).toHaveBeenCalledWith('search-key');
      expect(navigateToTab).toHaveBeenCalledWith('profile-key');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it.each([
      ['Add a game', 'add'],
      ['Inbox', 'inbox'],
    ])('opens the sign-in sheet for %s, then continues to the tab', async (name, reason) => {
      const { navigateToTab } = await renderTabBar(0);
      await fireEvent.press(screen.getByRole('tab', { name }));
      expect(navigateToTab).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/sign-in');
      expect(useAuthGate.getState().reason).toBe(reason);
      useAuthGate.getState().take()?.();
      expect(navigateToTab).toHaveBeenCalledWith(`${reason}-key`);
    });
  });
});
