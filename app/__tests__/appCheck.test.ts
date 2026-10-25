const mockInitialize = jest.fn();
const mockConfigure = jest.fn();
let mockVariant: string | undefined = 'production';

jest.mock('@react-native-firebase/app', () => ({ getApp: () => ({ name: 'app' }) }));
jest.mock('@react-native-firebase/app-check', () => ({
  initializeAppCheck: (...a: unknown[]) => mockInitialize(...a),
  ReactNativeFirebaseAppCheckProvider: class {
    configure(options: unknown) {
      mockConfigure(options);
    }
  },
}));
jest.mock('expo-constants', () => ({
  get expoConfig() {
    return { extra: { appVariant: mockVariant } };
  },
}));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

// A fresh module per test (it starts App Check only once per process).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = () => require('@/lib/appCheck') as typeof import('@/lib/appCheck');

describe('App Check', () => {
  it('attests release builds with Play Integrity and App Attest', () => {
    expect(load().appCheckProviders('production')).toEqual({
      android: { provider: 'playIntegrity' },
      apple: { provider: 'appAttestWithDeviceCheckFallback' },
    });
    expect(load().appCheckProviders('preview').android.provider).toBe('playIntegrity');
  });

  it('uses the debug provider in development builds (no token bundled)', () => {
    expect(load().appCheckProviders('development')).toEqual({
      android: { provider: 'debug' },
      apple: { provider: 'debug' },
    });
    expect(load().appCheckProviders(undefined).android.provider).toBe('debug');
  });

  it('starts once, with token refresh, for the build’s variant', () => {
    mockVariant = 'production';
    const appCheck = load();
    appCheck.initAppCheck();
    appCheck.initAppCheck();
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledWith(
      { name: 'app' },
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    );
    expect(mockConfigure).toHaveBeenCalledWith(
      expect.objectContaining({ android: { provider: 'playIntegrity' } }),
    );
    expect(JSON.stringify(mockConfigure.mock.calls)).not.toContain('debugToken');
  });

  it('never throws if the native module is missing', () => {
    mockInitialize.mockImplementation(() => {
      throw new Error('no native module');
    });
    expect(() => load().initAppCheck()).not.toThrow();
  });
});
