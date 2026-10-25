import { manageListing } from '@/features/listings/myListings';

const mockCallable = jest.fn();
const mockLogEvent = jest.fn();

jest.mock('@react-native-firebase/app', () => ({ getApp: jest.fn(() => ({})) }));
jest.mock('@react-native-firebase/firestore', () => ({}));
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));
jest.mock('@react-native-firebase/functions', () => ({
  getFunctions: jest.fn((_app: unknown, region: string) => ({ region })),
  httpsCallable: jest.fn(
    (functions: unknown, name: string) => (data: unknown) => mockCallable(functions, name, data),
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('manageListing', () => {
  it('logs listing_closed and listing_closed_outside when closing with someone outside WeLoot', async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'traded' } });
    await expect(
      manageListing({ listingId: 'l1', action: 'closeTraded', closedWith: { kind: 'outside' } }),
    ).resolves.toBe('traded');
    expect(mockCallable).toHaveBeenCalledWith({ region: 'me-west1' }, 'manageListing', {
      listingId: 'l1',
      action: 'closeTraded',
      closedWith: { kind: 'outside' },
    });
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'listing_closed', { result: 'traded' });
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'listing_closed_outside', { result: 'traded' });
  });

  it("doesn't log for pause/resume/remove", async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'paused' } });
    await manageListing({ listingId: 'l1', action: 'pause' });
    expect(mockLogEvent).not.toHaveBeenCalled();
  });
});
