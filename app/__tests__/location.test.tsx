import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BrowsingLocationScreen from '@/app/location';
import { AddressFormScreen } from '@/features/location/AddressFormScreen';
import { browsingLocationName, useBrowsingLocation } from '@/features/location/browsingLocation';
import { CitySearch } from '@/features/location/CitySearch';
import {
  findAddress,
  getDevicePosition,
  localityFor,
  LocationUnavailable,
} from '@/features/location/deviceLocation';
import { LocationChip } from '@/features/location/LocationChip';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockRequestPermission = jest.fn();
const mockPosition = jest.fn();
const mockReverse = jest.fn();
const mockGeocode = jest.fn();
const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
let mockAuthState: Record<string, unknown> = { status: 'signedOut' };
let mockSaved: Record<string, unknown> = { status: 'ready', items: [] };

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native') as typeof import('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuthState }));
jest.mock('expo-location', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestPermission(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockPosition(...args),
  reverseGeocodeAsync: (...args: unknown[]) => mockReverse(...args),
  geocodeAsync: (...args: unknown[]) => mockGeocode(...args),
}));
jest.mock('@/features/location/savedLocations', () => {
  class SavedLocationError extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.reason = reason;
    }
  }
  return {
    useSavedLocations: () => mockSaved,
    addSavedLocation: (...args: unknown[]) => mockAdd(...args),
    updateSavedLocation: (...args: unknown[]) => mockUpdate(...args),
    deleteSavedLocation: (...args: unknown[]) => mockDelete(...args),
    SavedLocationError,
  };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const withSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_AREA}>{ui}</SafeAreaProvider>
);

// Dizengoff Center, Tel Aviv
const DIZENGOFF = { lat: 32.0754, lng: 34.7752 };
const HOME = {
  id: 'home',
  label: 'Home',
  address: 'Dizengoff 50, Tel Aviv',
  ...DIZENGOFF,
  cityId: '5000',
  areaName: 'Tel Aviv - Yafo',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState = { status: 'signedOut' };
  mockSaved = { status: 'ready', items: [] };
  useBrowsingLocation.getState().clear();
  mockRequestPermission.mockResolvedValue({ status: 'granted' });
  mockPosition.mockResolvedValue({ coords: { latitude: DIZENGOFF.lat, longitude: DIZENGOFF.lng } });
  mockReverse.mockResolvedValue([
    { street: 'Dizengoff', streetNumber: '50', city: 'Tel Aviv-Yafo' },
  ]);
  mockGeocode.mockResolvedValue([]);
  mockAdd.mockResolvedValue('new-id');
  mockUpdate.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
});

describe('device location', () => {
  it('returns the position once permission is granted', async () => {
    await expect(getDevicePosition()).resolves.toEqual(DIZENGOFF);
  });

  it('reports denied permission or a missing fix as unavailable', async () => {
    mockRequestPermission.mockResolvedValueOnce({ status: 'denied' });
    await expect(getDevicePosition()).rejects.toBeInstanceOf(LocationUnavailable);
    mockPosition.mockRejectedValueOnce(new Error('Location services are disabled'));
    await expect(getDevicePosition()).rejects.toBeInstanceOf(LocationUnavailable);
  });

  it('names the locality from the geocoder when it matches nearby, else the nearest one', () => {
    expect(localityFor(DIZENGOFF, 'תל אביב').id).toBe('5000');
    // A geocoder name that matches nothing nearby falls back to the nearest locality.
    expect(localityFor(DIZENGOFF, 'Eilat').id).toBe('5000');
    expect(localityFor(DIZENGOFF).id).toBe('5000');
  });

  it('looks addresses up in Israel only', async () => {
    mockGeocode.mockResolvedValueOnce([
      { latitude: 48.85, longitude: 2.35 },
      { latitude: 32.08, longitude: 34.78 },
    ]);
    await expect(findAddress('Dizengoff 50')).resolves.toEqual({ lat: 32.08, lng: 34.78 });
    expect(mockGeocode).toHaveBeenCalledWith('Dizengoff 50, Israel');
    mockGeocode.mockResolvedValueOnce([{ latitude: 48.85, longitude: 2.35 }]);
    await expect(findAddress('Rue de Rivoli, Paris')).resolves.toBeNull();
  });
});

