import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components';
import { useMatchFeed } from '@/features/home/feeds';
import { HomeScreen } from '@/features/home/HomeScreen';
import { useListingsByIds } from '@/features/home/homeData';
import { useBrowsingLocation } from '@/features/location/browsingLocation';
import { TabBarVisibilityProvider } from '@/navigation/TabBarVisibility';

const mockPush = jest.fn();
const mockRequireAuth = jest.fn();
const mockSearch = jest.fn();
const mockCallable = jest.fn();
const mockGetDoc = jest.fn();
let mockViewer = {
  uid: undefined as string | undefined,
  excludedUserIds: [] as string[],
  radiusKm: 25,
  pending: false,
};
let mockMatches: { id: string; data: Record<string, unknown> }[] = [];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
let mockNewForYou: { id: string; data: Record<string, unknown> }[] = [];
const mockUpdateDoc = jest.fn();
jest.mock('@/features/search/useViewer', () => ({ useViewer: () => mockViewer }));
jest.mock('@/features/auth/authGate', () => ({
  useRequireAuth: () => (reason: string, action: () => void) => mockRequireAuth(reason, action),
}));
jest.mock('@/features/wantlist/useWantToggle', () => ({
  useWantToggle: () => ({ isWanted: () => false, toggle: jest.fn() }),
}));
jest.mock('@/features/search/algolia', () => ({
  isSearchConfigured: () => true,
  searchClient: () => ({ searchForHits: mockSearch }),
}));
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: () => ({}),
  logEvent: jest.fn(),
}));
jest.mock('@react-native-firebase/app', () => ({ getApp: () => ({}) }));
jest.mock('@react-native-firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: () => (input: unknown) => mockCallable(input),
}));
jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  query: (ref: string) => ref,
  orderBy: () => null,
  limit: () => null,
  onSnapshot: (q: string, onNext: (s: unknown) => void) => {
    const source = q.startsWith('newForYou') ? mockNewForYou : mockMatches;
    onNext({ docs: source.map((m) => ({ id: m.id, data: () => m.data })) });
    return () => undefined;
  },
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  serverTimestamp: () => 'SERVER_TIME',
  getDoc: (path: string) => mockGetDoc(path),
}));

const at = (ms: number) => ({ toMillis: () => ms });
const listing = (userId: string, igdbGameId: number, gameTitle: string, status = 'active') => ({
  userId,
  igdbGameId,
  platform: 'ps5',
  gameTitle,
  condition: 'good',
  hasCase: true,
  notes: '',
  isForTrade: true,
  isForSale: false,
  photoPaths: [],
  hasPhotos: false,
  status,
  location: { lat: 32.08, lng: 34.78, geohash: 'sv8wr', areaName: 'Tel Aviv' },
  createdAt: at(1),
  updatedAt: at(1),
});
const LISTINGS: Record<string, ReturnType<typeof listing>> = {
  'listings/p1': listing('bob', 1, 'Perfect Game'),
  'listings/w1': listing('carol', 2, 'Wanted Game'),
  'listings/w2': listing('carol', 3, 'Paused Game', 'paused'),
};
const match = (other: string, ids: string[], perfect: boolean, score: number) => ({
  id: other,
  data: {
    theirListingIds: ids,
    myListingIds: perfect ? ['m1'] : [],
    perfect,
    score,
    updatedAt: at(1),
  },
});
const RECORD = {
  objectID: 'n1',
  userId: 'dave',
  igdbGameId: 4,
  gameTitle: 'Fresh Game',
  platform: 'switch',
  condition: 'like_new',
  isForTrade: true,
  isForSale: false,
  hasPhotos: true,
  areaName: 'Haifa',
  _geoloc: { lat: 32.79, lng: 34.99 },
  createdAtMs: 1,
};

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const renderHome = (ui: ReactElement = <HomeScreen />) =>
  render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <TabBarVisibilityProvider>
        <ToastProvider>{ui}</ToastProvider>
      </TabBarVisibilityProvider>
    </SafeAreaProvider>,
  );

