import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { cityGeo, DEFAULT_SEARCH_RADIUS_KM, findCity } from '@weloot/shared';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import {
  createProfile,
  isUsernameAvailable,
  ProfileSetupError,
  subscribeToProfile,
  TOS_VERSION,
  type ProfileState,
} from '@/features/profile/profileApi';

type SnapshotListener = (snapshot: unknown) => void;
type ErrorListener = (error: Error) => void;

const mockListeners: { path: string; next: SnapshotListener; error: ErrorListener }[] = [];
const mockUnsubscribe = jest.fn();
const mockGetDocFromServer = jest.fn();
const mockBatchSet = jest.fn();
const mockCommit = jest.fn();
let mockAuthListener: ((user: unknown) => void) | null = null;

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  onSnapshot: (path: string, _options: unknown, next: SnapshotListener, error: ErrorListener) => {
    mockListeners.push({ path, next, error });
    return mockUnsubscribe;
  },
  getDocFromServer: (...args: unknown[]) => mockGetDocFromServer(...args),
  serverTimestamp: () => 'SERVER_TIME',
  writeBatch: () => ({ set: mockBatchSet, commit: mockCommit }),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: (_auth: unknown, listener: (user: unknown) => void) => {
    mockAuthListener = listener;
    return jest.fn();
  },
}));

