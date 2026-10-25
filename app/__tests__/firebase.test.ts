// jest.mock calls are hoisted above imports by babel-jest.
import { emulatorHost } from '@/lib/firebase';

jest.mock('@react-native-firebase/app', () => ({ getApp: jest.fn(() => ({})) }));
const mockInitAppCheck = jest.fn();
jest.mock('@/lib/appCheck', () => ({ initAppCheck: () => mockInitAppCheck() }));
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(),
  connectAuthEmulator: jest.fn(),
}));
jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(),
  connectFirestoreEmulator: jest.fn(),
}));
jest.mock('@react-native-firebase/functions', () => ({
  getFunctions: jest.fn(),
  connectFunctionsEmulator: jest.fn(),
}));
jest.mock('@react-native-firebase/storage', () => ({
  getStorage: jest.fn(),
  connectStorageEmulator: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: '192.168.1.10:8081' } },
}));

describe('emulatorHost', () => {
  it('takes the host part of the dev server URI', () => {
    expect(emulatorHost('192.168.1.10:8081')).toBe('192.168.1.10');
    expect(emulatorHost('10.0.2.2:8081')).toBe('10.0.2.2');
  });

  it('returns null without a dev server URI', () => {
    expect(emulatorHost(undefined)).toBeNull();
    expect(emulatorHost('')).toBeNull();
  });
});

describe('initFirebase', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  function load() {
    // Re-require so module state (the cached result) starts fresh in each test.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require('@/lib/firebase') as typeof import('@/lib/firebase');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const firestore = require('@react-native-firebase/firestore') as {
      connectFirestoreEmulator: jest.Mock;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const functions = require('@react-native-firebase/functions') as { getFunctions: jest.Mock };
    return { lib, firestore, functions };
  }

  it('connects all services to the emulators on the dev machine when opted in', () => {
    process.env.EXPO_PUBLIC_USE_EMULATORS = 'true';
    const { lib, firestore, functions } = load();
    expect(lib.initFirebase()).toBe('192.168.1.10');
    expect(firestore.connectFirestoreEmulator).toHaveBeenCalledWith(
      undefined,
      '192.168.1.10',
      8080,
    );
    expect(functions.getFunctions).toHaveBeenCalledWith({}, 'me-west1');
  });

  it('connects only once', () => {
    process.env.EXPO_PUBLIC_USE_EMULATORS = 'true';
    const { lib, firestore } = load();
    lib.initFirebase();
    lib.initFirebase();
    expect(firestore.connectFirestoreEmulator).toHaveBeenCalledTimes(1);
  });

  it('keeps going when a service is already connected after a JS reload (#52)', () => {
    process.env.EXPO_PUBLIC_USE_EMULATORS = 'true';
    const { lib, firestore, functions } = load();
    firestore.connectFirestoreEmulator.mockImplementation(() => {
      throw new Error(
        '[firestore/unknown] Firestore has already been started and its settings can no longer be changed.',
      );
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => lib.initFirebase()).not.toThrow();
    expect(lib.initFirebase()).toBe('192.168.1.10');
    expect(functions.getFunctions).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('firestore emulator connection skipped'),
    );
    warn.mockRestore();
  });

  it('uses the real project when not opted in', () => {
    delete process.env.EXPO_PUBLIC_USE_EMULATORS;
    const { lib, firestore } = load();
    expect(lib.initFirebase()).toBeNull();
    expect(firestore.connectFirestoreEmulator).not.toHaveBeenCalled();
  });
});
