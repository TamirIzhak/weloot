import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SignInSheet from '@/app/sign-in';
import { useAuthGate, useRequireAuth } from '@/features/auth/authGate';
import { CodeStep } from '@/features/auth/CodeStep';
import { authErrorKey } from '@/features/auth/errors';
import { PhoneStep } from '@/features/auth/PhoneStep';
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
let mockAuthState: { status: string; user?: unknown } = { status: 'signedOut' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native') as typeof import('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuthState }));

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
  mockAuthState = { status: 'signedOut' };
  usePhoneVerification.getState().clear();
  useAuthGate.getState().cancel();
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
    expect(mockLogEvent).not.toHaveBeenCalledWith({}, 'user_registered', expect.anything());
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

describe('useRequireAuth (guest-first gate)', () => {
  function Trigger({ action }: { action: () => void }) {
    const requireAuth = useRequireAuth();
    const { Pressable, Text } = jest.requireActual('react-native') as typeof import('react-native');
    return (
      <Pressable accessibilityRole="button" onPress={() => requireAuth('offer', action)}>
        <Text>Make an offer</Text>
      </Pressable>
    );
  }

  it('runs the action immediately for a signed-in user', async () => {
    mockAuthState = { status: 'signedIn', user: { uid: 'u1' } };
    const action = jest.fn();
    await render(<Trigger action={action} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(action).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens the sign-in sheet for a guest, remembers the action and logs the reason', async () => {
    const action = jest.fn();
    await render(<Trigger action={action} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(action).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
    expect(useAuthGate.getState().reason).toBe('offer');
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'sign_in_prompted', { reason: 'offer' });
  });
});

describe('PhoneStep', () => {
  it('keeps "Send code" disabled until the number is a valid Israeli mobile', async () => {
    await render(<PhoneStep title="Sign in" onSent={jest.fn()} />);
    expect(screen.getByTestId('send-code').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.changeText(screen.getByTestId('phone-input'), '054-123-4567');
    expect(screen.getByTestId('send-code').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('explains an invalid number after the user leaves the field', async () => {
    await render(<PhoneStep title="Sign in" onSent={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '03-1234567');
    await fireEvent(screen.getByTestId('phone-input'), 'blur');
    expect(screen.getByText('Enter an Israeli mobile number, like 050-123-4567.')).toBeTruthy();
  });

  it('sends the code in E.164 and moves on', async () => {
    const onSent = jest.fn();
    await render(<PhoneStep title="Sign in" onSent={onSent} />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '054 123 4567');
    await fireEvent.press(screen.getByTestId('send-code'));
    expect(mockSignIn).toHaveBeenCalledWith({}, '+972541234567');
    expect(onSent).toHaveBeenCalled();
  });

  it('shows a friendly message when sending fails', async () => {
    mockSignIn.mockRejectedValueOnce(authError('auth/too-many-requests'));
    const onSent = jest.fn();
    await render(<PhoneStep title="Sign in" onSent={onSent} />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '0541234567');
    await fireEvent.press(screen.getByTestId('send-code'));
    expect(screen.getByText('Too many attempts. Wait a few minutes and try again.')).toBeTruthy();
    expect(onSent).not.toHaveBeenCalled();
  });
});

describe('CodeStep', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the number in local format and submits automatically at 6 digits', async () => {
    await sendCode('+972541234567');
    const onVerified = jest.fn();
    await render(<CodeStep onVerified={onVerified} onChangeNumber={jest.fn()} />);
    expect(screen.getByText(/0541234567/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('code-input'), '12 34 56');
    expect(mockConfirm).toHaveBeenCalledWith('123456');
    expect(onVerified).toHaveBeenCalledWith({ isNewUser: false });
  });

  it('clears the code and explains a wrong code', async () => {
    await sendCode('+972541234567');
    mockConfirm.mockRejectedValueOnce(authError('auth/invalid-verification-code'));
    const onVerified = jest.fn();
    await render(<CodeStep onVerified={onVerified} onChangeNumber={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('code-input'), '000000');
    expect(screen.getByText('That code isn’t right. Check the SMS and try again.')).toBeTruthy();
    expect(screen.getByTestId('code-input').props.value).toBe('');
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('enables "Resend code" only after the cooldown, then resends', async () => {
    jest.useFakeTimers({ now: 0 });
    await sendCode('+972541234567', () => 0);
    await render(<CodeStep onVerified={jest.fn()} onChangeNumber={jest.fn()} />);
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

describe('SignInSheet', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the reason it was opened for', async () => {
    useAuthGate.getState().open('add', jest.fn());
    await render(withSafeArea(<SignInSheet />));
    expect(screen.getByText('Sign in to list your game')).toBeTruthy();
  });

  it('closes on the close button and forgets the pending action', async () => {
    const action = jest.fn();
    useAuthGate.getState().open('offer', action);
    const { unmount } = await render(withSafeArea(<SignInSheet />));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockBack).toHaveBeenCalled();
    await unmount();
    expect(useAuthGate.getState().onSuccess).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it('after verifying, closes and continues the pending action', async () => {
    jest.useFakeTimers();
    const action = jest.fn();
    useAuthGate.getState().open('offer', action);
    await render(withSafeArea(<SignInSheet />));
    await fireEvent.changeText(screen.getByTestId('phone-input'), '0541234567');
    await fireEvent.press(screen.getByTestId('send-code'));
    await fireEvent.changeText(screen.getByTestId('code-input'), '123456');
    expect(mockBack).toHaveBeenCalled();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('redirects home when opened while already signed in', async () => {
    mockAuthState = { status: 'signedIn', user: { uid: 'u1' } };
    await render(withSafeArea(<SignInSheet />));
    expect(screen.getByTestId('redirect').props.children).toBe('/');
  });
});
