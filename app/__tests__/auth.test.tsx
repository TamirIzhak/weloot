import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
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
const mockVerifyPhone = jest.fn();
const mockLink = jest.fn();
const mockGetIdToken = jest.fn();
let mockCurrentUser: unknown = { uid: 'u1' };
const mockRetryProfile = jest.fn();
const mockSocialSignIn = jest.fn();
let mockConfiguredMethods = ['google', 'facebook', 'discord'];
let mockAuthState: Record<string, unknown> = { status: 'signedOut' };
const signedIn = (
  profile: Record<string, unknown>,
  user: Record<string, unknown> = {},
  phoneVerified = true,
) => ({
  status: 'signedIn',
  user: { uid: 'u1', displayName: null, email: null, ...user },
  phoneVerified,
  profile,
  retryProfile: mockRetryProfile,
});
const READY = { status: 'ready', profile: { username: 'Gamer_1' } };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native') as typeof import('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));

jest.mock('@/features/auth/AuthProvider', () => ({
  ...jest.requireActual<object>('@/features/auth/AuthProvider'),
  useAuth: () => mockAuthState,
}));

// The profile step's data layer has its own tests (profile.test.tsx).
jest.mock('@/features/profile/profileApi', () => ({
  isUsernameAvailable: jest.fn(() => Promise.resolve(true)),
  createProfile: jest.fn(() => Promise.resolve()),
}));

// Provider sign-in has its own tests (socialSignIn.test.ts).
jest.mock('@/features/auth/socialSignIn', () => {
  class SignInCancelled extends Error {}
  return {
    SOCIAL_METHODS: ['google', 'facebook', 'discord'],
    isMethodConfigured: (method: string) => mockConfiguredMethods.includes(method),
    signInWithMethod: (...args: unknown[]) => mockSocialSignIn(...args),
    SignInCancelled,
  };
});

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    get currentUser() {
      return mockCurrentUser;
    },
  })),
  signInWithPhoneNumber: (...args: unknown[]) => mockSignIn(...args),
  verifyPhoneNumber: (...args: unknown[]) => mockVerifyPhone(...args),
  linkWithCredential: (...args: unknown[]) => mockLink(...args),
  getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
  PhoneAuthProvider: {
    credential: (verificationId: string, code: string) => ({ verificationId, code }),
  },
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
  mockSocialSignIn.mockResolvedValue({ isNewUser: false });
  mockVerifyPhone.mockResolvedValue({ verificationId: 'ver-1' });
  mockLink.mockResolvedValue({});
  mockGetIdToken.mockResolvedValue('token');
  mockCurrentUser = { uid: 'u1' };
  mockConfiguredMethods = ['google', 'facebook', 'discord'];
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
    ['auth/account-exists-with-different-credential', 'auth.errors.accountExists'],
    ['weloot/provider-failed', 'auth.errors.providerFailed'],
    ['weloot/play-services', 'auth.errors.playServices'],
  ])('maps %s', (code, key) => {
    expect(authErrorKey(authError(code))).toBe(key);
  });

  it.each([
    ['notConfigured', 'auth.errors.notConfigured'],
    ['invalidCode', 'auth.errors.providerFailed'],
    ['providerError', 'auth.errors.providerUnavailable'],
  ])('maps the discordSignIn reason %s', (reason, key) => {
    const error = Object.assign(authError('functions/failed-precondition'), {
      details: { reason },
    });
    expect(authErrorKey(error)).toBe(key);
  });

  it('falls back to a generic message for anything else, never the raw error', () => {
    expect(authErrorKey(authError('auth/internal-error'))).toBe('auth.errors.generic');
    expect(authErrorKey('boom')).toBe('auth.errors.generic');
    expect(authErrorKey(null)).toBe('auth.errors.generic');
  });
});