describe('browsing location', () => {
  it('stores only an area-level point', () => {
    useBrowsingLocation.getState().setLocation({ source: 'device', ...DIZENGOFF, cityId: '5000' });
    expect(useBrowsingLocation.getState().location).toMatchObject({ lat: 32.08, lng: 34.78 });
  });

  it('is named by its locality, or by a saved address label', () => {
    expect(browsingLocationName({ source: 'city', lat: 0, lng: 0, cityId: '4000' }, 'he')).toBe(
      'חיפה',
    );
    expect(
      browsingLocationName(
        { source: 'saved', lat: 0, lng: 0, cityId: '4000', label: 'Home' },
        'en',
      ),
    ).toBe('Home');
  });

  it('shows on the chip and opens the picker', async () => {
    await render(<LocationChip />);
    expect(screen.getByText('Choose your area')).toBeTruthy();
    await act(async () =>
      useBrowsingLocation
        .getState()
        .setLocation({ source: 'city', lat: 32.8, lng: 35, cityId: '4000' }),
    );
    expect(screen.getByText('Near: Haifa')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('location-chip'));
    expect(mockPush).toHaveBeenCalledWith('/location');
  });
});

describe('CitySearch', () => {
  it('suggests localities in both languages, with the name in the other one too', async () => {
    const onSelect = jest.fn();
    await render(<CitySearch label="City" onSelect={onSelect} />);
    await fireEvent.changeText(screen.getByTestId('city-input'), 'metula');
    expect(screen.getByText('מטולה')).toBeTruthy();
    expect(screen.getAllByTestId('icon-location-outline')).toHaveLength(1);
    await fireEvent.changeText(screen.getByTestId('city-input'), 'חיפה');
    await fireEvent.press(screen.getByTestId('city-4000'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '4000' }));
  });

  it('says when nothing matches', async () => {
    await render(<CitySearch label="City" onSelect={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('city-input'), 'Atlantis');
    expect(screen.queryByTestId('city-results')).toBeNull();
    expect(screen.getByText('No place found. Try another spelling.')).toBeTruthy();
  });
});

