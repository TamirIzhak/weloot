import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useGridDensity } from '@/features/listings/grid/density';
import { TabBarVisibilityProvider } from '@/navigation/TabBarVisibility';
import { useBrowsingLocation } from '@/features/location/browsingLocation';
import { ListingSearchScreen } from '@/features/search/ListingSearchScreen';
import { MAX_RECENT_SEARCHES, useRecentSearches } from '@/features/search/recentSearches';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  parseShekels,
  toListingFilters,
  toTile,
} from '@/features/search/searchFilters';
import { LISTING_SEARCH_DELAY_MS, LISTINGS_PER_PAGE } from '@/features/search/useListingSearch';

const mockSearch = jest.fn();
const mockLogEvent = jest.fn();
const mockPush = jest.fn();
let mockConfigured = true;
let mockAuthState: unknown = { status: 'signedOut' };
let mockSettings: unknown = { status: 'loading' };

jest.mock('@/features/search/algolia', () => ({
  isSearchConfigured: () => mockConfigured,
  searchClient: () => (mockConfigured ? { searchForHits: mockSearch } : null),
}));
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: () => ({}),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));
const mockToggleWant = jest.fn();
let mockWanted = new Set<string>();
jest.mock('@/features/wantlist/useWantToggle', () => ({
  useWantToggle: () => ({
    isWanted: (id: number, platform?: string) => mockWanted.has(`${id}_${platform ?? 'any'}`),
    toggle: (...args: unknown[]) => mockToggleWant(...args),
  }),
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuthState }));
jest.mock('@/features/profile/settingsApi', () => ({ useUserSettings: () => mockSettings }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
const mockGameDoc = jest.fn();
jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  getDoc: (path: string) => mockGameDoc(path),
}));
jest.mock('react-native-gesture-handler', () => {
  const chain = { runOnJS: () => chain, onEnd: () => chain };
  return {
    GestureDetector: ({ children }: { children: unknown }) => children,
    Gesture: { Pinch: () => chain },
  };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const render = (ui: ReactElement) =>
  rtlRender(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <TabBarVisibilityProvider>{ui}</TabBarVisibilityProvider>
    </SafeAreaProvider>,
  );

const RECORD = {
  objectID: 'l1',
  userId: 'u2',
  igdbGameId: 119133,
  gameTitle: 'Elden Ring',
  platform: 'ps5',
  coverImageId: 'co4jni',
  condition: 'like_new',
  isForTrade: true,
  isForSale: true,
  askingPriceAgorot: 15000,
  hasPhotos: true,
  areaName: 'Tel Aviv-Yafo',
  cityId: '5000',
  _geoloc: { lat: 32.08, lng: 34.78 },
  createdAtMs: 1_700_000_000_000,
};
const HAIFA = { source: 'city' as const, lat: 32.79, lng: 34.99, cityId: '4000' };

const page = (records: unknown[], extra: Record<string, unknown> = {}) => ({
  results: [{ hits: records, nbHits: records.length, nbPages: 1, ...extra }],
});
const facets = (counts: Record<string, number>) => ({
  results: [{ hits: [], facets: { gameTitle: counts } }],
});
/** The listing queries sent (not the popular-games facet query). */
const listingRequests = () =>
  mockSearch.mock.calls
    .map(([arg]) => (arg as { requests: Record<string, unknown>[] }).requests[0]!)
    .filter((request) => request.indexName === 'listings' && request.hitsPerPage !== 0);

async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(LISTING_SEARCH_DELAY_MS);
  });
}

