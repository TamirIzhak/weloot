import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components';
import { BlockedUsersScreen } from '@/features/safety/BlockedUsersScreen';
import { ReportScreen } from '@/features/safety/ReportScreen';
import { useViewer } from '@/features/search/useViewer';

const mockSetBlocked = jest.fn();
let mockSettings: unknown = { status: 'loading' };

jest.mock('@/features/safety/blockApi', () => ({
  setBlocked: (...a: unknown[]) => mockSetBlocked(...a),
}));
jest.mock('@/features/safety/reportApi', () => ({ ReportError: Error, submitReport: jest.fn() }));
jest.mock('@/features/profile/settingsApi', () => ({ useUserSettings: () => mockSettings }));
jest.mock('@/features/profile/usePublicProfile', () => ({
  usePublicProfile: (uid: string) => ({ status: 'ready', profile: { username: `user_${uid}` } }),
}));
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', user: { uid: 'me' } }),
}));

const renderWith = (ui: ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ToastProvider>{ui}</ToastProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockSetBlocked.mockResolvedValue(undefined);
});

describe('blocking', () => {
  it('hides both people I blocked and people who blocked me from feeds', async () => {
    mockSettings = {
      status: 'ready',
      settings: { blockedUserIds: ['troll'], blockedByUserIds: ['grump'], searchRadiusKm: 25 },
    };
    const { result } = await renderHook(() => useViewer());
    expect(result.current.excludedUserIds).toEqual(['me', 'troll', 'grump']);
  });

  it('lists blocked users with Unblock', async () => {
    mockSettings = { status: 'ready', settings: { blockedUserIds: ['troll'] } };
    await renderWith(<BlockedUsersScreen uid="me" />);
    expect(screen.getByText('user_troll')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('unblock-troll'));
    expect(mockSetBlocked).toHaveBeenCalledWith('troll', false);
  });

  it('says when nobody is blocked', async () => {
    mockSettings = { status: 'ready', settings: { blockedUserIds: [] } };
    await renderWith(<BlockedUsersScreen uid="me" />);
    expect(screen.getByTestId('blocked-empty')).toBeTruthy();
  });
});

describe('report reasons per target', () => {
  it('offers the reasons that fit a person, a message or a deal', async () => {
    await renderWith(<ReportScreen targetType="user" targetId="u2" onDone={jest.fn()} />);
    expect(screen.getByTestId('report-reason-no_show')).toBeTruthy();
    expect(screen.queryByTestId('report-reason-swap_didnt_happen')).toBeNull();
    await renderWith(<ReportScreen targetType="deal" targetId="c1" onDone={jest.fn()} />);
    expect(screen.getByTestId('report-reason-swap_didnt_happen')).toBeTruthy();
    await renderWith(<ReportScreen targetType="message" targetId="c1~m1" onDone={jest.fn()} />);
    expect(screen.queryByTestId('report-reason-no_show')).toBeNull();
  });
});
