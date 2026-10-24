import { confirmBarcode, lookupBarcode } from '@/features/listings/barcodeApi';

const mockCallable = jest.fn();

jest.mock('@react-native-firebase/app', () => ({ getApp: jest.fn(() => ({})) }));
jest.mock('@react-native-firebase/functions', () => ({
  getFunctions: jest.fn((_app: unknown, region: string) => ({ region })),
  httpsCallable: jest.fn(
    (functions: unknown, name: string) => (data: unknown) => mockCallable(functions, name, data),
  ),
}));

const EAN = '0711719541783';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('barcode API', () => {
  it('looks a barcode up in the app region and checks the answer', async () => {
    mockCallable.mockResolvedValueOnce({ data: { ean: EAN, suggestions: [] } });
    await expect(lookupBarcode(EAN)).resolves.toEqual({ ean: EAN, suggestions: [] });
    expect(mockCallable).toHaveBeenCalledWith({ region: 'me-west1' }, 'lookupBarcode', {
      ean: EAN,
    });
  });

  it('rejects a malformed answer instead of showing it', async () => {
    mockCallable.mockResolvedValueOnce({ data: { ean: 'nope' } });
    await expect(lookupBarcode(EAN)).rejects.toThrow();
  });

  it('sends confirmations', async () => {
    mockCallable.mockResolvedValueOnce({ data: { trusted: false } });
    await confirmBarcode({ ean: EAN, igdbGameId: 119133, platform: 'ps5' });
    expect(mockCallable).toHaveBeenCalledWith({ region: 'me-west1' }, 'confirmBarcode', {
      ean: EAN,
      igdbGameId: 119133,
      platform: 'ps5',
    });
  });
});