async function type(text: string) {
  await fireEvent.changeText(screen.getByTestId('search-input'), text);
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWanted = new Set();
  jest.useFakeTimers();
  mockConfigured = true;
  mockAuthState = { status: 'signedOut' };
  mockSettings = { status: 'loading' };
  useBrowsingLocation.setState({ location: null });
  useRecentSearches.setState({ queries: [] });
  useGridDensity.setState({ density: 2, anchors: {} });
  mockSearch.mockImplementation(async ({ requests }: { requests: { hitsPerPage: number }[] }) =>
    requests[0]!.hitsPerPage === 0 ? facets({}) : page([RECORD]),
  );
  mockGameDoc.mockResolvedValue({ data: () => ({ similarGameIds: [] }) });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('search filters', () => {
  it('reads prices as whole shekels and ignores anything else', () => {
    expect(parseShekels('')).toBeUndefined();
    expect(parseShekels('150')).toBe(150);
    expect(parseShekels('1,000')).toBe(1000);
  });

  it('counts the filters that are set', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        platform: 'ps5',
        conditions: ['good', 'like_new'],
        maxShekels: '200',
        radiusKm: null,
      }),
    ).toBe(4);
  });

  it('turns the panel into index filters, in agorot, the range the right way round', () => {
    expect(
      toListingFilters({ ...EMPTY_FILTERS, mode: 'sale', minShekels: '300', maxShekels: '100' }, [
        'me',
      ]),
    ).toEqual({
      mode: 'sale',
      minPriceAgorot: 10000,
      maxPriceAgorot: 30000,
      excludeUserIds: ['me'],
    });
    expect(toListingFilters(EMPTY_FILTERS, [])).toEqual({});
  });

  it('shows a hit with its area in the reader’s language and the distance', () => {
    const tile = toTile(RECORD as never, HAIFA, 'en');
    expect(tile).toMatchObject({ id: 'l1', gameTitle: 'Elden Ring', hasPhotos: true });
    expect(tile.distanceKm).toBeGreaterThan(70);
    expect(tile.distanceKm).toBeLessThan(100);
    expect(toTile(RECORD as never, null, 'en')).not.toHaveProperty('distanceKm');
  });
});

describe('recent searches', () => {
  it('keeps the newest first, without case duplicates, capped', () => {
    const { add } = useRecentSearches.getState();
    add('zelda');
    add('  Elden   ring ');
    add('Zelda');
    add('x');
    expect(useRecentSearches.getState().queries).toEqual(['Zelda', 'Elden ring']);
    for (let i = 0; i < MAX_RECENT_SEARCHES + 3; i++) add(`game ${i}`);
    expect(useRecentSearches.getState().queries).toHaveLength(MAX_RECENT_SEARCHES);
  });
});

