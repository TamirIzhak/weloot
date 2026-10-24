import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DeleteAccountScreen from '@/app/settings/delete-account';
import { ToastProvider } from '@/components';
import { deleteMyAccount } from '@/features/profile/deleteAccount';

const mockReplace = jest.fn();
const mockCallable = jest.fn();
const mockSignOut = jest.fn();
let mockAuthState: Record<string, unknown> = { status: 'signedIn', user: { uid: 'u1' } };

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  Stack: { Screen: () => null },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native') as typeof import('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuthState }));
jest.mock('@react-native-firebase/app', () => ({ getApp: jest.fn(() => ({})) }));
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));
jest.mock('@react-native-firebase/functions', () => ({
  getFunctions: jest.fn((_app: unknown, region: string) => ({ region })),
  httpsCallable: jest.fn((functions: unknown, name: string) => () => mockCallable(functions, name)),
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const withToast = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_AREA}>
    <ToastProvider>{ui}</ToastProvider>
  </SafeAreaProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState = { status: 'signedIn', user: { uid: 'u1' } };
  mockCallable.mockResolvedValue({ data: { deleted: true } });
  mockSignOut.mockResolvedValue(undefined);
});

describe('deleteMyAccount', () => {
  it('calls deleteAccount in the app region, then signs out on this device', async () => {
    await deleteMyAccount();
    expect(mockCallable).toHaveBeenCalledWith({ region: 'me-west1' }, 'deleteAccount');
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("doesn't sign out when the deletion failed", async () => {
    mockCallable.mockRejectedValueOnce(new Error('unavailable'));
    await expect(deleteMyAccount()).rejects.toThrow('unavailable');
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('DeleteAccountScreen', () => {
  const button = () => screen.getByTestId('delete-account-button');

  it('explains what is deleted and needs an explicit confirmation', async () => {
    await render(withToast(<DeleteAccountScreen />));
    expect(screen.getByText('Your saved addresses')).toBeTruthy();
    expect(button().props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('confirm-delete'));
    expect(button().props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('deletes the account and goes home', async () => {
    await render(withToast(<DeleteAccountScreen />));
    await fireEvent.press(screen.getByTestId('confirm-delete'));
    await fireEvent.press(button());
    expect(mockCallable).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('explains a failure and lets the user try again', async () => {
    mockCallable.mockRejectedValueOnce(new Error('unavailable'));
    await render(withToast(<DeleteAccountScreen />));
    await fireEvent.press(screen.getByTestId('confirm-delete'));
    await fireEvent.press(button());
    expect(screen.getByTestId('delete-error')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(button().props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('sends guests away', async () => {
    mockAuthState = { status: 'signedOut' };
    await render(withToast(<DeleteAccountScreen />));
    expect(screen.getByTestId('redirect')).toBeTruthy();
  });
});
