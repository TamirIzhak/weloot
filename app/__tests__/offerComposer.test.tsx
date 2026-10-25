import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components';
import { useAddDraft } from '@/features/listings/addDraft';
import { OfferComposer } from '@/features/offers/OfferComposer';
import { QuestionComposer } from '@/features/offers/QuestionComposer';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockStart = jest.fn();
const mockSendOffer = jest.fn();
let mockListings: Record<string, unknown[]> = {};
let mockConversation: unknown = null;
let mockCounter: unknown = null;
let mockFocus: (() => void) | undefined;

const at = (ms: number) => ({ toMillis: () => ms });
const listing = (id: string, userId: string, overrides: Record<string, unknown> = {}) => ({
  id,
  userId,
  igdbGameId: 1,
  platform: 'ps5',
  gameTitle: `Game ${id}`,
  condition: 'good',
  hasCase: true,
  notes: '',
  isForTrade: true,
  isForSale: false,
  photoPaths: [],
  hasPhotos: false,
  status: 'active',
  location: { lat: 32, lng: 34.8, geohash: 'sv8', areaName: 'Holon' },
  createdAt: at(1),
  updatedAt: at(1),
  ...overrides,
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useFocusEffect: (cb: () => void) => {
    mockFocus = cb;
  },
}));
jest.mock('@/features/listings/useListing', () => ({
  useListing: (id: string) => ({
    status: 'ready',
    listing: id === 'theirs1' ? listing('theirs1', 'owner') : listing(id, 'me'),
  }),
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
    startConversation: (...args: unknown[]) => mockStart(...args),
    sendOffer: (...args: unknown[]) => mockSendOffer(...args),
    useActiveListingsOf: (uid?: string) => (uid ? (mockListings[uid] ?? []) : []),
    useConversation: (id?: string) => (id ? mockConversation : null),
    useOffer: (c?: string, o?: string) => (c && o ? mockCounter : null),
  };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const renderComposer = (ui: ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ToastProvider>{ui}</ToastProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockListings = {
    me: [listing('mine1', 'me'), listing('mine2', 'me')],
    owner: [listing('theirs1', 'owner'), listing('theirs2', 'owner', { isForSale: true })],
  };
  mockConversation = null;
  mockCounter = null;
  mockStart.mockResolvedValue({ conversationId: 'theirs1_me', created: true });
  mockSendOffer.mockResolvedValue({ offerId: 'o2' });
  useAddDraft.setState({ quickResult: null, quick: false });
});

describe('OfferComposer', () => {
  it('starts with the game page listing on their side, and sends a game-for-game offer', async () => {
    await renderComposer(<OfferComposer me="me" listingId="theirs1" />);
    expect(screen.getByTestId('get-theirs1').props.accessibilityState).toMatchObject({
      checked: true,
    });
    await fireEvent.press(screen.getByTestId('give-mine1'));
    await fireEvent.changeText(screen.getByTestId('offer-note'), '  Mint disc ');
    await fireEvent.press(screen.getByTestId('offer-send'));
    expect(mockStart).toHaveBeenCalledWith({
      listingId: 'theirs1',
      opener: 'offer',
      offer: { itemsFrom: ['mine1'], itemsTo: ['theirs1'], cashAgorot: 0, note: 'Mint disc' },
    });
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/conversations/[id]',
      params: { id: 'theirs1_me' },
    });
  });

  it('adds a cash top-up either way, in whole shekels up to ₪2,000', async () => {
    await renderComposer(<OfferComposer me="me" listingId="theirs1" />);
    await fireEvent.press(screen.getByTestId('give-mine1'));
    await fireEvent.press(screen.getByTestId('cash-them'));
    await fireEvent.changeText(screen.getByTestId('cash-amount'), '2500');
    expect(screen.getByText('Whole shekels, from ₪1 to ₪2,000.')).toBeTruthy();
    expect(screen.getByTestId('offer-send').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.changeText(screen.getByTestId('cash-amount'), '50');
    await fireEvent.press(screen.getByTestId('offer-send'));
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({
        offer: {
          itemsFrom: ['mine1'],
          itemsTo: ['theirs1'],
          cashAgorot: 5000,
          cashPayerId: 'owner',
        },
      }),
    );
  });

  it('allows cash alone only for games that are for sale', async () => {
    await renderComposer(<OfferComposer me="me" listingId="theirs1" />);
    await fireEvent.press(screen.getByTestId('cash-me'));
    await fireEvent.changeText(screen.getByTestId('cash-amount'), '100');
    expect(screen.getByTestId('offer-not-for-sale')).toBeTruthy();
    // Swap to the game that is for sale.
    await fireEvent.press(screen.getByTestId('get-theirs1'));
    await fireEvent.press(screen.getByTestId('get-theirs2'));
    expect(screen.queryByTestId('offer-not-for-sale')).toBeNull();
    await fireEvent.press(screen.getByTestId('offer-send'));
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({
        offer: { itemsFrom: [], itemsTo: ['theirs2'], cashAgorot: 10000, cashPayerId: 'me' },
      }),
    );
  });

  it('opens a counter-offer prefilled with the sides swapped, and sends it in the conversation', async () => {
    mockConversation = { id: 'theirs1_me', participants: ['owner', 'me'] };
    mockCounter = {
      id: 'o1',
      fromUid: 'owner',
      toUid: 'me',
      itemsFrom: ['theirs1'],
      itemsTo: ['mine2'],
      cashAgorot: 3000,
      cashPayerId: 'me',
    };
    await renderComposer(
      <OfferComposer me="me" listingId="theirs1" conversationId="theirs1_me" counterOfferId="o1" />,
    );
    expect(screen.getByTestId('give-mine2').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByTestId('get-theirs1').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByTestId('cash-amount').props.value).toBe('30');
    await fireEvent.changeText(screen.getByTestId('cash-amount'), '20');
    await fireEvent.press(screen.getByTestId('offer-send'));
    expect(mockSendOffer).toHaveBeenCalledWith(
      'theirs1_me',
      { itemsFrom: ['mine2'], itemsTo: ['theirs1'], cashAgorot: 2000, cashPayerId: 'me' },
      true,
    );
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('Quick Add lists a game and puts it straight into the offer', async () => {
    await renderComposer(<OfferComposer me="me" listingId="theirs1" />);
    await fireEvent.press(screen.getByTestId('give-quick-add'));
    expect(useAddDraft.getState().quick).toBe(true);
    expect(mockPush).toHaveBeenCalledWith('/add/quick');
    // Back from the add flow with a new listing.
    await fireEvent.press(screen.getByTestId('give-mine1'));
    mockListings.me = [listing('fresh', 'me'), ...(mockListings.me ?? [])];
    useAddDraft.getState().finishQuick('fresh');
    await act(async () => mockFocus?.());
    await fireEvent.press(screen.getByTestId('offer-send'));
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({
        offer: expect.objectContaining({ itemsFrom: ['mine1', 'fresh'] }),
      }),
    );
  });

  it('starts with the owner’s own listing on their side when the owner makes the offer', async () => {
    mockConversation = { id: 'mine1_buyer', participants: ['me', 'buyer'] };
    mockListings.buyer = [listing('b1', 'buyer')];
    await renderComposer(<OfferComposer me="me" listingId="mine1" conversationId="mine1_buyer" />);
    expect(screen.getByTestId('give-mine1').props.accessibilityState).toMatchObject({
      checked: true,
    });
    await fireEvent.press(screen.getByTestId('get-b1'));
    await fireEvent.press(screen.getByTestId('offer-send'));
    expect(mockSendOffer).toHaveBeenCalledWith(
      'mine1_buyer',
      { itemsFrom: ['mine1'], itemsTo: ['b1'], cashAgorot: 0 },
      false,
    );
  });

  it('says why a send failed', async () => {
    const { OfferError } = jest.requireMock('@/features/offers/offersApi') as {
      OfferError: new (reason: string) => Error;
    };
    mockStart.mockRejectedValue(new OfferError('listingUnavailable'));
    await renderComposer(<OfferComposer me="me" listingId="theirs1" />);
    await fireEvent.press(screen.getByTestId('give-mine1'));
    await fireEvent.press(screen.getByTestId('offer-send'));
    expect(screen.getByText('One of these games isn’t available anymore.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('QuestionComposer', () => {
  it('opens the conversation with the question and goes to the chat', async () => {
    mockStart.mockResolvedValue({ conversationId: 'l1_me', created: true });
    await renderComposer(<QuestionComposer listingId="l1" />);
    expect(screen.getByTestId('question-send').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.changeText(screen.getByTestId('question-text'), ' Is the disc scratched? ');
    await fireEvent.press(screen.getByTestId('question-send'));
    expect(mockStart).toHaveBeenCalledWith({
      listingId: 'l1',
      opener: 'question',
      text: 'Is the disc scratched?',
    });
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/conversations/[id]',
      params: { id: 'l1_me' },
    });
  });
});