async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  await act(async () => undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockViewer = { uid: undefined, excludedUserIds: [], radiusKm: 25, pending: false };
  mockMatches = [];
  mockNewForYou = [];
  mockUpdateDoc.mockResolvedValue(undefined);
  useBrowsingLocation.setState({ location: null });
  mockSearch.mockResolvedValue({ results: [{ hits: [RECORD], nbHits: 1, nbPages: 1 }] });
  mockCallable.mockResolvedValue({ data: { games: [] } });
  mockGetDoc.mockImplementation(async (path: string) => {
    const data = LISTINGS[path];
    if (data?.status !== 'active')
      throw Object.assign(new Error('denied'), { code: 'firestore/permission-denied' });
    return { data: () => data };
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Home feed', () => {
  it('shows a guest new listings and an invitation to join, no matches', async () => {
    await renderHome();
    await settle();
    expect(screen.getByText('New on WeLoot')).toBeTruthy();
    expect(screen.getByText('Fresh Game')).toBeTruthy();
    expect(screen.queryByTestId('home-perfect')).toBeNull();
    await fireEvent.press(screen.getByTestId('home-join-cta'));
    expect(mockRequireAuth).toHaveBeenCalledWith('profile', expect.any(Function));
  });

  it('asks only for the last two weeks, without the viewer’s own or blocked listings', async () => {
    mockViewer = { uid: 'me', excludedUserIds: ['me', 'troll'], radiusKm: 10, pending: false };
    useBrowsingLocation.setState({
      location: { source: 'city', lat: 32.79, lng: 34.99, cityId: '4000' },
    });
    await renderHome();
    await settle();
    const request = (mockSearch.mock.calls[0]?.[0] as { requests: Record<string, unknown>[] })
      .requests[0];
    expect(request).toMatchObject({ query: '', aroundRadius: 10_000 });
    expect(String(request?.filters)).toMatch(
      /^createdAtMs > \d+ AND NOT userId:"me" AND NOT userId:"troll"$/,
    );
    expect(screen.getByText('New near you')).toBeTruthy();
  });

  it('shows perfect and one-way matches separately, skipping listings no longer active', async () => {
    mockViewer = { uid: 'me', excludedUserIds: ['me'], radiusKm: 25, pending: false };
    mockMatches = [match('bob', ['p1'], true, 120), match('carol', ['w1', 'w2'], false, 20)];
    await renderHome();
    await settle();
    expect(screen.getByText('Perfect Game')).toBeTruthy();
    expect(screen.getByText('Wanted Game')).toBeTruthy();
    expect(screen.queryByText('Paused Game')).toBeNull();
    await fireEvent.press(screen.getByTestId('home-perfect-all'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/feed/[kind]',
      params: { kind: 'perfect' },
    });
    await fireEvent.press(screen.getByTestId('listing-tile-w1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/listings/[id]', params: { id: 'w1' } });
  });

  it('offers the next step when there are no matches: build the want list', async () => {
    mockViewer = { uid: 'me', excludedUserIds: ['me'], radiusKm: 25, pending: false };
    await renderHome();
    await settle();
    // No perfect matches: that carousel hides itself; "Has games you want" invites to build the list.
    expect(screen.queryByTestId('home-perfect')).toBeNull();
    await fireEvent.press(screen.getByTestId('home-build-wantlist'));
    expect(mockPush).toHaveBeenCalledWith('/search');
  });

  it('shows real "wanted near you" counts from the server for the browsing location', async () => {
    mockViewer = { uid: 'me', excludedUserIds: ['me'], radiusKm: 25, pending: false };
    useBrowsingLocation.setState({
      location: { source: 'city', lat: 32.79, lng: 34.99, cityId: '4000' },
    });
    mockCallable.mockResolvedValue({
      data: { games: [{ igdbGameId: 1, gameTitle: 'Zelda', platform: 'switch', count: 4 }] },
    });
    await renderHome();
    await settle();
    expect(mockCallable).toHaveBeenCalledWith({ lat: 32.79, lng: 34.99, radiusKm: 25 });
    expect(screen.getByText('4 near you want Zelda (Switch)')).toBeTruthy();
  });

  it('shows New for you from alerts, marks it seen, and records an opening', async () => {
    mockViewer = { uid: 'me', excludedUserIds: ['me'], radiusKm: 25, pending: false };
    mockNewForYou = [
      {
        id: 'p1',
        data: {
          listingId: 'p1',
          igdbGameId: 1,
          platform: 'ps5',
          gameTitle: 'Perfect Game',
          areaName: 'Tel Aviv',
          alertKey: 'w_1_any',
          pushed: false,
          createdAt: at(1),
        },
      },
    ];
    await renderHome();
    await settle();
    expect(screen.getByText('New for you')).toBeTruthy();
    expect(mockUpdateDoc).toHaveBeenCalledWith('newForYou/me/items/p1', { seenAt: 'SERVER_TIME' });
    await fireEvent.press(screen.getAllByTestId('listing-tile-p1')[0]!);
    expect(mockUpdateDoc).toHaveBeenCalledWith('newForYou/me/items/p1', {
      openedAt: 'SERVER_TIME',
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/listings/[id]', params: { id: 'p1' } });
  });

  it('asks for a location before counting who wants your games nearby', async () => {
    mockViewer = { uid: 'me', excludedUserIds: ['me'], radiusKm: 25, pending: false };
    await renderHome();
    await settle();
    expect(mockCallable).not.toHaveBeenCalled();
    expect(
      screen.getByText('Choose your location to see who nearby wants your games.'),
    ).toBeTruthy();
  });
});

describe('feed hooks', () => {
  it('keeps the order of IDs and drops listings that can’t be read', async () => {
    const { result } = await renderHook(() => useListingsByIds(['w1', 'w2', 'p1']));
    await act(async () => undefined);
    expect(result.current.status === 'ready' && result.current.value.map((l) => l.id)).toEqual([
      'w1',
      'p1',
    ]);
  });

  it('lists every one-way listing in "wanted", and one per mutual match in "perfect"', async () => {
    mockViewer = { uid: 'me', excludedUserIds: ['me'], radiusKm: 25, pending: false };
    mockMatches = [match('bob', ['p1', 'w1'], true, 120), match('carol', ['w1'], false, 20)];
    const perfect = await renderHook(() => useMatchFeed('perfect', 10));
    const wanted = await renderHook(() => useMatchFeed('wanted', 10));
    await act(async () => undefined);
    expect(perfect.result.current?.map((t) => t.id)).toEqual(['p1']);
    expect(wanted.result.current?.map((t) => t.id)).toEqual(['w1']);
  });
});
