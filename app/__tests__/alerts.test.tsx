import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components';
import { markOpened, markSeen, type NewForYouItem } from '@/features/alerts/alertsApi';
import { AlertsScreen } from '@/features/alerts/AlertsScreen';
import { useNotifyMe } from '@/features/alerts/useNotifyMe';

const mockSetDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockLogEvent = jest.fn();
const mockPush = jest.fn();
const mockRequireAuth = jest.fn();
let mockDocs: { id: string; data: Record<string, unknown> }[] = [];

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  query: (ref: string) => ref,
  orderBy: () => null,
  limit: () => null,
  serverTimestamp: () => 'SERVER_TIME',
  onSnapshot: (_q: unknown, onNext: (s: unknown) => void) => {
    onNext({ docs: mockDocs.map((d) => ({ id: d.id, data: () => d.data })) });
    return () => undefined;
  },
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
}));
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({ currentUser: { uid: 'me' } }),
}));
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: () => ({}),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', user: { uid: 'me' } }),
}));
jest.mock('@/features/auth/authGate', () => ({
  useRequireAuth: () => (reason: string, action: () => void) => mockRequireAuth(reason, action),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const at = (ms: number) => ({ toMillis: () => ms });
const ALERT = {
  id: '119388_any',
  data: {
    igdbGameId: 119388,
    gameTitle: 'Zelda TOTK',
    radiusKm: 25,
    lat: 32.79,
    lng: 34.99,
    source: 'search',
    createdAt: at(2),
  },
};
const SWITCH_ALERT = {
  id: '1942_switch',
  data: {
    igdbGameId: 1942,
    platform: 'switch',
    gameTitle: 'Witcher 3',
    radiusKm: 25,
    source: 'search',
    createdAt: at(1),
  },
};

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const Providers = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={SAFE_AREA}>
    <ToastProvider>{children}</ToastProvider>
  </SafeAreaProvider>
);
const renderScreen = (ui: ReactElement) => render(<Providers>{ui}</Providers>);

beforeEach(() => {
  jest.clearAllMocks();
  mockDocs = [ALERT, SWITCH_ALERT];
  mockRequireAuth.mockImplementation((_reason: string, action: () => void) => action());
  mockSetDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
});

describe('useNotifyMe', () => {
  it('creates an area alert behind the alert sign-in, and logs it', async () => {
    mockDocs = [];
    const { result } = await renderHook(() => useNotifyMe(), { wrapper: Providers });
    await act(async () => {
      result.current.toggle({
        igdbGameId: 119388,
        gameTitle: 'Zelda TOTK',
        radiusKm: 25,
        center: { lat: 32.79, lng: 34.99 },
      });
    });
    expect(mockRequireAuth).toHaveBeenCalledWith('alert', expect.any(Function));
    expect(mockSetDoc).toHaveBeenCalledWith('alerts/me/items/119388_any', {
      igdbGameId: 119388,
      gameTitle: 'Zelda TOTK',
      radiusKm: 25,
      lat: 32.79,
      lng: 34.99,
      source: 'search',
      createdAt: 'SERVER_TIME',
    });
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'alert_created', {
      igdb_game_id: 119388,
      platform: 'any',
    });
  });

  it('turns an existing alert off', async () => {
    const { result } = await renderHook(() => useNotifyMe(), { wrapper: Providers });
    expect(result.current.isOn(119388)).toBe(true);
    expect(result.current.isOn(119388, 'switch')).toBe(false);
    await act(async () => {
      result.current.toggle({ igdbGameId: 119388, gameTitle: 'Zelda TOTK', radiusKm: 25 });
    });
    expect(mockDeleteDoc).toHaveBeenCalledWith('alerts/me/items/119388_any');
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

describe('AlertsScreen', () => {
  it('lists alerts with console and distance, explains the want list, and removes one', async () => {
    await renderScreen(<AlertsScreen uid="me" />);
    expect(screen.getByText('Zelda TOTK')).toBeTruthy();
    expect(screen.getByText('Within 25 km')).toBeTruthy();
    expect(screen.getByText('Anywhere in Israel')).toBeTruthy();
    expect(screen.getByText(/Games on your want list alert you too/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('alert-remove-119388_any'));
    expect(mockDeleteDoc).toHaveBeenCalledWith('alerts/me/items/119388_any');
  });

  it('points to search when there are none', async () => {
    mockDocs = [];
    await renderScreen(<AlertsScreen uid="me" />);
    expect(screen.getByTestId('alerts-empty')).toBeTruthy();
  });
});

describe('New for you analytics', () => {
  const item = (overrides: Partial<NewForYouItem> = {}): NewForYouItem => ({
    id: 'l1',
    listingId: 'l1',
    igdbGameId: 119388,
    platform: 'switch',
    gameTitle: 'Zelda TOTK',
    areaName: 'Haifa',
    alertKey: 'a_119388_any',
    pushed: true,
    createdAt: at(1),
    ...overrides,
  });

  it('marks unseen items seen once (alert_notified), and openings (alert_opened)', () => {
    markSeen('me', [item(), item({ id: 'l2', listingId: 'l2', seenAt: at(2) })]);
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).toHaveBeenCalledWith('newForYou/me/items/l1', { seenAt: 'SERVER_TIME' });
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'alert_notified', {
      igdb_game_id: 119388,
      pushed: true,
    });
    markOpened('me', item());
    expect(mockUpdateDoc).toHaveBeenCalledWith('newForYou/me/items/l1', {
      openedAt: 'SERVER_TIME',
    });
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'alert_opened', { igdb_game_id: 119388 });
  });
});
