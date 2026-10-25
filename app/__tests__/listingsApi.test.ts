import { newListingId, publishErrorReason, publishListing } from '@/features/listings/listingsApi';

const mockCallable = jest.fn();
const mockLogEvent = jest.fn();

jest.mock('@react-native-firebase/app', () => ({ getApp: jest.fn(() => ({})) }));
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));
jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn(() => 'listings'),
  doc: jest.fn(() => ({ id: 'AbCdEfGhIjKlMnOpQrSt' })),
}));
jest.mock('@react-native-firebase/functions', () => ({
  getFunctions: jest.fn((_app: unknown, region: string) => ({ region })),
  httpsCallable: jest.fn(
    (functions: unknown, name: string) => (data: unknown) => mockCallable(functions, name, data),
  ),
}));

const INPUT = {
  requestId: 'AbCdEfGhIjKlMnOpQrSt',
  locationId: 'home',
  listing: {
    igdbGameId: 119133,
    platform: 'ps5' as const,
    condition: 'good' as const,
    hasCase: true,
    notes: '',
    isForTrade: true,
    isForSale: false,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listings API', () => {
  it('makes a Firestore auto-ID for the request', () => {
    expect(newListingId()).toBe('AbCdEfGhIjKlMnOpQrSt');
  });

  it('publishes in the app region and logs game_listed without personal data', async () => {
    mockCallable.mockResolvedValueOnce({ data: { listingId: 'AbCdEfGhIjKlMnOpQrSt' } });
    await expect(publishListing(INPUT)).resolves.toBe('AbCdEfGhIjKlMnOpQrSt');
    expect(mockCallable).toHaveBeenCalledWith({ region: 'me-west1' }, 'publishListing', INPUT);
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'game_listed', {
      platform: 'ps5',
      hasPhotos: false,
    });
  });

  it("doesn't log when publishing failed", async () => {
    mockCallable.mockRejectedValueOnce(new Error('unavailable'));
    await expect(publishListing(INPUT)).rejects.toThrow('unavailable');
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it('reads the error reason the function sends', () => {
    expect(publishErrorReason({ details: { reason: 'wrongPlatform' } })).toBe('wrongPlatform');
    expect(publishErrorReason(new Error('x'))).toBeUndefined();
    expect(publishErrorReason(null)).toBeUndefined();
  });
});
