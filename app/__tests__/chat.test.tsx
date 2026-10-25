import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components';
import { ConversationScreen } from '@/features/chat/ConversationScreen';

const mockPush = jest.fn();
const mockSendMessage = jest.fn();
const mockMarkRead = jest.fn();
const mockRespond = jest.fn();
const mockDealAction = jest.fn();
const mockRate = jest.fn();
let mockRated: boolean | 'loading' = false;
let mockConversation: unknown = 'loading';
let mockMessages: unknown[] | null = [];
let mockOffers = new Map<string, unknown>();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
const mockSetBlocked = jest.fn();
let mockBlocked: string[] = [];
jest.mock('@/features/safety/blockApi', () => ({
  setBlocked: (...args: unknown[]) => mockSetBlocked(...args),
}));
jest.mock('@/features/profile/settingsApi', () => ({
  useUserSettings: () => ({ status: 'ready', settings: { blockedUserIds: mockBlocked } }),
}));
jest.mock('@/features/profile/usePublicProfile', () => ({
  usePublicProfile: () => ({ status: 'ready', profile: { username: 'dana_games' } }),
}));
jest.mock('@/features/chat/chatApi', () => ({
  useMessages: () => mockMessages,
  useOffers: () => mockOffers,
}));
jest.mock('@/features/offers/offersApi', () => {
  class OfferError extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.reason = reason;
    }
  }
  return {
    OfferError,
    useConversation: () => mockConversation,
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    markConversationRead: (...args: unknown[]) => mockMarkRead(...args),
    respondToOffer: (...args: unknown[]) => mockRespond(...args),
    dealAction: (...args: unknown[]) => mockDealAction(...args),
    rateUser: (...args: unknown[]) => mockRate(...args),
    useMyRating: () => mockRated,
  };
});

const at = (ms: number) => ({ toMillis: () => ms });
const CONVERSATION = {
  id: 'l1_me',
  listingId: 'l1',
  ownerId: 'dana',
  otherId: 'me',
  participants: ['dana', 'me'],
  openedWith: 'offer',
  unread: { me: 2, dana: 0 },
  currentOfferId: 'o2',
  createdAt: at(1),
  updatedAt: at(1),
};
const item = (title: string, ownerId: string) => ({
  ownerId,
  igdbGameId: 1,
  gameTitle: title,
  platform: 'ps5',
});
const offer = (id: string, fromUid: string, overrides: Record<string, unknown> = {}) => ({
  id,
  fromUid,
  toUid: fromUid === 'me' ? 'dana' : 'me',
  itemsFrom: fromUid === 'me' ? ['mine'] : ['l1'],
  itemsTo: fromUid === 'me' ? ['l1'] : ['mine'],
  listingIds: ['mine', 'l1'],
  items: { mine: item('My Game', 'me'), l1: item('Elden Ring', 'dana') },
  cashAgorot: 5000,
  cashPayerId: 'me',
  status: 'pending',
  expiresAt: at(9e12),
  createdAt: at(1),
  updatedAt: at(1),
  ...overrides,
});
// Newest first, as the inverted list wants them.
const MESSAGES = [
  { id: 'm4', senderId: 'dana', type: 'offer', offerId: 'o2', createdAt: at(4) },
  { id: 'm3', senderId: 'system', type: 'system', event: 'offer_declined', createdAt: at(3) },
  { id: 'm2', senderId: 'me', type: 'offer', offerId: 'o1', createdAt: at(2) },
  { id: 'm1', senderId: 'dana', type: 'text', text: 'Hi! Still interested?', createdAt: at(1) },
];

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const renderChat = (ui: ReactElement = <ConversationScreen conversationId="l1_me" me="me" />) =>
  render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ToastProvider>{ui}</ToastProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockBlocked = [];
  mockSetBlocked.mockResolvedValue(undefined);
  mockConversation = CONVERSATION;
  mockMessages = MESSAGES;
  mockOffers = new Map<string, unknown>([
    ['o1', offer('o1', 'me', { status: 'declined' })],
    ['o2', offer('o2', 'dana', { cashAgorot: 0, cashPayerId: undefined })],
  ]);
  mockSendMessage.mockResolvedValue({ ok: true });
  mockMarkRead.mockResolvedValue({ ok: true });
  mockRespond.mockResolvedValue({ status: 'accepted' });
});