describe('BrowsingLocationScreen', () => {
  it('uses the device location (area-level) and closes', async () => {
    await render(withSafeArea(<BrowsingLocationScreen />));
    await fireEvent.press(screen.getByTestId('use-current-location'));
    expect(useBrowsingLocation.getState().location).toEqual({
      source: 'device',
      lat: 32.08,
      lng: 34.78,
      cityId: '5000',
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('falls back to choosing a city when location is off', async () => {
    mockRequestPermission.mockResolvedValue({ status: 'denied' });
    await render(withSafeArea(<BrowsingLocationScreen />));
    await fireEvent.press(screen.getByTestId('use-current-location'));
    expect(screen.getByTestId('location-error')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('browse-city-input'), 'haifa');
    await fireEvent.press(screen.getByTestId('browse-city-4000'));
    expect(useBrowsingLocation.getState().location).toMatchObject({
      source: 'city',
      cityId: '4000',
    });
  });

  it('offers saved addresses to signed-in users', async () => {
    mockAuthState = { status: 'signedIn', user: { uid: 'u1' } };
    mockSaved = { status: 'ready', items: [HOME] };
    await render(withSafeArea(<BrowsingLocationScreen />));
    expect(screen.getByText('Others see: Tel Aviv - Yafo')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('saved-location-home'));
    expect(useBrowsingLocation.getState().location).toMatchObject({
      source: 'saved',
      label: 'Home',
      cityId: '5000',
    });
    await fireEvent.press(screen.getByTestId('edit-location-home'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/addresses/[id]', params: { id: 'home' } });
  });

  it('shows no saved addresses to guests', async () => {
    await render(withSafeArea(<BrowsingLocationScreen />));
    expect(screen.queryByTestId('saved-locations')).toBeNull();
  });
});

describe('AddressFormScreen', () => {
  beforeEach(() => {
    mockAuthState = { status: 'signedIn', user: { uid: 'u1' } };
  });

  it('saves the current location as "Home" for a first address, showing only the area', async () => {
    await render(withSafeArea(<AddressFormScreen />));
    expect(screen.getByTestId('save-address').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByTestId('address-use-current'));
    expect(screen.getByTestId('address-input').props.value).toBe('Dizengoff 50, Tel Aviv-Yafo');
    expect(screen.getByText('Others will see: Tel Aviv - Yafo')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('save-address'));
    expect(mockAdd).toHaveBeenCalledWith(
      'u1',
      {
        label: 'Home',
        address: 'Dizengoff 50, Tel Aviv-Yafo',
        ...DIZENGOFF,
        cityId: '5000',
        areaName: 'Tel Aviv - Yafo',
      },
      0,
    );
    expect(mockBack).toHaveBeenCalled();
  });

  it('finds a typed address and needs a name for "Other"', async () => {
    mockSaved = { status: 'ready', items: [HOME] };
    mockGeocode.mockResolvedValue([{ latitude: 32.794, longitude: 34.99 }]);
    mockReverse.mockResolvedValue([{ city: 'Haifa' }]);
    await render(withSafeArea(<AddressFormScreen />));
    await fireEvent.changeText(screen.getByTestId('address-input'), 'Herzl 1, Haifa');
    await fireEvent.press(screen.getByTestId('find-address'));
    expect(screen.getByText('Others will see: Haifa')).toBeTruthy();
    // A second address defaults to "Other", which needs a name.
    expect(screen.getByTestId('save-address').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.changeText(screen.getByTestId('custom-label-input'), 'Parents');
    await fireEvent.press(screen.getByTestId('save-address'));
    expect(mockAdd).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ label: 'Parents', cityId: '4000', address: 'Herzl 1, Haifa' }),
      1,
    );
  });

  it('explains an address it cannot find', async () => {
    await render(withSafeArea(<AddressFormScreen />));
    await fireEvent.changeText(screen.getByTestId('address-input'), 'Nowhere 1');
    await fireEvent.press(screen.getByTestId('find-address'));
    expect(screen.getByTestId('address-error')).toBeTruthy();
    expect(screen.queryByTestId('area-preview')).toBeNull();
  });

  it('edits and deletes an existing address', async () => {
    mockSaved = { status: 'ready', items: [HOME] };
    await render(withSafeArea(<AddressFormScreen id="home" />));
    expect(screen.getByTestId('address-input').props.value).toBe('Dizengoff 50, Tel Aviv');
    await fireEvent.press(screen.getByTestId('label-work'));
    await fireEvent.press(screen.getByTestId('save-address'));
    expect(mockUpdate).toHaveBeenCalledWith(
      'u1',
      'home',
      expect.objectContaining({ label: 'Work' }),
    );
    await fireEvent.press(screen.getByTestId('delete-address'));
    expect(mockDelete).toHaveBeenCalledWith('u1', 'home');
  });

  it('waits for the saved list before showing the form', async () => {
    mockSaved = { status: 'loading' };
    await render(withSafeArea(<AddressFormScreen />));
    expect(screen.getByTestId('address-loading')).toBeTruthy();
    expect(screen.queryByTestId('address-form')).toBeNull();
  });

  it('sends guests away', async () => {
    mockAuthState = { status: 'signedOut' };
    await render(withSafeArea(<AddressFormScreen />));
    expect(screen.getByTestId('redirect')).toBeTruthy();
  });
});
