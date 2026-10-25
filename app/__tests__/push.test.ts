import { Platform } from 'react-native';

import * as push from '@/features/notifications/push';

jest.unmock('@/features/notifications/push');

const mockCall = jest.fn();
const mockHasPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockInitial = jest.fn();
let mockOpened: ((m: unknown) => void) | undefined;
let mockForeground: ((m: unknown) => void) | undefined;

jest.mock('@react-native-firebase/app', () => ({ getApp: () => ({}) }));
jest.mock('@react-native-firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (_f: unknown, name: string) => (input: unknown) => mockCall(name, input),
}));
jest.mock('@react-native-firebase/messaging', () => ({
  AuthorizationStatus: { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
  getMessaging: () => ({}),
  hasPermission: () => mockHasPermission(),
  requestPermission: () => mockRequestPermission(),
  getToken: async () => 'device-token',
  deleteToken: jest.fn(async () => undefined),
  onTokenRefresh: () => () => undefined,
  getInitialNotification: () => mockInitial(),
  onNotificationOpenedApp: (_m: unknown, cb: (m: unknown) => void) => {
    mockOpened = cb;
    return () => undefined;
  },
  onMessage: (_m: unknown, cb: (m: unknown) => void) => {
    mockForeground = cb;
    return () => undefined;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  mockCall.mockResolvedValue({ data: { ok: true } });
  mockInitial.mockResolvedValue(null);
});

describe('registerForPush', () => {
  it('registers an already-allowed device without asking', async () => {
    mockHasPermission.mockResolvedValue(1);
    await expect(push.registerForPush(false)).resolves.toBe(true);
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockCall).toHaveBeenCalledWith('registerPushToken', { token: 'device-token' });
  });

  it('asks only when told to, and registers nothing when refused', async () => {
    mockHasPermission.mockResolvedValue(-1);
    await expect(push.registerForPush(false)).resolves.toBe(false);
    expect(mockRequestPermission).not.toHaveBeenCalled();
    mockRequestPermission.mockResolvedValue(0);
    await expect(push.registerForPush(true)).resolves.toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
    mockRequestPermission.mockResolvedValue(1);
    await expect(push.registerForPush(true)).resolves.toBe(true);
  });

  it('never throws', async () => {
    mockHasPermission.mockRejectedValue(new Error('no native module'));
    await expect(push.registerForPush(true)).resolves.toBe(false);
  });
});

describe('push taps', () => {
  it('maps a push to its screen', () => {
    expect(push.targetOf({ type: 'conversation', conversationId: 'c1' })).toEqual({
      pathname: '/conversations/[id]',
      params: { id: 'c1' },
    });
    expect(push.targetOf({ type: 'listing', listingId: 'l1' })).toEqual({
      pathname: '/listings/[id]',
      params: { id: 'l1' },
    });
    expect(push.targetOf({ type: 'other' })).toBeNull();
  });

  it('opens the screen of a push that launched or resumed the app; shows foreground ones', async () => {
    mockInitial.mockResolvedValue({ data: { type: 'listing', listingId: 'l1' } });
    const open = jest.fn();
    const foreground = jest.fn();
    push.watchPushes(open, foreground);
    await Promise.resolve();
    await Promise.resolve();
    expect(open).toHaveBeenCalledWith(
      { pathname: '/listings/[id]', params: { id: 'l1' } },
      { type: 'listing', listingId: 'l1' },
    );
    mockOpened?.({ data: { type: 'conversation', conversationId: 'c1' } });
    expect(open).toHaveBeenLastCalledWith(
      { pathname: '/conversations/[id]', params: { id: 'c1' } },
      { type: 'conversation', conversationId: 'c1' },
    );
    mockForeground?.({ notification: { title: 'dana', body: 'Hi' } });
    expect(foreground).toHaveBeenCalledWith({ notification: { title: 'dana', body: 'Hi' } });
  });
});

describe('unregisterPush', () => {
  it('forgets this device before signing out', async () => {
    await push.unregisterPush();
    expect(mockCall).toHaveBeenCalledWith('unregisterPushToken', { token: 'device-token' });
  });
});
