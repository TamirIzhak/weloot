import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { PhotosScreen } from '@/features/listings/PhotosScreen';
import type * as Photos from '@/features/listings/photos';

const mockResize = jest.fn();
const mockSave = jest.fn();
const mockPutFile = jest.fn();
const mockLogEvent = jest.fn();
const mockLibrary = jest.fn();
const mockCamera = jest.fn();
const mockLibraryPermission = jest.fn();
let mockListing: Record<string, unknown> = { status: 'loading' };

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: (...args: unknown[]) => mockResize(...args),
      renderAsync: async () => ({ saveAsync: (...args: unknown[]) => mockSave(...args) }),
    }),
  },
}));
jest.mock('@react-native-firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  ref: (_s: unknown, path: string) => path,
  putFile: (...args: unknown[]) => mockPutFile(...args),
  deleteObject: jest.fn(),
  getDownloadURL: jest.fn(async () => 'https://example/photo.jpg'),
}));
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: () => mockLibraryPermission(),
  requestCameraPermissionsAsync: async () => ({ granted: true }),
  launchImageLibraryAsync: (...args: unknown[]) => mockLibrary(...args),
  launchCameraAsync: (...args: unknown[]) => mockCamera(...args),
}));
jest.mock('@/features/listings/useListing', () => ({ useListing: () => mockListing }));

const actualPhotos = jest.requireActual<typeof Photos>('@/features/listings/photos');

describe('photo pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockResolvedValue({ uri: 'file:///prepared.jpg' });
  });

  it('finds the first free slot', () => {
    expect(actualPhotos.freeSlot([])).toBe(0);
    expect(actualPhotos.freeSlot(['listings/l1/0.jpg', 'listings/l1/2.jpg'])).toBe(1);
    expect(actualPhotos.freeSlot([0, 1, 2, 3, 4, 5].map((n) => `listings/l1/${n}.jpg`))).toBeNull();
  });

  it('resizes the long edge to 1600 and re-encodes as JPEG (which drops EXIF)', async () => {
    await expect(actualPhotos.preparePhoto('file:///raw.jpg', 4000, 3000)).resolves.toBe(
      'file:///prepared.jpg',
    );
    expect(mockResize).toHaveBeenCalledWith({ width: 1600 });
    expect(mockSave).toHaveBeenCalledWith({ compress: 0.8, format: 'jpeg' });
    await actualPhotos.preparePhoto('file:///tall.jpg', 3000, 4000);
    expect(mockResize).toHaveBeenLastCalledWith({ height: 1600 });
  });

  it("doesn't upscale small photos", async () => {
    await actualPhotos.preparePhoto('file:///small.jpg', 800, 600);
    expect(mockResize).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalled();
  });

  it('uploads as JPEG to its slot, reports progress and logs photo_added', async () => {
    let listener: ((s: { bytesTransferred: number; totalBytes: number }) => void) | undefined;
    const task = Object.assign(Promise.resolve(), {
      on: (_e: string, cb: typeof listener) => {
        listener = cb;
      },
    });
    mockPutFile.mockReturnValue(task);
    const progress = jest.fn();
    const done = actualPhotos.uploadPhoto('l1', 2, 'file:///prepared.jpg', progress);
    listener?.({ bytesTransferred: 50, totalBytes: 100 });
    await done;
    expect(mockPutFile).toHaveBeenCalledWith('listings/l1/2.jpg', 'file:///prepared.jpg', {
      contentType: 'image/jpeg',
    });
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'photo_added', { slot: 2 });
  });
});

describe('PhotosScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListing = { status: 'ready', listing: { id: 'l1', photoPaths: [] } };
    mockLibraryPermission.mockResolvedValue({ granted: true });
    mockSave.mockResolvedValue({ uri: 'file:///prepared.jpg' });
    mockPutFile.mockReturnValue(Object.assign(Promise.resolve(), { on: jest.fn() }));
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', width: 4000, height: 3000 },
        { uri: 'file:///b.jpg', width: 1000, height: 800 },
      ],
    });
  });

  it('uploads picked photos into the free slots, at most six', async () => {
    mockListing = { status: 'ready', listing: { id: 'l1', photoPaths: ['listings/l1/0.jpg'] } };
    await render(<PhotosScreen listingId="l1" onDone={jest.fn()} />);
    expect(screen.getByText('Real photos')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('photos-library'));
    expect(mockLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ exif: false, allowsMultipleSelection: true, selectionLimit: 5 }),
    );
    expect(mockPutFile).toHaveBeenCalledWith(
      'listings/l1/1.jpg',
      'file:///prepared.jpg',
      expect.anything(),
    );
    expect(mockPutFile).toHaveBeenCalledWith(
      'listings/l1/2.jpg',
      'file:///prepared.jpg',
      expect.anything(),
    );
  });

  it('explains a refused permission', async () => {
    mockLibraryPermission.mockResolvedValue({ granted: false });
    await render(<PhotosScreen listingId="l1" onDone={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('photos-library'));
    expect(screen.getByTestId('photos-error')).toBeTruthy();
    expect(mockLibrary).not.toHaveBeenCalled();
  });

  it('offers a retry when an upload fails', async () => {
    mockPutFile
      .mockReturnValueOnce(Object.assign(Promise.reject(new Error('offline')), { on: jest.fn() }))
      .mockReturnValue(Object.assign(Promise.resolve(), { on: jest.fn() }));
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 100, height: 100 }],
    });
    await render(<PhotosScreen listingId="l1" onDone={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('photos-library'));
    await act(async () => undefined);
    await fireEvent.press(screen.getByTestId('photo-retry-0'));
    expect(mockPutFile).toHaveBeenCalledTimes(2);
  });

  it('disables adding when six photos are there, and removes a photo', async () => {
    const all = [0, 1, 2, 3, 4, 5].map((n) => `listings/l1/${n}.jpg`);
    mockListing = { status: 'ready', listing: { id: 'l1', photoPaths: all } };
    const storage = jest.requireMock<{ deleteObject: jest.Mock }>('@react-native-firebase/storage');
    storage.deleteObject.mockResolvedValue(undefined);
    await render(<PhotosScreen listingId="l1" onDone={jest.fn()} />);
    expect(screen.getByTestId('photos-camera').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByTestId('photo-remove-3'));
    expect(storage.deleteObject).toHaveBeenCalledWith('listings/l1/3.jpg');
  });

  it('finishes with Done', async () => {
    const onDone = jest.fn();
    await render(<PhotosScreen listingId="l1" onDone={onDone} />);
    await fireEvent.press(screen.getByTestId('photos-done'));
    expect(onDone).toHaveBeenCalled();
  });
});