describe('ConversationScreen', () => {
  it('shows texts, offer cards and system messages in the reader’s language, and clears unread', async () => {
    await renderChat();
    expect(screen.getByText('Hi! Still interested?')).toBeTruthy();
    expect(screen.getByText('Your offer')).toBeTruthy();
    expect(screen.getByText('Offer from dana_games')).toBeTruthy();
    expect(screen.getByText('The offer was declined.')).toBeTruthy();
    expect(screen.getByText(/paid by you/)).toBeTruthy();
    expect(mockMarkRead).toHaveBeenCalledWith({ conversationId: 'l1_me' });
  });

  it('lets the recipient of the latest pending offer accept, counter or decline it', async () => {
    await renderChat();
    // My old, declined offer has no actions; their pending one does.
    expect(screen.queryByTestId('offer-withdraw-o1')).toBeNull();
    await fireEvent.press(screen.getByTestId('offer-accept-o2'));
    expect(mockRespond).toHaveBeenCalledWith({
      conversationId: 'l1_me',
      offerId: 'o2',
      action: 'accept',
    });
    await fireEvent.press(screen.getByTestId('offer-counter-o2'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/offer/[listingId]',
      params: { listingId: 'l1', conversationId: 'l1_me', counter: 'o2' },
    });
    await fireEvent.press(screen.getByTestId('offer-decline-o2'));
    expect(mockRespond).toHaveBeenLastCalledWith({
      conversationId: 'l1_me',
      offerId: 'o2',
      action: 'decline',
    });
  });

  it('lets the sender withdraw their pending offer', async () => {
    mockConversation = { ...CONVERSATION, currentOfferId: 'o1' };
    mockOffers.set('o1', offer('o1', 'me'));
    await renderChat();
    expect(screen.queryByTestId('offer-accept-o1')).toBeNull();
    await fireEvent.press(screen.getByTestId('offer-withdraw-o1'));
    expect(mockRespond).toHaveBeenCalledWith({
      conversationId: 'l1_me',
      offerId: 'o1',
      action: 'withdraw',
    });
  });

  it('explains why an answer failed', async () => {
    const { OfferError } = jest.requireMock('@/features/offers/offersApi') as {
      OfferError: new (reason: string) => Error;
    };
    mockRespond.mockRejectedValue(new OfferError('offerExpired'));
    await renderChat();
    await fireEvent.press(screen.getByTestId('offer-accept-o2'));
    expect(screen.getByText('This offer expired. Send a new one instead.')).toBeTruthy();
  });

  it('sends a message and opens the offer composer', async () => {
    await renderChat();
    expect(screen.getByTestId('chat-send').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.changeText(screen.getByTestId('chat-input'), '  See you at 6  ');
    await fireEvent.press(screen.getByTestId('chat-send'));
    expect(mockSendMessage).toHaveBeenCalledWith({ conversationId: 'l1_me', text: 'See you at 6' });
    expect(screen.getByTestId('chat-input').props.value).toBe('');
    await fireEvent.press(screen.getByTestId('chat-offer'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/offer/[listingId]',
      params: { listingId: 'l1', conversationId: 'l1_me' },
    });
  });

  it('shows the deal header and the safety tips once a deal is agreed, and no new offers', async () => {
    mockConversation = {
      ...CONVERSATION,
      unread: { me: 0 },
      deal: {
        status: 'agreed',
        offerId: 'o2',
        itemsOwner: ['l1'],
        itemsOther: ['mine'],
        cashAgorot: 0,
        confirmedBy: [],
        fulfillmentMethod: 'in_person',
        agreedAt: at(5),
      },
    };
    mockOffers.set(
      'o2',
      offer('o2', 'dana', { status: 'accepted', cashAgorot: 0, cashPayerId: undefined }),
    );
    mockMessages = [
      { id: 'm6', senderId: 'system', type: 'safety_tips', createdAt: at(6) },
      ...MESSAGES,
    ];
    await renderChat();
    expect(screen.getByText('Deal agreed: meet and swap')).toBeTruthy();
    expect(screen.getByText('You give: My Game · You get: Elden Ring')).toBeTruthy();
    expect(screen.getByTestId('safety-tips')).toBeTruthy();
    expect(screen.getByTestId('chat-offer').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.queryByTestId('offer-accept-o2')).toBeNull();
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  describe('deal actions (#47)', () => {
    const withDeal = (deal: Record<string, unknown>) => {
      mockConversation = {
        ...CONVERSATION,
        unread: { me: 0 },
        deal: {
          status: 'agreed',
          offerId: 'o2',
          itemsOwner: ['l1'],
          itemsOther: ['mine'],
          cashAgorot: 0,
          confirmedBy: [],
          fulfillmentMethod: 'in_person',
          agreedAt: at(5),
          ...deal,
        },
      };
      mockOffers.set(
        'o2',
        offer('o2', 'dana', { status: 'accepted', cashAgorot: 0, cashPayerId: undefined }),
      );
    };
    beforeEach(() => mockDealAction.mockResolvedValue({ status: 'awaiting_confirmation' }));

    it('agreed: Swapped confirms; Cancel asks for a reason first', async () => {
      withDeal({});
      await renderChat();
      await fireEvent.press(screen.getByTestId('deal-swapped'));
      expect(mockDealAction).toHaveBeenCalledWith({ conversationId: 'l1_me', action: 'confirm' });
      await fireEvent.press(screen.getByTestId('deal-cancel'));
      expect(screen.getByTestId('deal-cancel-confirm').props.accessibilityState).toMatchObject({
        disabled: true,
      });
      await fireEvent.changeText(screen.getByTestId('deal-cancel-reason'), ' Found another copy ');
      await fireEvent.press(screen.getByTestId('deal-cancel-confirm'));
      expect(mockDealAction).toHaveBeenLastCalledWith({
        conversationId: 'l1_me',
        action: 'cancel',
        reason: 'Found another copy',
      });
    });

    it('awaiting my confirmation: "Did you swap…?" Yes / No', async () => {
      withDeal({ status: 'awaiting_confirmation', confirmedBy: ['dana'] });
      await renderChat();
      expect(screen.getByText('Did you swap My Game, Elden Ring with dana_games?')).toBeTruthy();
      expect(screen.queryByTestId('deal-swapped')).toBeNull();
      await fireEvent.press(screen.getByTestId('deal-no'));
      expect(mockDealAction).toHaveBeenCalledWith({ conversationId: 'l1_me', action: 'dispute' });
      await fireEvent.press(screen.getByTestId('deal-yes'));
      expect(mockDealAction).toHaveBeenLastCalledWith({
        conversationId: 'l1_me',
        action: 'confirm',
      });
    });

    it('completed: asks to rate the other trader once (#36)', async () => {
      mockRated = false;
      mockRate.mockResolvedValue({ ratingId: 'l1_me_me' });
      withDeal({ status: 'completed', confirmedBy: ['dana', 'me'] });
      await renderChat();
      expect(screen.getByText('How was the swap with dana_games?')).toBeTruthy();
      expect(screen.getByTestId('rate-send').props.accessibilityState).toMatchObject({
        disabled: true,
      });
      await fireEvent.press(screen.getByTestId('rate-star-4'));
      await fireEvent.changeText(screen.getByTestId('rate-comment'), ' On time ');
      await fireEvent.press(screen.getByTestId('rate-send'));
      expect(mockRate).toHaveBeenCalledWith({
        conversationId: 'l1_me',
        stars: 4,
        comment: 'On time',
      });

      mockRated = true;
      await renderChat();
      expect(screen.queryByTestId('rate-card')).toBeNull();
      expect(screen.getByTestId('rate-done')).toBeTruthy();
    });

    it('after my confirmation: waits for the other side, no buttons', async () => {
      withDeal({ status: 'awaiting_confirmation', confirmedBy: ['me'] });
      await renderChat();
      expect(screen.getByTestId('deal-waiting')).toBeTruthy();
      expect(screen.queryByTestId('deal-yes')).toBeNull();
    });
  });

  describe('report and block (#37)', () => {
    const { Alert } = jest.requireActual('react-native') as typeof import('react-native');
    let alertSpy: jest.SpyInstance;
    beforeEach(() => {
      alertSpy = jest.spyOn(Alert, 'alert');
    });
    afterEach(() => alertSpy.mockRestore());
    const pressAlertButton = (call: number, text: string) => {
      const buttons = alertSpy.mock.calls[call]?.[2] as { text: string; onPress?: () => void }[];
      buttons.find((b) => b.text === text)?.onPress?.();
    };

    it('reports or blocks the other person from the chat menu (block asks first)', async () => {
      await renderChat();
      await fireEvent.press(screen.getByTestId('chat-menu'));
      pressAlertButton(0, 'Report this person');
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/report',
        params: { targetType: 'user', targetId: 'dana' },
      });
      await fireEvent.press(screen.getByTestId('chat-menu'));
      pressAlertButton(1, 'Block');
      expect(mockSetBlocked).not.toHaveBeenCalled();
      expect(alertSpy.mock.calls[2]?.[0]).toBe('Block dana_games?');
      pressAlertButton(2, 'Block');
      expect(mockSetBlocked).toHaveBeenCalledWith('dana', true);
    });

    it('reports someone else’s message with a long press', async () => {
      await renderChat();
      await fireEvent(screen.getByTestId('message-m1'), 'longPress');
      pressAlertButton(0, 'Report message');
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/report',
        params: { targetType: 'message', targetId: 'l1_me~m1' },
      });
    });

    it('after blocking: no message bar, and Unblock', async () => {
      mockBlocked = ['dana'];
      await renderChat();
      expect(screen.queryByTestId('chat-input')).toBeNull();
      expect(screen.getByTestId('chat-blocked')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('chat-unblock'));
      expect(mockSetBlocked).toHaveBeenCalledWith('dana', false);
    });
  });

  it('says to slow down when messages hit the rate limit (#38)', async () => {
    const { OfferError } = jest.requireMock('@/features/offers/offersApi') as {
      OfferError: new (reason: string) => Error;
    };
    mockSendMessage.mockRejectedValue(new OfferError('rateLimited'));
    await renderChat();
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'hi');
    await fireEvent.press(screen.getByTestId('chat-send'));
    expect(screen.getByText(/Take a short break/)).toBeTruthy();
  });

  it('says when a chat isn’t available', async () => {
    mockConversation = null;
    await renderChat();
    expect(screen.getByTestId('chat-not-found')).toBeTruthy();
  });
});