describe('phone verification flow', () => {
  it('sends the code and remembers the pending verification', async () => {
    await sendCode('+972541234567', 'signIn', () => 1000);
    expect(mockSignIn).toHaveBeenCalledWith(expect.anything(), '+972541234567');
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
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'phone_verified', { mode: 'signIn' });
    expect(usePhoneVerification.getState().pending).toBeNull();
  });

  it('links the phone to the signed-in account and refreshes the token for the phone_number claim', async () => {
    await sendCode('+972541234567', 'link');
    expect(mockVerifyPhone).toHaveBeenCalledWith(expect.anything(), '+972541234567');
    expect(mockSignIn).not.toHaveBeenCalled();
    await expect(confirmCode('123456')).resolves.toEqual({ isNewUser: false });
    expect(mockLink).toHaveBeenCalledWith(
      { uid: 'u1' },
      { verificationId: 'ver-1', code: '123456' },
    );
    expect(mockGetIdToken).toHaveBeenCalledWith({ uid: 'u1' }, true);
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'phone_verified', { mode: 'link' });
    expect(mockLogEvent).not.toHaveBeenCalledWith({}, 'user_registered', expect.anything());
  });

  it('explains a number that already belongs to another account', async () => {
    await sendCode('+972541234567', 'link');
    mockLink.mockRejectedValueOnce(authError('auth/credential-already-in-use'));
    const error: unknown = await confirmCode('123456').catch((e: unknown) => e);
    expect(authErrorKey(error)).toBe('auth.errors.phoneInUse');
    expect(mockGetIdToken).not.toHaveBeenCalled();
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

  it('runs the action immediately for a signed-in user with a profile', async () => {
    mockAuthState = signedIn(READY);
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

  it('asks for the phone once before a trading action, but not for the want list', async () => {
    mockAuthState = signedIn(READY, {}, false);
    const action = jest.fn();
    await render(<Trigger action={action} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(action).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/sign-in');

    const { result } = await renderHook(() => useRequireAuth());
    const wantlist = jest.fn();
    await act(async () => result.current('wantlist', wantlist));
    expect(wantlist).toHaveBeenCalledTimes(1);
  });

  it.each([['missing'], ['loading'], ['error']])(
    'opens the sheet for a signed-in user whose profile is %s',
    async (status) => {
      mockAuthState = signedIn({ status });
      const action = jest.fn();
      await render(<Trigger action={action} />);
      await fireEvent.press(screen.getByRole('button'));
      expect(action).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/sign-in');
    },
  );
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
    expect(mockSignIn).toHaveBeenCalledWith(expect.anything(), '+972541234567');
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
    await sendCode('+972541234567', 'signIn', () => 0);
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

  it('for a returning user, closes after the code and continues the pending action', async () => {
    jest.useFakeTimers();
    const action = jest.fn();
    useAuthGate.getState().open('offer', action);
    const { rerender } = await render(withSafeArea(<SignInSheet />));
    await fireEvent.press(screen.getByTestId('sign-in-phone'));
    await fireEvent.changeText(screen.getByTestId('phone-input'), '0541234567');
    await fireEvent.press(screen.getByTestId('send-code'));
    await fireEvent.changeText(screen.getByTestId('code-input'), '123456');
    expect(mockConfirm).toHaveBeenCalledWith('123456');

    // Firebase reports the sign-in, then the profile loads.
    mockAuthState = signedIn({ status: 'loading' });
    await rerender(withSafeArea(<SignInSheet />));
    expect(screen.getByTestId('profile-loading')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    mockAuthState = signedIn(READY);
    await rerender(withSafeArea(<SignInSheet />));
    expect(mockBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('for a new user, asks for the profile and continues only once it exists', async () => {
    jest.useFakeTimers();
    const action = jest.fn();
    useAuthGate.getState().open('add', action);
    mockAuthState = signedIn({ status: 'missing' });
    const { rerender } = await render(withSafeArea(<SignInSheet />));
    expect(screen.getByTestId('profile-step')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    mockAuthState = signedIn(READY);
    await rerender(withSafeArea(<SignInSheet />));
    expect(mockBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('starts with the sign-in methods, and the phone step can go back to them', async () => {
    await render(withSafeArea(<SignInSheet />));
    expect(screen.getByTestId('methods-step')).toBeTruthy();
    expect(screen.getByText('Continue with Google')).toBeTruthy();
    expect(screen.getByText('Continue with Facebook')).toBeTruthy();
    expect(screen.getByText('Continue with Discord')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sign-in-phone'));
    expect(screen.getByTestId('phone-input')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('other-methods'));
    expect(screen.getByTestId('methods-step')).toBeTruthy();
  });

  it('signs in with a social provider, then follows the auth state to profile setup prefilled from it', async () => {
    const action = jest.fn();
    useAuthGate.getState().open('wantlist', action);
    const { rerender } = await render(withSafeArea(<SignInSheet />));
    await fireEvent.press(screen.getByTestId('sign-in-discord'));
    expect(mockSocialSignIn).toHaveBeenCalledWith('discord');

    mockAuthState = signedIn(
      { status: 'missing' },
      { displayName: 'Dana Ben David', email: 'dana@example.com' },
    );
    await rerender(withSafeArea(<SignInSheet />));
    expect(screen.getByTestId('first-name-input').props.value).toBe('Dana');
    expect(screen.getByTestId('last-name-input').props.value).toBe('Ben David');
    expect(screen.getByTestId('email-input').props.value).toBe('dana@example.com');
    expect(action).not.toHaveBeenCalled();
  });

  it('explains a failed social sign-in and stays quiet when the user backs out', async () => {
    const { SignInCancelled } = jest.requireMock<{ SignInCancelled: new () => Error }>(
      '@/features/auth/socialSignIn',
    );
    await render(withSafeArea(<SignInSheet />));
    mockSocialSignIn.mockRejectedValueOnce(new SignInCancelled());
    await fireEvent.press(screen.getByTestId('sign-in-google'));
    expect(screen.queryByTestId('methods-error')).toBeNull();

    mockSocialSignIn.mockRejectedValueOnce(
      authError('auth/account-exists-with-different-credential'),
    );
    await fireEvent.press(screen.getByTestId('sign-in-google'));
    expect(screen.getByTestId('methods-error').props.children).toBe(
      'This email already has an account with another sign-in method. Use that one.',
    );
  });

  it('marks methods that are not set up yet (development builds) and disables them', async () => {
    mockConfiguredMethods = ['google'];
    await render(withSafeArea(<SignInSheet />));
    expect(screen.getByTestId('sign-in-facebook').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getAllByText('Not set up yet (development build).')).toHaveLength(2);
    expect(screen.getByTestId('sign-in-google').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('verifies the phone of a social account before a trading action, then continues it', async () => {
    jest.useFakeTimers();
    const action = jest.fn();
    useAuthGate.getState().open('add', action);
    mockAuthState = signedIn(READY, {}, false);
    const { rerender } = await render(withSafeArea(<SignInSheet />));
    expect(screen.getByText('Verify your phone')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('phone-input'), '0541234567');
    await fireEvent.press(screen.getByTestId('send-code'));
    expect(mockVerifyPhone).toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('code-input'), '123456');
    expect(mockLink).toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();

    // The refreshed token now has the phone number.
    mockAuthState = signedIn(READY);
    await rerender(withSafeArea(<SignInSheet />));
    expect(mockBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask for the phone when the action doesn't trade", async () => {
    useAuthGate.getState().open('wantlist', jest.fn());
    mockAuthState = signedIn({ status: 'loading' }, {}, false);
    const { rerender } = await render(withSafeArea(<SignInSheet />));
    mockAuthState = signedIn(READY, {}, false);
    await rerender(withSafeArea(<SignInSheet />));
    expect(screen.queryByText('Verify your phone')).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('offers a retry when the profile fails to load', async () => {
    mockAuthState = signedIn({ status: 'error' });
    await render(withSafeArea(<SignInSheet />));
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRetryProfile).toHaveBeenCalled();
  });

  it('redirects home when opened while already signed in with a profile', async () => {
    mockAuthState = signedIn(READY);
    await render(withSafeArea(<SignInSheet />));
    expect(screen.getByTestId('redirect').props.children).toBe('/');
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('PhoneStep input length', () => {
  it('accepts a pasted international number', async () => {
    const onSent = jest.fn();
    await render(<PhoneStep title="Sign in" onSent={onSent} />);
    expect(screen.getByTestId('phone-input').props.maxLength).toBeGreaterThanOrEqual(
      '+972 54-123-4567'.length,
    );
    await fireEvent.changeText(screen.getByTestId('phone-input'), '+972 54-123-4567');
    await fireEvent.press(screen.getByTestId('send-code'));
    expect(mockSignIn).toHaveBeenCalledWith(expect.anything(), '+972541234567');
  });
});
