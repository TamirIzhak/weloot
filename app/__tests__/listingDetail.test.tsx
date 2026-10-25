import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components';
import { ListingDetailScreen } from '@/features/listings/ListingDetailScreen';
import { useListing } from '@/features/listings/useListing';
import { useBrowsingLocation } from '@/features/location/browsingLocation';
import { ReportScreen } from '@/features/safety/ReportScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRequireAuth = jest.fn();
const mockSubmit = jest.fn();
const mockOnSnapshot = jest.fn();
let mockAuthState: unknown = { status: 'signedOut' };
let mockProfile: unknown = { status: 'loading' };
let mockPhotos: string[] = [];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
const mockToggleWant = jest.fn();
let mockWanted = new Set<string>();
jest.mock('@/features/wantlist/useWantToggle', () => ({
  useWantToggle: () => ({
    isWanted: (id: number, platform?: string) => mockWanted.has(`${id}_${platform ?? 'any'}`),
    toggle: (...args: unknown[]) => mockToggleWant(...args),
  }),
}));
let mockConversation: string = 'none';
jest.mock('@/features/offers/offersApi', () => ({ useConversationFor: () => mockConversation }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuthState }));
jest.mock('@/features/auth/authGate', () => ({
  useRequireAuth: () => (reason: string, action: () => void) => mockRequireAuth(reason, action),
}));
jest.mock('@/features/profile/usePublicProfile', () => ({ usePublicProfile: () => mockProfile }));
jest.mock('@/features/listings/usePhotoUrls', () => ({ usePhotoUrls: () => mockPhotos }));
jest.mock('@/features/safety/reportApi', () => {
  class ReportError extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.reason = reason;
    }
  }
  return { ReportError, submitReport: (...args: unknown[]) => mockSubmit(...args) };
});
jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

const at = (ms: number) => ({ toMillis: () => ms });
const LISTING = {
  userId: 'owner',
  igdbGameId: 119133,
  platform: 'ps5',
  gameTitle: 'Elden Ring',
  coverImageId: 'co4jni',
  condition: 'like_new',
  hasCase: true,
  notes: 'Includes the map',
  isForTrade: true,
  isForSale: true,
  askingPriceAgorot: 15000,
  photoPaths: [],
  hasPhotos: false,
  status: 'active',
  location: { lat: 32.08, lng: 34.78, geohash: 'sv8wr', areaName: 'Tel Aviv-Yafo', cityId: '5000' },
  createdAt: at(Date.UTC(2026, 9, 20)),
  updatedAt: at(Date.UTC(2026, 9, 20)),
};
const PROFILE = {
  status: 'ready',
  profile: {
    username: 'gamer_dan',
    usernameLower: 'gamer_dan',
    ratingAvg: 4.75,
    ratingCount: 12,
    completedTrades: 9,
    createdAt: at(Date.UTC(2026, 2, 3)),
    updatedAt: at(Date.UTC(2026, 2, 3)),
  },
};

/** Feeds `useListing` a snapshot (or an error) through the Firestore mock. */
function listingDoc(data: Record<string, unknown> | null) {
  mockOnSnapshot.mockImplementation((_ref, onNext: (s: unknown) => void) => {
    onNext({ exists: () => data !== null, data: () => data });
    return () => undefined;
  });
}

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const renderScreen = (ui: ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ToastProvider>{ui}</ToastProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockWanted = new Set();
  mockConversation = 'none';
  mockAuthState = { status: 'signedOut' };
  mockProfile = PROFILE;
  mockPhotos = [];
  useBrowsingLocation.setState({ location: null });
  listingDoc(LISTING);
});

describe('useListing', () => {
  it('treats a listing it may not read (paused or closed by someone else) as gone', async () => {
    mockOnSnapshot.mockImplementation((_ref, _next, onError: (e: unknown) => void) => {
      onError({ code: 'firestore/permission-denied' });
      return () => undefined;
    });
    const { result } = await renderHook(() => useListing('l1'));
    expect(result.current).toEqual({ status: 'missing' });
  });

  it('reports other failures as errors', async () => {
    mockOnSnapshot.mockImplementation((_ref, _next, onError: (e: unknown) => void) => {
      onError({ code: 'firestore/unavailable' });
      return () => undefined;
    });
    const { result } = await renderHook(() => useListing('l1'));
    expect(result.current).toEqual({ status: 'error' });
  });
});

