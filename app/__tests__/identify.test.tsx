import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { useAddDraft } from '@/features/listings/addDraft';
import { IdentifyScreen } from '@/features/listings/IdentifyScreen';

const mockPush = jest.fn();
const mockLookup = jest.fn();
const mockConfirm = jest.fn();
const mockRequestPermission = jest.fn();
let mockPermission: Record<string, unknown> | null = { granted: true, canAskAgain: true };
let mockScan: ((result: { data: string }) => void) | undefined;
let mockSelectGame: ((record: unknown) => void) | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useIsFocused: () => true,
  useFocusEffect: jest.fn(),
}));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
  CameraView: ({ onBarcodeScanned }: { onBarcodeScanned: (r: { data: string }) => void }) => {
    mockScan = onBarcodeScanned;
    return null;
  },
}));
jest.mock('@/features/listings/barcodeApi', () => ({
  lookupBarcode: (...args: unknown[]) => mockLookup(...args),
  confirmBarcode: (...args: unknown[]) => mockConfirm(...args),
}));
jest.mock('@/features/search/algolia', () => ({
  isSearchConfigured: () => false,
  searchClient: () => null,
}));
// Game search has its own tests; here it just hands back a pick.
jest.mock('@/features/catalog/GameSearch', () => {
  const actual = jest.requireActual<typeof import('@/features/catalog/GameSearch')>(
    '@/features/catalog/GameSearch',
  );
  return {
    ...actual,
    GameSearch: ({ onSelect }: { onSelect: (record: unknown) => void }) => {
      mockSelectGame = onSelect;
      const { Text } = jest.requireActual('react-native') as typeof import('react-native');
      return <Text testID="game-search">search</Text>;
    },
  };
});

const EAN = '0711719541783';
const ELDEN_RING = {
  objectID: '119133',
  title: 'Elden Ring',
  slug: 'elden-ring',
  platforms: ['ps4', 'ps5'],
  coverImageId: 'co4jni',
  genres: [],
  altNames: [],
};
const ZELDA = {
  ...ELDEN_RING,
  objectID: '7346',
  title: 'Zelda',
  slug: 'zelda',
  platforms: ['switch'],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = { granted: true, canAskAgain: true };
  mockScan = undefined;
  mockSelectGame = undefined;
  mockConfirm.mockResolvedValue(undefined);
  useAddDraft.getState().reset();
});

async function scan(data: string) {
  await act(async () => mockScan?.({ data }));
}

describe('IdentifyScreen', () => {
  it('matches a known barcode instantly and continues with its platform', async () => {
    mockLookup.mockResolvedValue({
      ean: EAN,
      match: { game: ELDEN_RING, platform: 'ps5', trusted: true },
      suggestions: [],
    });
    await render(<IdentifyScreen />);
    await scan('711719541783'); // UPC-A, normalized to EAN-13
    expect(mockLookup).toHaveBeenCalledWith(EAN);
    expect(screen.getByText('Is this your game?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('match-yes'));
    expect(screen.getByTestId('pick-platform-ps5').props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.press(screen.getByTestId('identify-continue'));
    expect(useAddDraft.getState()).toMatchObject({
      game: { igdbGameId: 119133, title: 'Elden Ring', platforms: ['ps4', 'ps5'] },
      platform: 'ps5',
      ean: EAN,
    });
    expect(mockConfirm).toHaveBeenCalledWith({ ean: EAN, igdbGameId: 119133, platform: 'ps5' });
    expect(mockPush).toHaveBeenCalledWith('/add/details');
  });

  it('ignores codes that are not valid barcodes', async () => {
    await render(<IdentifyScreen />);
    await scan('hello');
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('offers suggestions for an unknown barcode, then saves the confirmed mapping', async () => {
    mockLookup.mockResolvedValue({ ean: EAN, suggestions: [ELDEN_RING] });
    await render(<IdentifyScreen />);
    await scan(EAN);
    expect(screen.getByText('Which one is it?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('game-119133'));
    // Two platforms: the user must pick one.
    expect(screen.getByTestId('identify-continue').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByTestId('pick-platform-ps4'));
    await fireEvent.press(screen.getByTestId('identify-continue'));
    expect(mockConfirm).toHaveBeenCalledWith({ ean: EAN, igdbGameId: 119133, platform: 'ps4' });
  });

  it('falls back to search for a barcode nobody knows, and remembers it', async () => {
    mockLookup.mockResolvedValue({ ean: EAN, suggestions: [] });
    await render(<IdentifyScreen />);
    await scan(EAN);
    await fireEvent.press(screen.getByTestId('unknown-search'));
    expect(screen.getByTestId('barcode-unknown')).toBeTruthy();
    await act(async () => mockSelectGame?.(ZELDA));
    // One platform: chosen automatically.
    await fireEvent.press(screen.getByTestId('identify-continue'));
    expect(useAddDraft.getState()).toMatchObject({ platform: 'switch', ean: EAN });
    expect(mockConfirm).toHaveBeenCalledWith({ ean: EAN, igdbGameId: 7346, platform: 'switch' });
  });

  it('identifies by search alone, without touching the barcode table', async () => {
    await render(<IdentifyScreen />);
    await fireEvent.press(screen.getByTestId('mode-search'));
    await act(async () => mockSelectGame?.(ZELDA));
    await fireEvent.press(screen.getByTestId('identify-continue'));
    expect(useAddDraft.getState()).toMatchObject({ platform: 'switch', ean: null });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('lets the user retry or search when the lookup fails', async () => {
    mockLookup.mockRejectedValueOnce(new Error('offline'));
    await render(<IdentifyScreen />);
    await scan(EAN);
    expect(screen.getByTestId('barcode-failed')).toBeTruthy();
  });

  describe('camera permission', () => {
    it('asks for the camera, with search as an alternative', async () => {
      mockPermission = { granted: false, canAskAgain: true };
      await render(<IdentifyScreen />);
      await fireEvent.press(screen.getByTestId('camera-permission-button'));
      expect(mockRequestPermission).toHaveBeenCalled();
      await fireEvent.press(screen.getByTestId('search-instead'));
      expect(screen.getByTestId('game-search')).toBeTruthy();
    });

    it('sends the user to settings when access was refused for good', async () => {
      mockPermission = { granted: false, canAskAgain: false };
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
      await render(<IdentifyScreen />);
      expect(screen.getByText('Open settings')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('camera-permission-button'));
      expect(openSettings).toHaveBeenCalled();
    });
  });
});