const timestamp = { toMillis: () => 0 };
const PROFILE = {
  username: 'Gamer_1',
  usernameLower: 'gamer_1',
  cityId: 'haifa',
  geo: { lat: 32.794, lng: 34.99, geohash: 'svbsd' },
  ratingAvg: 0,
  ratingCount: 0,
  completedTrades: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function snapshot(data: unknown, fromCache = false) {
  return {
    exists: () => data !== undefined,
    metadata: { fromCache },
    data: jest.fn(() => data),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.length = 0;
  mockAuthListener = null;
  mockCommit.mockResolvedValue(undefined);
});

describe('subscribeToProfile', () => {
  function subscribe() {
    const states: ProfileState[] = [];
    subscribeToProfile('u1', (state) => states.push(state));
    const listener = mockListeners[0];
    if (!listener) throw new Error('not subscribed');
    return { states, listener };
  }

  it('listens to users/{uid}', () => {
    const { listener } = subscribe();
    expect(listener.path).toBe('users/u1');
  });

  it("doesn't trust a missing profile from the offline cache", () => {
    const { states, listener } = subscribe();
    listener.next(snapshot(undefined, true));
    expect(states).toEqual([{ status: 'loading' }]);
    listener.next(snapshot(undefined, false));
    expect(states.at(-1)).toEqual({ status: 'missing' });
  });

  it('parses an existing profile, estimating pending server timestamps', () => {
    const { states, listener } = subscribe();
    const snap = snapshot(PROFILE, true);
    listener.next(snap);
    expect(snap.data).toHaveBeenCalledWith({ serverTimestamps: 'estimate' });
    expect(states).toEqual([{ status: 'ready', profile: PROFILE }]);
  });

  it('reports malformed docs and listener errors as errors', () => {
    const { states, listener } = subscribe();
    listener.next(snapshot({ username: 'x' }));
    listener.error(new Error('[firestore/permission-denied]'));
    expect(states).toEqual([{ status: 'error' }, { status: 'error' }]);
  });
});

describe('isUsernameAvailable', () => {
  it('checks the lower-cased claim on the server', async () => {
    mockGetDocFromServer.mockResolvedValueOnce({ exists: () => false });
    await expect(isUsernameAvailable('Gamer_1')).resolves.toBe(true);
    expect(mockGetDocFromServer).toHaveBeenCalledWith('usernames/gamer_1');
    mockGetDocFromServer.mockResolvedValueOnce({ exists: () => true });
    await expect(isUsernameAvailable('GAMER_1')).resolves.toBe(false);
  });
});

describe('createProfile', () => {
  it('writes the username claim, public profile and private settings in one batch', async () => {
    await createProfile('u1', { username: 'Gamer_1', cityId: 'haifa' }, 'he');
    const haifa = findCity('haifa');
    if (!haifa) throw new Error('haifa missing');
    expect(mockBatchSet.mock.calls).toEqual([
      ['usernames/gamer_1', { uid: 'u1' }],
      [
        'users/u1',
        {
          username: 'Gamer_1',
          usernameLower: 'gamer_1',
          cityId: 'haifa',
          geo: cityGeo(haifa),
          ratingAvg: 0,
          ratingCount: 0,
          completedTrades: 0,
          createdAt: 'SERVER_TIME',
          updatedAt: 'SERVER_TIME',
        },
      ],
      [
        'users/u1/private/settings',
        {
          preferredLanguage: 'he',
          tosVersion: TOS_VERSION,
          tosAcceptedAt: 'SERVER_TIME',
          ageConfirmed: true,
          fcmTokens: [],
          blockedUserIds: [],
          searchRadiusKm: DEFAULT_SEARCH_RADIUS_KM,
          createdAt: 'SERVER_TIME',
          updatedAt: 'SERVER_TIME',
        },
      ],
    ]);
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  it('never writes the phone number', async () => {
    await createProfile('u1', { username: 'Gamer_1', cityId: 'haifa' }, 'en');
    expect(JSON.stringify(mockBatchSet.mock.calls)).not.toMatch(/phone|\+972/i);
  });

  it('rejects an unknown city before writing anything', async () => {
    await expect(
      createProfile('u1', { username: 'Gamer_1', cityId: 'atlantis' }, 'en'),
    ).rejects.toMatchObject({ reason: 'unknownCity' });
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('reports a name claimed by someone else in the meantime as taken', async () => {
    mockCommit.mockRejectedValueOnce(new Error('[firestore/permission-denied]'));
    mockGetDocFromServer.mockResolvedValueOnce({ exists: () => true });
    const error: unknown = await createProfile(
      'u1',
      { username: 'Gamer_1', cityId: 'haifa' },
      'en',
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProfileSetupError);
    expect(error).toMatchObject({ reason: 'usernameTaken' });
  });

  it('reports other failures (even when the re-check fails too) as failed', async () => {
    mockCommit.mockRejectedValue(new Error('[firestore/unavailable]'));
    mockGetDocFromServer.mockResolvedValueOnce({ exists: () => false });
    await expect(
      createProfile('u1', { username: 'Gamer_1', cityId: 'haifa' }, 'en'),
    ).rejects.toMatchObject({ reason: 'failed' });
    mockGetDocFromServer.mockRejectedValueOnce(new Error('offline'));
    await expect(
      createProfile('u1', { username: 'Gamer_1', cityId: 'haifa' }, 'en'),
    ).rejects.toMatchObject({ reason: 'failed' });
  });
});

describe('AuthProvider', () => {
  function Probe() {
    const auth = useAuth();
    const profile = auth.status === 'signedIn' ? auth.profile.status : '-';
    return <Text testID="probe">{`${auth.status}/${profile}`}</Text>;
  }
  const probe = () => screen.getByTestId('probe').props.children as string;

  it('is loading until Firebase reports, then signed out without a profile listener', async () => {
    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(probe()).toBe('loading/-');
    await act(async () => mockAuthListener?.(null));
    expect(probe()).toBe('signedOut/-');
    expect(mockListeners).toHaveLength(0);
  });

  it("follows the signed-in user's profile and stops listening on sign-out", async () => {
    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => mockAuthListener?.({ uid: 'u1' }));
    expect(probe()).toBe('signedIn/loading');
    await act(async () => mockListeners[0]?.next(snapshot(undefined)));
    expect(probe()).toBe('signedIn/missing');
    await act(async () => mockListeners[0]?.next(snapshot(PROFILE)));
    expect(probe()).toBe('signedIn/ready');

    await act(async () => mockAuthListener?.(null));
    expect(probe()).toBe('signedOut/-');
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("never shows one user's profile for the next user", async () => {
    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => mockAuthListener?.({ uid: 'u1' }));
    await act(async () => mockListeners[0]?.next(snapshot(PROFILE)));
    expect(probe()).toBe('signedIn/ready');
    await act(async () => mockAuthListener?.({ uid: 'u2' }));
    expect(probe()).toBe('signedIn/loading');
    expect(mockListeners[1]?.path).toBe('users/u2');
  });

  it('listens again on retry after an error', async () => {
    let retry: (() => void) | undefined;
    function RetryProbe() {
      const auth = useAuth();
      if (auth.status === 'signedIn') retry = auth.retryProfile;
      return <Probe />;
    }
    await render(
      <AuthProvider>
        <RetryProbe />
      </AuthProvider>,
    );
    await act(async () => mockAuthListener?.({ uid: 'u1' }));
    await act(async () => mockListeners[0]?.error(new Error('unavailable')));
    expect(probe()).toBe('signedIn/error');
    await act(async () => retry?.());
    expect(probe()).toBe('signedIn/loading');
    expect(mockListeners).toHaveLength(2);
  });
});