describe('ListingDetailScreen', () => {
  it('shows a guest everything the listing holds', async () => {
    useBrowsingLocation.setState({
      location: { source: 'city', lat: 32.79, lng: 34.99, cityId: '4000' },
    });
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    expect(screen.getByText('Elden Ring')).toBeTruthy();
    expect(screen.getByText('PS5')).toBeTruthy();
    expect(screen.getByTestId('listing-offer').props.children).toBe('Trade · ₪150');
    expect(screen.getByText('Like new')).toBeTruthy();
    expect(screen.getByText('Original case included')).toBeTruthy();
    expect(screen.getByText(/^Tel Aviv.* · ~\d+ km away$/)).toBeTruthy();
    expect(screen.getByTestId('listing-notes').props.children).toBe('Includes the map');
    expect(screen.getByTestId('listing-cover')).toBeTruthy();
  });

  it('shows the owner’s real trust signals', async () => {
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    expect(screen.getByText(/gamer_dan/)).toBeTruthy();
    expect(screen.getByText('★ 4.8 (12 ratings)')).toBeTruthy();
    expect(screen.getByText('Completed trades: 9 · Member since March 2026')).toBeTruthy();

    mockProfile = { ...PROFILE, profile: { ...PROFILE.profile, ratingCount: 0, ratingAvg: 0 } };
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    expect(screen.getByText('No ratings yet')).toBeTruthy();
  });

  it('shows the owner’s photos instead of the cover when there are some', async () => {
    mockPhotos = ['https://example.test/0.jpg', 'https://example.test/1.jpg'];
    listingDoc({
      ...LISTING,
      hasPhotos: true,
      photoPaths: ['listings/l1/0.jpg', 'listings/l1/1.jpg'],
    });
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    expect(screen.getByTestId('listing-gallery')).toBeTruthy();
    expect(screen.getByLabelText('Photo 2 of 2')).toBeTruthy();
    expect(screen.getByText('Real photos')).toBeTruthy();
  });

  it('adds the game, on this console, to the want list', async () => {
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    expect(screen.getByText('Add to my want list')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('listing-want'));
    expect(mockToggleWant).toHaveBeenCalledWith({
      igdbGameId: 119133,
      platform: 'ps5',
      gameTitle: 'Elden Ring',
    });
    mockWanted = new Set(['119133_ps5']);
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    expect(screen.getByText('On my want list ✓')).toBeTruthy();
  });

  it('offers Make an offer and Ask a question behind sign-in, then Open chat once a conversation exists', async () => {
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    await fireEvent.press(screen.getByTestId('listing-make-offer'));
    expect(mockRequireAuth).toHaveBeenCalledWith('offer', expect.any(Function));
    (mockRequireAuth.mock.calls[0] as [string, () => void])[1]();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/offer/[listingId]',
      params: { listingId: 'l1' },
    });
    await fireEvent.press(screen.getByTestId('listing-ask'));
    expect(mockRequireAuth).toHaveBeenLastCalledWith('question', expect.any(Function));

    mockConversation = 'l1_me';
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    expect(screen.queryByTestId('listing-make-offer')).toBeNull();
    await fireEvent.press(screen.getByTestId('listing-open-chat'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/conversations/[id]',
      params: { id: 'l1_me' },
    });
  });

  it('asks a guest to sign in before reporting, then opens the report', async () => {
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    await fireEvent.press(screen.getByTestId('listing-report'));
    expect(mockRequireAuth).toHaveBeenCalledWith('report', expect.any(Function));
    const [, action] = mockRequireAuth.mock.calls[0] as [string, () => void];
    action();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/listings/[id]/report',
      params: { id: 'l1' },
    });
  });

  it('lets the owner manage it instead of reporting it, in any status', async () => {
    mockAuthState = { status: 'signedIn', user: { uid: 'owner' } };
    listingDoc({ ...LISTING, status: 'paused' });
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    expect(screen.getByTestId('listing-own')).toBeTruthy();
    expect(screen.queryByTestId('listing-report')).toBeNull();
    expect(screen.queryByTestId('listing-want')).toBeNull();
    expect(screen.queryByTestId('listing-make-offer')).toBeNull();
    expect(screen.getByText('Paused')).toBeTruthy();
  });

  it('says a listing is gone when it is, or when someone else’s is no longer active', async () => {
    listingDoc(null);
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    expect(screen.getByTestId('listing-gone')).toBeTruthy();

    listingDoc({ ...LISTING, status: 'traded' });
    await renderScreen(<ListingDetailScreen listingId="l1" />);
    expect(screen.getByTestId('listing-gone')).toBeTruthy();
    await fireEvent.press(screen.getByText('Search for other copies'));
    expect(mockReplace).toHaveBeenCalledWith('/search');
  });
});

describe('ReportScreen', () => {
  it('sends a reason and trimmed details, then closes', async () => {
    mockSubmit.mockResolvedValue(undefined);
    const onDone = jest.fn();
    await renderScreen(<ReportScreen targetType="listing" targetId="l1" onDone={onDone} />);
    expect(screen.queryByTestId('report-reason-swap_didnt_happen')).toBeNull();
    await fireEvent.press(screen.getByTestId('report-reason-scam'));
    await fireEvent.changeText(screen.getByTestId('report-details'), '  Wanted payment first ');
    await fireEvent.press(screen.getByTestId('report-send'));
    expect(mockSubmit).toHaveBeenCalledWith({
      targetType: 'listing',
      targetId: 'l1',
      reason: 'scam',
      details: 'Wanted payment first',
    });
    expect(onDone).toHaveBeenCalled();
    expect(screen.getByText('Thanks. We’ll look into it.')).toBeTruthy();
  });

  it('needs a reason, and explains a refusal', async () => {
    const { ReportError } = jest.requireMock('@/features/safety/reportApi') as {
      ReportError: new (reason: string) => Error;
    };
    mockSubmit.mockRejectedValue(new ReportError('rateLimited'));
    const onDone = jest.fn();
    await renderScreen(<ReportScreen targetType="listing" targetId="l1" onDone={onDone} />);
    await fireEvent.press(screen.getByTestId('report-send'));
    expect(mockSubmit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('report-reason-spam'));
    await act(async () => {
      await fireEvent.press(screen.getByTestId('report-send'));
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText(/sent a lot of reports today/)).toBeTruthy();
  });
});