describe('Search tab', () => {
  it('shows recent searches and real popular games when nothing is typed', async () => {
    useRecentSearches.setState({ queries: ['Mario Kart'] });
    mockSearch.mockImplementation(async () => facets({ 'Elden Ring': 3, 'FIFA 25': 5 }));
    await render(<ListingSearchScreen />);
    await act(async () => undefined);
    expect(screen.getByTestId('search-idle')).toBeTruthy();
    expect(screen.getByText('Mario Kart')).toBeTruthy();
    expect(screen.getByText('FIFA 25 · 5')).toBeTruthy();
    expect(screen.getByText('Elden Ring · 3')).toBeTruthy();
    expect(screen.getByText('Popular on WeLoot')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('popular-Elden Ring'));
    await settle();
    expect(listingRequests().at(-1)).toMatchObject({ indexName: 'listings', query: 'Elden Ring' });
    expect(useRecentSearches.getState().queries[0]).toBe('Elden Ring');
  });

  it('searches as you type, in the grid, and logs the search without its text', async () => {
    await render(<ListingSearchScreen />);
    await type('elden');
    expect(listingRequests()).toEqual([
      { indexName: 'listings', query: 'elden', page: 0, hitsPerPage: LISTINGS_PER_PAGE },
    ]);
    expect(screen.getByTestId('listing-tile-l1')).toBeTruthy();
    expect(screen.getByText('Results: 1')).toBeTruthy();
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'search_performed', {
      has_query: true,
      filtered: false,
      results: 1,
    });
  });

  it('opens a result, and toggles it on the want list from its heart', async () => {
    mockWanted = new Set(['119133_ps5']);
    await render(<ListingSearchScreen />);
    await type('elden');
    expect(screen.getByLabelText('Remove Elden Ring from my want list')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('want-l1'));
    expect(mockToggleWant).toHaveBeenCalledWith({
      igdbGameId: 119133,
      platform: 'ps5',
      gameTitle: 'Elden Ring',
    });
    await fireEvent.press(screen.getByTestId('listing-tile-l1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/listings/[id]', params: { id: 'l1' } });
  });

  it('never shows your own or blocked users’ listings, not even while settings load', async () => {
    mockAuthState = { status: 'signedIn', user: { uid: 'me' } };
    const { rerender } = await render(<ListingSearchScreen />);
    await type('zelda');
    expect(listingRequests()).toHaveLength(0);
    expect(screen.getByTestId('search-loading')).toBeTruthy();
    mockSettings = {
      status: 'ready',
      settings: { blockedUserIds: ['troll'], searchRadiusKm: 10 },
    };
    await rerender(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <TabBarVisibilityProvider>
          <ListingSearchScreen />
        </TabBarVisibilityProvider>
      </SafeAreaProvider>,
    );
    await settle();
    expect(listingRequests()).toHaveLength(1);
    expect(listingRequests().at(-1)).toMatchObject({
      filters: 'NOT userId:"me" AND NOT userId:"troll"',
    });
  });

  it('limits to the search radius around the browsing location, and filters can widen it', async () => {
    useBrowsingLocation.setState({ location: HAIFA });
    mockAuthState = { status: 'signedIn', user: { uid: 'me' } };
    mockSettings = { status: 'ready', settings: { blockedUserIds: [], searchRadiusKm: 10 } };
    await render(<ListingSearchScreen />);
    await type('zelda');
    expect(listingRequests().at(-1)).toMatchObject({
      aroundLatLng: '32.79, 34.99',
      aroundRadius: 10_000,
    });
    // ~80 km from Haifa to Tel Aviv
    expect(
      screen.getByLabelText(/Elden Ring, PS5, Like new, Trade · ₪150, Real photos, Tel Aviv/),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('search-filters-toggle'));
    await fireEvent.press(screen.getByTestId('filter-distance-any'));
    await fireEvent.press(screen.getByTestId('filter-platform-switch'));
    await fireEvent.press(screen.getByTestId('filter-condition-new_sealed'));
    await fireEvent.changeText(screen.getByTestId('filter-price-max'), '200');
    expect(screen.getByText('Filters (4)')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('filters-done'));
    await settle();
    const last = listingRequests().at(-1)!;
    expect(last).not.toHaveProperty('aroundRadius');
    expect(last).toMatchObject({
      aroundLatLng: '32.79, 34.99',
      filters:
        'platform:switch AND isForSale:true AND askingPriceAgorot:0 TO 20000 AND condition:new_sealed AND NOT userId:"me"',
    });
  });

  it('browses everything with filters alone, no text needed', async () => {
    await render(<ListingSearchScreen />);
    await fireEvent.press(screen.getByTestId('search-filters-toggle'));
    await fireEvent.press(screen.getByTestId('filter-mode-trade'));
    await fireEvent.press(screen.getByTestId('filters-done'));
    await settle();
    expect(listingRequests().at(-1)).toMatchObject({ query: '', filters: 'isForTrade:true' });
  });

  it('offers a way out when nothing matches, and logs it', async () => {
    useBrowsingLocation.setState({ location: HAIFA });
    mockSearch.mockImplementation(async ({ requests }: { requests: { hitsPerPage: number }[] }) =>
      requests[0]!.hitsPerPage === 0 ? facets({}) : page([]),
    );
    await render(<ListingSearchScreen />);
    await type('chrono trigger');
    expect(screen.getByTestId('search-empty')).toBeTruthy();
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'search_no_results', expect.anything());
    await fireEvent.press(screen.getByText('Search all of Israel'));
    await settle();
    expect(listingRequests().at(-1)).not.toHaveProperty('aroundRadius');
  });

  describe('when nothing matches (#48)', () => {
    const GAME = {
      objectID: '119388',
      title: 'Zelda: Tears of the Kingdom',
      slug: 'zelda-totk',
      platforms: ['switch'],
      genres: [],
      altNames: [],
    };
    type Req = {
      indexName: string;
      hitsPerPage: number;
      facets?: string[];
      filters?: string;
      aroundRadius?: number;
      query: string;
    };
    /** Answers each query of the empty-state round trips like the indexes would. */
    function answer(opts: {
      otherPlatforms?: Record<string, number>;
      similar?: unknown[];
      wider?: number;
      unfiltered?: number;
    }) {
      mockSearch.mockImplementation(async ({ requests }: { requests: Req[] }) => ({
        results: requests.map((r) => {
          if (r.indexName === 'games') return { hits: [GAME] };
          if (r.facets?.includes('platform'))
            return { hits: [], facets: { platform: opts.otherPlatforms ?? {} } };
          if (r.facets?.includes('gameTitle')) return { hits: [], facets: { gameTitle: {} } };
          if (r.filters?.includes('igdbGameId:1'))
            return { hits: opts.similar ?? [], nbHits: (opts.similar ?? []).length };
          if (r.hitsPerPage === 0 && r.aroundRadius !== 10_000)
            return { hits: [], nbHits: opts.wider ?? 0 };
          if (r.hitsPerPage === 0) return { hits: [], nbHits: opts.unfiltered ?? 0 };
          return { hits: [], nbHits: 0, nbPages: 0 };
        }),
      }));
    }

    beforeEach(() => {
      useBrowsingLocation.setState({ location: HAIFA });
      mockAuthState = { status: 'signedIn', user: { uid: 'me' } };
      mockSettings = { status: 'ready', settings: { blockedUserIds: [], searchRadiusKm: 10 } };
    });

    async function searchFor(text: string) {
      await render(<ListingSearchScreen />);
      await type(text);
      await act(async () => undefined);
      await act(async () => undefined);
    }

    it('names the game and offers the want list', async () => {
      answer({});
      await searchFor('zelda totk');
      expect(screen.getByText('No one has Zelda: Tears of the Kingdom listed yet')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('empty-want'));
      expect(mockToggleWant).toHaveBeenCalledWith({
        igdbGameId: 119388,
        gameTitle: 'Zelda: Tears of the Kingdom',
      });
    });

    it('shows the same game on other consoles, and switches to one', async () => {
      answer({ otherPlatforms: { switch: 0, ps5: 3 } });
      await searchFor('zelda');
      expect(screen.getByText('PS5 · 3')).toBeTruthy();
      expect(screen.queryByText(/^Switch · /)).toBeNull();
      await fireEvent.press(screen.getByTestId('empty-platform-ps5'));
      await settle();
      expect(listingRequests().at(-1)).toMatchObject({
        filters: expect.stringContaining('platform:ps5'),
      });
    });

    it('shows similar games that are really listed', async () => {
      mockGameDoc.mockResolvedValue({ data: () => ({ similarGameIds: [1, 2] }) });
      answer({
        similar: [{ ...RECORD, objectID: 's1', igdbGameId: 1, gameTitle: 'Breath of the Wild' }],
      });
      await searchFor('zelda');
      expect(mockGameDoc).toHaveBeenCalledWith('games/119388');
      expect(screen.getByText('Similar games that are listed')).toBeTruthy();
      expect(screen.getByText('Breath of the Wild')).toBeTruthy();
    });

    it('counts results with a wider radius and without filters', async () => {
      answer({ wider: 12, unfiltered: 5 });
      await render(<ListingSearchScreen />);
      await fireEvent.press(screen.getByTestId('search-filters-toggle'));
      await fireEvent.press(screen.getByTestId('filter-condition-new_sealed'));
      await fireEvent.press(screen.getByTestId('filters-done'));
      await type('zelda');
      await act(async () => undefined);
      await act(async () => undefined);
      expect(screen.getByText('12 results if you widen to 50 km')).toBeTruthy();
      expect(screen.getByText('5 results without filters')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('empty-wider'));
      await settle();
      expect(listingRequests().at(-1)).toMatchObject({ aroundRadius: 50_000 });
    });
  });

  it('loads more pages as you scroll, without showing a listing twice', async () => {
    mockSearch.mockImplementation(
      async ({ requests }: { requests: { hitsPerPage: number; page?: number }[] }) => {
        const request = requests[0]!;
        if (request.hitsPerPage === 0) return facets({});
        return request.page === 0
          ? page([RECORD], { nbHits: 2, nbPages: 2 })
          : page([RECORD, { ...RECORD, objectID: 'l2' }], { nbHits: 2, nbPages: 2 });
      },
    );
    await render(<ListingSearchScreen />);
    await type('elden');
    await act(async () => {
      screen.getByTestId('search-results').props.onEndReached();
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    expect(listingRequests().at(-1)).toMatchObject({ page: 1 });
    expect(screen.getAllByTestId(/^listing-tile-/)).toHaveLength(2);
  });

  it('keeps the results when loading more fails, and tries again at the end of the list', async () => {
    let failNext = true;
    mockSearch.mockImplementation(
      async ({ requests }: { requests: { hitsPerPage: number; page?: number }[] }) => {
        const request = requests[0]!;
        if (request.hitsPerPage === 0) return facets({});
        if (request.page === 1 && failNext) {
          failNext = false;
          throw new Error('network');
        }
        return request.page === 0
          ? page([RECORD], { nbHits: 2, nbPages: 2 })
          : page([{ ...RECORD, objectID: 'l2' }], { nbHits: 2, nbPages: 2 });
      },
    );
    await render(<ListingSearchScreen />);
    await type('elden');
    const endReached = async () => {
      await act(async () => {
        screen.getByTestId('search-results').props.onEndReached();
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
    };
    await endReached();
    expect(screen.getAllByTestId(/^listing-tile-/)).toHaveLength(1);
    await endReached();
    expect(screen.getAllByTestId(/^listing-tile-/)).toHaveLength(2);
  });

  it('shows an error, or says search isn’t set up', async () => {
    mockSearch.mockRejectedValue(new Error('network'));
    await render(<ListingSearchScreen />);
    await type('elden');
    expect(screen.getByTestId('search-error')).toBeTruthy();

    mockConfigured = false;
    await type('elden ring');
    expect(screen.getByTestId('search-not-configured')).toBeTruthy();
  });
});
