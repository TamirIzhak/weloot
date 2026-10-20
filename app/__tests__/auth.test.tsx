import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PhoneScreen from '@/app/(onboarding)/phone';
import VerifyScreen from '@/app/(onboarding)/verify';
import { authErrorKey } from '@/features/auth/errors';
import {
  confirmCode,
  RESEND_COOLDOWN_SECONDS,
  sendCode,
  usePhoneVerification,
} from '@/features/auth/phoneVerification';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSignIn = jest.fn();
const mockConfirm = jest.fn();
const mockAdditionalInfo = jest.fn();
const mockLogEvent = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native') as typeof import('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signInWithPhoneNumber: (...args: unknown[]) => mockSignIn(...args),
  getAdditionalUserInfo: (...args: unknown[]) => mockAdditionalInfo(...args),
}));

jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const withSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_AREA}>{ui}</SafeAreaProvider>
);
const authError = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  jest.clearAllMocks();
  usePhoneVerification.getState().clear();
  mockSignIn.mockResolvedValue({ confirm: mockConfirm });
  mockConfirm.mockResolvedValue({ user: { uid: 'u1' } });
  mockAdditionalInfo.mockReturnValue({ isNewUser: false });
});

describe('authErrorKey', () => {
  it.each([
    ['auth/invalid-phone-number', 'auth.errors.invalidPhone'],
    ['auth/invalid-verification-code', 'auth.errors.invalidCode'],
    ['auth/code-expired', 'auth.errors.codeExpired'],
    ['auth/too-many-requests', 'auth.errors.tooManyRequests'],
    ['auth/network-request-failed', 'auth.errors.network'],
    ['auth/quota-exceeded', 'auth.errors.quotaExceeded'],
    ['weloot/no-pending-verification', 'auth.errors.sessionLost'],
  ])('maps %s', (code, key) => {
    expect(authErrorKey(authError(code))).toBe(key);
  });

  it('falls back to a generic message for anything else, never the raw error', () => {
    expect(authErrorKey(authError('auth/internal-error'))).toBe('auth.errors.generic');
    expect(authErrorKey('boom')).toBe('auth.errors.generic');
    expect(authErrorKey(null)).toBe('auth.errors.generic');
  });
});

describe('phone verification flow', () => {
  it('sends the code and remembers the pending verification', async () => {
    await sendCode('+972541234567', () => 1000);
    expect(mockSignIn).toHaveBeenCalledWith({}, '+972541234567');
    expect(usePhoneVerification.getState().pending).toMatchObject({
      phoneE164: '+972541234567',
      sentAt: 1000,
    });
  });

  it('logs user_registered only for a brand-new user, then clears the pending state', async () => {
    await sendCode('+972541234567');
    mockAdditionalInfo.mockReturnValue({ isNewUser: true });
    await expect(confirmCode('123456')).resolves.toEqual({ isNewUser: true });
    expect(mockConfirm).toHaveBeenCalledWith('123456');
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'user_registered', { method: 'phone' });
    expect(usePhoneVerification.getState().pending).toBeNull();
  });

  it('does not log user_registered for a returning user', async () => {
    await sendCode('+972541234567');
    await confirmCode('123456');
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it('keeps the pending state when the code is wrong, so the user can retry', async () => {
    await sendCode('+972541234567');
    mockConfirm.mockRejectedValueOnce(authError('auth/invalid-verification-code'));
    await expect(confirmCode('000000')).rejects.toMatchObject({
      code: 'auth/invalid-verification-code',
    });
    expect(usePhoneVerification.getState().pending).not.toBeNull();
  });

  it('fails clearly without a pending verification', async () => {
    await expect(confirmCode('123456')).rejects.toMatchObject({
      code: 'weloot/no-pending-verification',
    });
  });
});

describe('PhoneScreen', () => {
  it('keeps "Send code" disabled until the number is a valid Israeli mobile', async () => {
    await render(withSafeArea(<PhoneScreen />));
    const button = screen.getByTestId('send-code');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.changeText(screen.getByTestId('phone-input'), '054-123-4567');
    expect(screen.getByTestId('send-code').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('explains an invalid number after the user leaves the field', async () => {
    await render(withSafeArea(<PhoneScreen />));
    await fireEvent.changeText(screen.getByTestId('phone-input'), '03-1234567');
    await fireEvent(screen.getByTestId('phone-input'), 'blur');
    expect(screen.getByText('Enter an Israeli mobile number, like 050-123-4567.')).toBeTruthy();
  });

  it('sends the code in E.164 and moves to the code screen', async () => {
    await render(withSafeArea(<PhoneScreen />));
    await fireEvent.changeText(screen.getByTestId('phone-input'), '054 123 4567');
    await fireEvent.press(screen.getByTestId('send-code'));
    expect(mockSignIn).toHaveBeenCalledWith({}, '+972541234567');
    expect(mockPush).toHaveBeenCalledWith('/verify');
  });

  it('shows a friendly message when sending fails', async () => {
    mockSignIn.mockRejectedValueOnce(authError('auth/too-many-requests'));
    await render(withSafeArea(<PhoneScreen />));
    await fireEvent.changeText(screen.getByTestId('phone-input'), '0541234567');
    await fireEvent.press(screen.getByTestId('send-code'));
    expect(screen.getByText('Too many attempts. Wait a few minutes and try again.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('VerifyScreen', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends people back to the phone screen when no verification is pending', async () => {
    await render(withSafeArea(<VerifyScreen />));
    expect(screen.getByTestId('redirect').props.children).toBe('/phone');
  });

  it('shows the number in local format and submits automatically at 6 digits', async () => {
    await sendCode('+972541234567');
    await render(withSafeArea(<VerifyScreen />));
    expect(screen.getByText(/0541234567/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('code-input'), '12 34 56');
    expect(mockConfirm).toHaveBeenCalledWith('123456');
  });

  it('clears the code and explains a wrong code', async () => {
    await sendCode('+972541234567');
    mockConfirm.mockRejectedValueOnce(authError('auth/invalid-verification-code'));
    await render(withSafeArea(<VerifyScreen />));
    await fireEvent.changeText(screen.getByTestId('code-input'), '000000');
    expect(screen.getByText('That code isn’t right. Check the SMS and try again.')).toBeTruthy();
    expect(screen.getByTestId('code-input').props.value).toBe('');
  });

  it('enables "Resend code" only after the cooldown, then resends', async () => {
    jest.useFakeTimers({ now: 0 });
    await sendCode('+972541234567', () => 0);
    await render(withSafeArea(<VerifyScreen />));
    expect(screen.getByTestId('resend-code').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await act(async () => {
      jest.advanceTimersByTime(RESEND_COOLDOWN_SECONDS * 1000 + 1000);
    });
    const resend = screen.getByTestId('resend-code');
    expect(resend.props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(resend);
    expect(mockSignIn).toHaveBeenCalledTimes(2);
  });
});
