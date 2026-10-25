import {
  initMonitoring,
  reportError,
  setMonitoringUser,
  trackAlertOpened,
} from '@/features/monitoring/crash';

jest.unmock('@/features/monitoring/crash');

const mockRecord = jest.fn();
const mockCrashUser = jest.fn();
const mockAnalyticsUser = jest.fn();
const mockCollection = jest.fn();
const mockLogEvent = jest.fn();
jest.mock('@react-native-firebase/crashlytics', () => ({
  getCrashlytics: () => ({}),
  recordError: (...a: unknown[]) => mockRecord(...a),
  setUserId: async (...a: unknown[]) => mockCrashUser(...a),
  setCrashlyticsCollectionEnabled: async (...a: unknown[]) => mockCollection(...a),
}));
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: () => ({}),
  setUserId: async (...a: unknown[]) => mockAnalyticsUser(...a),
  logEvent: (...a: unknown[]) => mockLogEvent(...a),
}));

beforeEach(() => jest.clearAllMocks());

describe('monitoring', () => {
  it('sends no crashes from development builds', () => {
    initMonitoring();
    expect(mockCollection).toHaveBeenCalledWith({}, false);
  });

  it('reports caught errors, wrapping anything that isn’t an Error', () => {
    const error = new Error('boom');
    reportError(error, 'ErrorBoundary');
    expect(mockRecord).toHaveBeenCalledWith({}, error, 'ErrorBoundary');
    reportError('text');
    expect((mockRecord.mock.calls[1] as [unknown, Error])[1].message).toBe('text');
  });

  it('tags reports and analytics with the user ID only, and clears it on sign-out', () => {
    setMonitoringUser('u1');
    expect(mockCrashUser).toHaveBeenCalledWith({}, 'u1');
    expect(mockAnalyticsUser).toHaveBeenCalledWith({}, 'u1');
    setMonitoringUser(null);
    expect(mockCrashUser).toHaveBeenLastCalledWith({}, '');
    expect(mockAnalyticsUser).toHaveBeenLastCalledWith({}, null);
  });

  it('logs alert_opened for a tapped alert push', () => {
    trackAlertOpened('l1');
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'alert_opened', {
      listing_id: 'l1',
      from: 'push',
    });
  });

  it('never throws when the native module is missing', () => {
    mockRecord.mockImplementation(() => {
      throw new Error('no native module');
    });
    expect(() => reportError(new Error('x'))).not.toThrow();
  });
});
