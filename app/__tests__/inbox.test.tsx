import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { groupConversations, groupOf, totalUnread } from '@/features/inbox/groups';
import { InboxScreen } from '@/features/inbox/InboxScreen';
import type { Conversation } from '@/features/offers/offersApi';
import { TabBarVisibilityProvider } from '@/navigation/TabBarVisibility';

const mockPush = jest.fn();
let mockConversations: Conversation[] | null = [];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/features/offers/offersApi', () => ({ useMyConversations: () => mockConversations }));
jest.mock('@/features/profile/usePublicProfile', () => ({
  usePublicProfile: (uid: string) => ({ status: 'ready', profile: { username: `user_${uid}` } }),
}));

const at = (ms: number) => ({ toMillis: () => ms });
const deal = (status: string, confirmedBy: string[] = []) => ({
  status,
  itemsOwner: ['l1'],
  itemsOther: [],
  cashAgorot: 0,
  confirmedBy,
  fulfillmentMethod: 'in_person' as const,
  agreedAt: at(1),
});
function conversation(id: string, overrides: Partial<Conversation> = {}): Conversation {
  return {
    id,
    listingId: 'l1',
    ownerId: 'me',
    otherId: id,
    participants: ['me', id],
    openedWith: 'question',
    unread: { me: 0 },
    listingTitle: `Game with ${id}`,
    createdAt: at(1),
    updatedAt: at(1),
    ...overrides,
  } as Conversation;
}

const ALL = [
  conversation('offerer', { pendingOfferTo: 'me', unread: { me: 2 } }),
  conversation('waiting', { pendingOfferTo: 'waiting' }),
  conversation('asker', { deal: deal('awaiting_confirmation', ['asker']) as never }),
  conversation('dealer', { deal: deal('agreed') as never, lastMessagePreview: 'See you at 6' }),
  conversation('confirmed', { deal: deal('awaiting_confirmation', ['me']) as never }),
  conversation('done', { deal: deal('completed', ['me', 'done']) as never, unread: { me: 1 } }),
  conversation('cancelled', { deal: deal('cancelled') as never }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockConversations = ALL;
});

describe('inbox groups', () => {
  it('puts offers to answer and swaps to confirm first, then deals, chats and finished ones', () => {
    expect(Object.fromEntries(ALL.map((c) => [c.id, groupOf(c, 'me')]))).toEqual({
      offerer: 'needsAction',
      waiting: 'chats',
      asker: 'needsAction',
      dealer: 'activeDeals',
      confirmed: 'activeDeals',
      done: 'completed',
      cancelled: 'chats',
    });
    expect(groupConversations(ALL, 'me').map((g) => g.group)).toEqual([
      'needsAction',
      'activeDeals',
      'chats',
      'completed',
    ]);
    expect(groupConversations([ALL[1] as Conversation], 'me').map((g) => g.group)).toEqual([
      'chats',
    ]);
  });

  it('adds up my unread messages', () => {
    expect(totalUnread(ALL, 'me')).toBe(3);
  });
});

describe('InboxScreen', () => {
  const renderInbox = () =>
    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <TabBarVisibilityProvider>
          <InboxScreen me="me" />
        </TabBarVisibilityProvider>
      </SafeAreaProvider>,
    );

  it('shows the groups with names, games, what needs doing and unread counts', async () => {
    await renderInbox();
    expect(screen.getByText('Needs action')).toBeTruthy();
    expect(screen.getByText('Active deals')).toBeTruthy();
    expect(screen.getByText('user_offerer')).toBeTruthy();
    expect(screen.getByText('Game with offerer')).toBeTruthy();
    expect(screen.getByText('An offer is waiting for your answer')).toBeTruthy();
    expect(screen.getByText('Confirm the swap')).toBeTruthy();
    expect(screen.getByText('See you at 6')).toBeTruthy();
    expect(screen.getByTestId('inbox-unread-offerer')).toBeTruthy();
    expect(screen.queryByTestId('inbox-unread-dealer')).toBeNull();
    await fireEvent.press(screen.getByTestId('inbox-row-dealer'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/conversations/[id]',
      params: { id: 'dealer' },
    });
  });

  it('invites to find games when there are no conversations', async () => {
    mockConversations = [];
    await renderInbox();
    await fireEvent.press(screen.getByText('Find games'));
    expect(mockPush).toHaveBeenCalledWith('/search');
  });
});
