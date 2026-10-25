import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MAX_WANTLIST_ITEMS } from '@weloot/shared';

import { ToastProvider } from '@/components';
import { useWantToggle } from '@/features/wantlist/useWantToggle';
import { WantlistScreen } from '@/features/wantlist/WantlistScreen';

const mockSetDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockLogEvent = jest.fn();
const mockPush = jest.fn();
const mockRequireAuth = jest.fn();
let mockDocs: { id: string; data: Record<string, unknown> }[] = [];
let mockCurrentUid: string | undefined = 'me';
let mockAuthState: unknown = { status: 'signedIn', user: { uid: 'me' } };

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  doc: (parent: string, id: string) => `${parent}/${id}`,
  query: (ref: string) => ref,
  orderBy: () => null,
  serverTimestamp: () => 'SERVER_TIME',
  onSnapshot: (_q: unknown, onNext: (s: unknown) => void) => {
    onNext({
      docs: mockDocs.map((d) => ({ id: d.id, data: () => d.data })),
    });
    return () => undefined;
  },
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
}));
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({ currentUser: mockCurrentUid ? { uid: mockCurrentUid } : null }),
}));
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: () => ({}),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuthState }));
jest.mock('@/features/auth/authGate', () => ({
  useRequireAuth: () => (reason: string, action: () => void) => mockRequireAuth(reason, action),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const at = (ms: number) => ({ toMillis: () => ms });
const ELDEN = {
  id: '119133_ps5',
  data: { igdbGameId: 119133, platform: 'ps5', gameTitle: 'Elden Ring', createdAt: at(2) },
};
const ZELDA = {
  id: '119388_any',
  data: { igdbGameId: 119388, gameTitle: 'Zelda: Tears of the Kingdom', createdAt: at(1) },
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
  mockDocs = [ELDEN, ZELDA];
  mockCurrentUid = 'me';
  mockAuthState = { status: 'signedIn', user: { uid: 'me' } };
  // A signed-in user goes straight through the gate.
  mockRequireAuth.mockImplementation((_reason: string, action: () => void) => action());
  mockSetDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
});

describe('useWantToggle', () => {
  it('knows which games are wanted, per console or any', async () => {
    const { result } = await renderHook(() => useWantToggle(), { wrapper: Providers });
    expect(result.current.isWanted(119133, 'ps5')).toBe(true);
    expect(result.current.isWanted(119133, 'ps4')).toBe(false);
    expect(result.current.isWanted(119388)).toBe(true);
  });

  it('adds a game with the server time and logs it, behind the want list sign-in', async () => {
    const { result } = await renderHook(() => useWantToggle(), { wrapper: Providers });
    await act(async () => {
      result.current.toggle({ igdbGameId: 1942, platform: 'switch', gameTitle: 'The Witcher 3' });
    });
    expect(mockRequireAuth).toHaveBeenCalledWith('wantlist', expect.any(Function));
    expect(mockSetDoc).toHaveBeenCalledWith('wantlist/me/items/1942_switch', {
      igdbGameId: 1942,
      platform: 'switch',
      gameTitle: 'The Witcher 3',
      createdAt: 'SERVER_TIME',
    });
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'wantlist_added', {
      igdb_game_id: 1942,
      platform: 'switch',
    });
  });

  it('removes a wanted game', async () => {
    const { result } = await renderHook(() => useWantToggle(), { wrapper: Providers });
    await act(async () => {
      result.current.toggle({ igdbGameId: 119133, platform: 'ps5', gameTitle: 'Elden Ring' });
    });
    expect(mockDeleteDoc).toHaveBeenCalledWith('wantlist/me/items/119133_ps5');
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('adds for a guest once they have signed in (the pending action runs later)', async () => {
    mockAuthState = { status: 'signedOut' };
    mockCurrentUid = undefined;
    let pending: (() => void) | undefined;
    mockRequireAuth.mockImplementation((_reason: string, action: () => void) => {
      pending = action;
    });
    const { result } = await renderHook(() => useWantToggle(), { wrapper: Providers });
    result.current.toggle({ igdbGameId: 1942, gameTitle: 'The Witcher 3' });
    expect(mockSetDoc).not.toHaveBeenCalled();
    mockCurrentUid = 'new_user';
    await act(async () => {
      pending?.();
    });
    expect(mockSetDoc).toHaveBeenCalledWith('wantlist/new_user/items/1942_any', expect.anything());
  });

  it('refuses to grow past the limit', async () => {
    mockDocs = Array.from({ length: MAX_WANTLIST_ITEMS }, (_, i) => ({
      id: `${i + 1}_any`,
      data: { igdbGameId: i + 1, gameTitle: `Game ${i + 1}`, createdAt: at(i) },
    }));
    const { result } = await renderHook(() => useWantToggle(), { wrapper: Providers });
    await act(async () => {
      result.current.toggle({ igdbGameId: 99999, gameTitle: 'One more' });
    });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

describe('WantlistScreen', () => {
  it('lists the games with their console, and removes one', async () => {
    await renderScreen(<WantlistScreen uid="me" />);
    expect(screen.getByText('Elden Ring')).toBeTruthy();
    expect(screen.getByText('PS5')).toBeTruthy();
    expect(screen.getByText('Any console')).toBeTruthy();
    expect(screen.getByText(`2 of ${MAX_WANTLIST_ITEMS} games`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('want-remove-119133_ps5'));
    expect(mockDeleteDoc).toHaveBeenCalledWith('wantlist/me/items/119133_ps5');
  });

  it('shares the want list as text (#50)', async () => {
    const { shareWantlist } = jest.requireMock('@/features/share/share') as {
      shareWantlist: jest.Mock;
    };
    await renderScreen(<WantlistScreen uid="me" />);
    await fireEvent.press(screen.getByTestId('wantlist-share'));
    expect(shareWantlist).toHaveBeenCalledWith(
      'Looking for: Elden Ring (PS5), Zelda: Tears of the Kingdom. Got one? Let’s swap on WeLoot: https://weloot.test',
    );
  });

  it('points an empty list to search', async () => {
    mockDocs = [];
    await renderScreen(<WantlistScreen uid="me" />);
    await fireEvent.press(screen.getByText('Find games'));
    expect(mockPush).toHaveBeenCalledWith('/search');
  });
});
