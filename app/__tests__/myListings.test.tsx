import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components';
import { MyListingsScreen } from '@/features/listings/MyListingsScreen';

const mockPush = jest.fn();
const mockManage = jest.fn();
let mockState: Record<string, unknown> = { status: 'loading' };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
let mockConversations: unknown[] = [];
jest.mock('@/features/offers/offersApi', () => ({ useMyConversations: () => mockConversations }));
jest.mock('@/features/profile/usePublicProfile', () => ({
  usePublicProfile: (uid: string) => ({ status: 'ready', profile: { username: `user_${uid}` } }),
}));
jest.mock('@/features/listings/myListings', () => ({
  useMyListings: () => mockState,
  manageListing: (...args: unknown[]) => mockManage(...args),
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const wrap = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_AREA}>
    <ToastProvider>{ui}</ToastProvider>
  </SafeAreaProvider>
);

const listing = (overrides: Record<string, unknown> = {}) => ({
  id: 'l1',
  userId: 'u1',
  igdbGameId: 119133,
  platform: 'ps5',
  gameTitle: 'Elden Ring',
  condition: 'good',
  hasCase: true,
  notes: '',
  isForTrade: true,
  isForSale: true,
  askingPriceAgorot: 15000,
  photoPaths: [],
  hasPhotos: false,
  status: 'active',
  ...overrides,
});

beforeEach(() => {
  mockConversations = [];
  jest.clearAllMocks();
  mockManage.mockResolvedValue('paused');
  mockState = { status: 'ready', listings: [listing()] };
});

async function open() {
  await render(wrap(<MyListingsScreen uid="u1" />));
  await fireEvent.press(screen.getByText('Elden Ring'));
}

describe('MyListingsScreen', () => {
  it('invites to list a game when there are none', async () => {
    mockState = { status: 'ready', listings: [] };
    await render(wrap(<MyListingsScreen uid="u1" />));
    await fireEvent.press(screen.getByText('List a game'));
    expect(mockPush).toHaveBeenCalledWith('/add');
  });

  it('shows status, availability and the actions an active listing allows', async () => {
    await open();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText(/Trade · ₪150/)).toBeTruthy();
    for (const id of [
      'action-photos',
      'action-pause',
      'action-swapped',
      'action-sold',
      'action-remove',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.queryByTestId('action-resume')).toBeNull();
  });

  it('pauses and resumes', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('action-pause'));
    expect(mockManage).toHaveBeenCalledWith({ listingId: 'l1', action: 'pause' });
    mockState = { status: 'ready', listings: [listing({ status: 'paused' })] };
    await open();
    await fireEvent.press(screen.getByTestId('action-resume'));
    expect(mockManage).toHaveBeenCalledWith({ listingId: 'l1', action: 'resume' });
  });

  it('closes as Swapped after "Who with?"', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('action-swapped'));
    expect(screen.getByText('Who with?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-action'));
    expect(mockManage).toHaveBeenCalledWith({
      listingId: 'l1',
      action: 'closeTraded',
      closedWith: { kind: 'outside' },
    });
  });

  it('offers the deal counterpart and recent chats under "Who with?", and closes with them', async () => {
    const at = (ms: number) => ({ toMillis: () => ms });
    mockConversations = [
      {
        id: 'l1_chatter',
        listingId: 'l1',
        participants: ['u1', 'chatter'],
        updatedAt: at(Date.now()),
      },
      {
        id: 'l9_dealer',
        listingId: 'l9',
        participants: ['dealer', 'u1'],
        updatedAt: at(Date.now() - 60 * 24 * 3600 * 1000),
        deal: { status: 'agreed', itemsOwner: ['l9'], itemsOther: ['l1'] },
      },
      // Too old, and about something else.
      { id: 'l1_old', listingId: 'l1', participants: ['u1', 'old'], updatedAt: at(0) },
      { id: 'l7_x', listingId: 'l7', participants: ['u1', 'x'], updatedAt: at(Date.now()) },
    ];
    await open();
    await fireEvent.press(screen.getByTestId('action-swapped'));
    const choices = screen.getByTestId('who-with');
    expect(choices.children).toHaveLength(2);
    expect(screen.getByText('With user_dealer (your deal)')).toBeTruthy();
    expect(screen.getByText('With user_chatter')).toBeTruthy();
    expect(screen.queryByText('With user_old')).toBeNull();
    await fireEvent.press(screen.getByTestId('who-dealer'));
    expect(mockManage).toHaveBeenCalledWith({
      listingId: 'l1',
      action: 'closeTraded',
      closedWith: { kind: 'deal', userId: 'dealer', conversationId: 'l9_dealer' },
    });
  });

  it('asks before removing', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('action-remove'));
    expect(mockManage).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('confirm-action'));
    expect(mockManage).toHaveBeenCalledWith({ listingId: 'l1', action: 'remove' });
  });

  it('offers only what the listing was for, and nothing on closed listings', async () => {
    mockState = {
      status: 'ready',
      listings: [listing({ isForSale: false, askingPriceAgorot: undefined })],
    };
    await open();
    expect(screen.queryByTestId('action-sold')).toBeNull();
    mockState = { status: 'ready', listings: [listing({ status: 'traded' })] };
    await open();
    expect(screen.getByText('Swapped')).toBeTruthy();
    expect(screen.queryByTestId('listing-actions')).toBeNull();
  });

  it('opens photos', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('action-photos'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/listings/[id]/photos',
      params: { id: 'l1' },
    });
  });

  it('explains a failed change', async () => {
    mockManage.mockRejectedValueOnce(new Error('offline'));
    await open();
    await fireEvent.press(screen.getByTestId('action-pause'));
    expect(screen.getByText('Couldn’t update the listing. Try again.')).toBeTruthy();
  });
});
