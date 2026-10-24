import { act, renderHook } from '@testing-library/react-native';

import { MAX_SAVED_LOCATIONS } from '@weloot/shared';

import {
  addSavedLocation,
  SavedLocationError,
  updateSavedLocation,
  useSavedLocations,
} from '@/features/location/savedLocations';

const mockAddDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockListeners: ((snapshot: unknown) => void)[] = [];

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  doc: (parent: string, id: string) => `${parent}/${id}`,
  query: (ref: string) => ref,
  orderBy: jest.fn(),
  onSnapshot: (_query: unknown, next: (snapshot: unknown) => void) => {
    mockListeners.push(next);
    return jest.fn();
  },
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteDoc: jest.fn(),
  deleteField: () => 'DELETE_FIELD',
  serverTimestamp: () => 'SERVER_TIME',
}));

const INPUT = {
  label: 'Home',
  address: 'Dizengoff 50, Tel Aviv',
  lat: 32.0754,
  lng: 34.7752,
  cityId: '5000',
  areaName: 'Tel Aviv - Yafo',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.length = 0;
  mockAddDoc.mockResolvedValue({ id: 'new-id' });
});

describe('saved addresses', () => {
  it('adds an address under users/{uid}/locations with server timestamps', async () => {
    await expect(addSavedLocation('u1', INPUT, 0)).resolves.toBe('new-id');
    expect(mockAddDoc).toHaveBeenCalledWith('users/u1/locations', {
      ...INPUT,
      createdAt: 'SERVER_TIME',
      updatedAt: 'SERVER_TIME',
    });
  });

  it('refuses more than the maximum, and invalid input, before writing', async () => {
    await expect(addSavedLocation('u1', INPUT, MAX_SAVED_LOCATIONS)).rejects.toEqual(
      new SavedLocationError('tooMany'),
    );
    await expect(addSavedLocation('u1', { ...INPUT, lat: 48.85 }, 0)).rejects.toMatchObject({
      reason: 'invalid',
    });
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('removes a locality that no longer matches when editing', async () => {
    const { cityId: _cityId, ...withoutCity } = INPUT;
    await updateSavedLocation('u1', 'home', withoutCity);
    expect(mockUpdateDoc).toHaveBeenCalledWith('users/u1/locations/home', {
      ...withoutCity,
      cityId: 'DELETE_FIELD',
      updatedAt: 'SERVER_TIME',
    });
  });

  it('lists valid addresses for a signed-in user and nothing for guests', async () => {
    const guest = await renderHook(() => useSavedLocations(undefined));
    expect(guest.result.current).toEqual({ status: 'ready', items: [] });

    const { result } = await renderHook(() => useSavedLocations('u1'));
    expect(result.current).toEqual({ status: 'loading' });
    const timestamp = { toMillis: () => 0 };
    await act(async () =>
      mockListeners[0]?.({
        docs: [
          { id: 'home', data: () => ({ ...INPUT, createdAt: timestamp, updatedAt: timestamp }) },
          { id: 'broken', data: () => ({ label: '' }) },
        ],
      }),
    );
    expect(result.current).toEqual({
      status: 'ready',
      items: [{ ...INPUT, createdAt: timestamp, updatedAt: timestamp, id: 'home' }],
    });
  });
});
