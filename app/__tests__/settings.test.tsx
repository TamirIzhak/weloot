import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ProfileTab from '@/app/(tabs)/profile';
import SettingsScreen from '@/app/settings';
import { useAuthGate } from '@/features/auth/authGate';
import { ToastProvider } from '@/components';
import { useBrowsingLocation } from '@/features/location/browsingLocation';
import { TabBarVisibilityProvider } from '@/navigation/TabBarVisibility';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUpdateSettings = jest.fn();
const mockSetLanguage = jest.fn();
const mockSignOut = jest.fn();
let mockAuthState: Record<string, unknown> = { status: 'signedOut' };
let mockSettings: Record<string, unknown> = { status: 'loading' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  Stack: { Screen: () => null },
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '0.1.0' } }));
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(),
}));
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));
jest.mock('@/features/auth/AuthProvider', () => ({
  ...jest.requireActual<object>('@/features/auth/AuthProvider'),
  useAuth: () => mockAuthState,
}));
jest.mock('@/features/profile/profileApi', () => ({}));
jest.mock('@/features/profile/settingsApi', () => ({
  useUserSettings: () => mockSettings,
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}));
jest.mock('@/features/location/savedLocations', () => ({
  useSavedLocations: () => ({ status: 'ready', items: [{ id: 'home' }] }),
}));
jest.mock('@/features/profile/links', () => ({
  supportWhatsAppUrl: (text: string) =>
    `https://wa.me/972500000000?text=${encodeURIComponent(text)}`,
  supportEmailUrl: () => null,
  legalUrl: () => null,
}));
jest.mock('@/i18n', () => ({
  ...jest.requireActual<object>('@/i18n'),
  setLanguage: (...args: unknown[]) => mockSetLanguage(...args),
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const withSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_AREA}>
    <ToastProvider>
      <TabBarVisibilityProvider>{ui}</TabBarVisibilityProvider>
    </ToastProvider>
  </SafeAreaProvider>
);

const timestamp = { toMillis: () => Date.UTC(2026, 9, 1) };
const PROFILE = {
  username: 'Gamer_1',
  usernameLower: 'gamer_1',
  ratingAvg: 0,
  ratingCount: 0,
  completedTrades: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const SETTINGS = {
  preferredLanguage: 'en',
  searchRadiusKm: 25,
  email: 'dana@example.com',
  marketingOptIn: false,
};

function signedIn(overrides: Record<string, unknown> = {}) {
  return {
    status: 'signedIn',
    user: { uid: 'u1', providerData: [{ providerId: 'google.com' }] },
    phoneVerified: false,
    profile: { status: 'ready', profile: PROFILE },
    retryProfile: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState = { status: 'signedOut' };
  mockSettings = { status: 'loading' };
  mockUpdateSettings.mockResolvedValue(undefined);
  mockSetLanguage.mockResolvedValue(true);
  mockSignOut.mockResolvedValue(undefined);
  useAuthGate.getState().cancel();
  useBrowsingLocation.getState().clear();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

describe('Profile tab', () => {
  it('invites guests to join and still offers Settings', async () => {
    await render(withSafeArea(<ProfileTab />));
    expect(screen.getByTestId('profile-guest')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('open-settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('shows the username and real trust signals', async () => {
    mockAuthState = signedIn({
      profile: {
        status: 'ready',
        profile: { ...PROFILE, ratingAvg: 4.5, ratingCount: 12, completedTrades: 7 },
      },
    });
    await render(withSafeArea(<ProfileTab />));
    expect(screen.getByText('Gamer_1')).toBeTruthy();
    expect(screen.getByText('Member since October 2026')).toBeTruthy();
    expect(screen.getByTestId('profile-rating').props.children).toBe('★ 4.5');
    expect(screen.getByText('Rating (12)')).toBeTruthy();
    expect(screen.getByTestId('profile-trades').props.children).toBe('7');
  });

  it('says there are no ratings yet instead of inventing one', async () => {
    mockAuthState = signedIn();
    await render(withSafeArea(<ProfileTab />));
    expect(screen.getByText('No ratings yet')).toBeTruthy();
  });

  it('opens My listings, Want list, Alerts and Settings', async () => {
    mockAuthState = signedIn();
    await render(withSafeArea(<ProfileTab />));
    await fireEvent.press(screen.getByTestId('my-listings'));
    await fireEvent.press(screen.getByTestId('my-wantlist'));
    await fireEvent.press(screen.getByTestId('my-alerts'));
    await fireEvent.press(screen.getByTestId('open-settings'));
    expect(mockPush.mock.calls).toEqual([
      ['/me/listings'],
      [{ pathname: '/me/[section]', params: { section: 'wantlist' } }],
      [{ pathname: '/me/[section]', params: { section: 'alerts' } }],
      ['/settings'],
    ]);
  });
});

describe('Settings', () => {
  it('gives guests language, browsing location, support, legal and version, but no account', async () => {
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.queryByTestId('settings-account')).toBeNull();
    expect(screen.getByTestId('language-he')).toBeTruthy();
    expect(screen.getByTestId('settings-browsing-location')).toBeTruthy();
    expect(screen.getByTestId('support-whatsapp')).toBeTruthy();
    expect(screen.getByTestId('app-version')).toBeTruthy();
    expect(screen.getByText('0.1.0')).toBeTruthy();
    expect(screen.queryByTestId('sign-out')).toBeNull();
  });

  it('opens WhatsApp support with the user ID prefilled', async () => {
    mockAuthState = signedIn();
    await render(withSafeArea(<SettingsScreen />));
    await fireEvent.press(screen.getByTestId('support-whatsapp'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      `https://wa.me/972500000000?text=${encodeURIComponent(
        'Hi WeLoot, I need help. (My user ID: u1)',
      )}`,
    );
  });

  it('marks the legal texts as coming soon until they are published', async () => {
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.getByTestId('legal-terms').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
  });

  it('saves the language, then restarts the app in the new direction', async () => {
    mockAuthState = signedIn();
    mockSettings = { status: 'ready', settings: SETTINGS };
    await render(withSafeArea(<SettingsScreen />));
    await fireEvent.press(screen.getByTestId('language-he'));
    expect(mockUpdateSettings).toHaveBeenCalledWith('u1', { preferredLanguage: 'he' });
    expect(mockSetLanguage).toHaveBeenCalledWith('he');
    // The current language does nothing.
    await fireEvent.press(screen.getByTestId('language-en'));
    expect(mockSetLanguage).toHaveBeenCalledTimes(1);
  });

  it('restarts in the new language even while the save is still pending (offline)', async () => {
    mockAuthState = signedIn();
    mockSettings = { status: 'ready', settings: SETTINGS };
    mockUpdateSettings.mockReturnValue(new Promise(() => undefined));
    await render(withSafeArea(<SettingsScreen />));
    await fireEvent.press(screen.getByTestId('language-he'));
    expect(mockSetLanguage).toHaveBeenCalledWith('he');
  });

  it('switches language for guests without saving anything', async () => {
    await render(withSafeArea(<SettingsScreen />));
    await fireEvent.press(screen.getByTestId('language-he'));
    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(mockSetLanguage).toHaveBeenCalledWith('he');
  });

  it('shows the account: sign-in method, phone to verify, saved addresses', async () => {
    mockAuthState = signedIn();
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.getByText('Continue with Google')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-phone'));
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
    expect(useAuthGate.getState().reason).toBe('phone');
    await fireEvent.press(screen.getByTestId('settings-addresses'));
    expect(mockPush).toHaveBeenCalledWith('/settings/addresses');
  });

  it('shows a verified phone without a button', async () => {
    mockAuthState = signedIn({ phoneVerified: true });
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.getByText('Verified ✓')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-phone'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('changes the search radius and the email offers', async () => {
    mockAuthState = signedIn();
    mockSettings = { status: 'ready', settings: SETTINGS };
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.getByTestId('radius-25').props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.press(screen.getByTestId('radius-50'));
    expect(mockUpdateSettings).toHaveBeenCalledWith('u1', { searchRadiusKm: 50 });
    await fireEvent(screen.getByTestId('email-offers'), 'valueChange', true);
    expect(mockUpdateSettings).toHaveBeenCalledWith('u1', { marketingOptIn: true });
  });

  it('switches notification kinds, all on by default', async () => {
    mockAuthState = signedIn();
    mockSettings = {
      status: 'ready',
      settings: { ...SETTINGS, notificationPrefs: { messages: false } },
    };
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.getByTestId('notify-offers').props.value).toBe(true);
    expect(screen.getByTestId('notify-messages').props.value).toBe(false);
    await fireEvent(screen.getByTestId('notify-alerts'), 'valueChange', false);
    expect(mockUpdateSettings).toHaveBeenCalledWith('u1', {
      notificationPrefs: { messages: false, alerts: false },
    });
  });

  it('forgets this device for pushes when signing out', async () => {
    const { unregisterPush } = jest.requireMock('@/features/notifications/push') as {
      unregisterPush: jest.Mock;
    };
    mockAuthState = signedIn();
    await render(withSafeArea(<SettingsScreen />));
    await fireEvent.press(screen.getByTestId('sign-out'));
    expect(unregisterPush).toHaveBeenCalled();
  });

  it('signs out and goes back', async () => {
    mockAuthState = signedIn();
    await render(withSafeArea(<SettingsScreen />));
    await fireEvent.press(screen.getByTestId('sign-out'));
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });
});
