import { fireEvent, render, screen } from '@testing-library/react-native';

import { useAddDraft } from '@/features/listings/addDraft';
import { ListingForm } from '@/features/listings/ListingForm';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockPublish = jest.fn();
let mockSaved: Record<string, unknown> = { status: 'ready', items: [] };

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));
jest.mock('@/features/listings/listingsApi', () => ({
  newListingId: () => 'req0000000000000001',
  publishListing: (...args: unknown[]) => mockPublish(...args),
  publishErrorReason: (e: { details?: { reason?: string } }) => e.details?.reason,
}));
jest.mock('@/features/location/savedLocations', () => ({ useSavedLocations: () => mockSaved }));

const HOME = {
  id: 'home',
  label: 'Home',
  address: 'Dizengoff 50, Tel Aviv',
  lat: 32.0754,
  lng: 34.7752,
  cityId: '5000',
  areaName: 'Tel Aviv - Yafo',
};
const WORK = { ...HOME, id: 'work', label: 'Work' };

const publishButton = () => screen.getByTestId('publish');
const disabled = () => publishButton().props.accessibilityState?.disabled === true;

beforeEach(() => {
  jest.clearAllMocks();
  mockSaved = { status: 'ready', items: [HOME, WORK] };
  mockPublish.mockResolvedValue('req0000000000000001');
  useAddDraft.getState().setIdentified(
    {
      igdbGameId: 119133,
      title: 'Elden Ring',
      coverImageId: 'co4jni',
      platforms: ['ps4', 'ps5'],
    },
    'ps5',
    null,
  );
});

describe('ListingForm', () => {
  it('pre-selects the first saved address and needs a condition', async () => {
    await render(<ListingForm uid="u1" />);
    expect(screen.getByText('Elden Ring')).toBeTruthy();
    expect(screen.getByTestId('saved-location-home').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(disabled()).toBe(true);
    await fireEvent.press(screen.getByTestId('condition-like_new'));
    expect(disabled()).toBe(false);
  });

  it('publishes a trade listing from the chosen address and goes to the success screen', async () => {
    await render(<ListingForm uid="u1" />);
    await fireEvent.press(screen.getByTestId('saved-location-work'));
    await fireEvent.press(screen.getByTestId('condition-good'));
    await fireEvent(screen.getByTestId('has-case'), 'valueChange', false);
    await fireEvent.changeText(screen.getByTestId('notes-input'), '  light scratches  ');
    await fireEvent.press(publishButton());
    expect(mockPublish).toHaveBeenCalledWith({
      requestId: 'req0000000000000001',
      locationId: 'work',
      listing: {
        igdbGameId: 119133,
        platform: 'ps5',
        condition: 'good',
        hasCase: false,
        notes: 'light scratches',
        isForTrade: true,
        isForSale: false,
      },
    });
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/add/done',
      params: { listingId: 'req0000000000000001' },
    });
    expect(useAddDraft.getState().game).toBeNull();
  });

  it('needs a whole-shekel price between ₪10 and ₪1,000 for sale, sent in agorot', async () => {
    await render(<ListingForm uid="u1" />);
    await fireEvent.press(screen.getByTestId('condition-like_new'));
    await fireEvent.press(screen.getByTestId('for-sale'));
    expect(disabled()).toBe(true);
    await fireEvent.changeText(screen.getByTestId('price-input'), '5');
    expect(screen.getByText('Enter a price between ₪10 and ₪1,000.')).toBeTruthy();
    expect(disabled()).toBe(true);
    await fireEvent.changeText(screen.getByTestId('price-input'), '1₪50');
    expect(screen.getByTestId('price-input').props.value).toBe('150');
    expect(disabled()).toBe(false);
    await fireEvent.press(publishButton());
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        listing: expect.objectContaining({
          isForSale: true,
          isForTrade: true,
          askingPriceAgorot: 15000,
        }),
      }),
    );
  });

  it('needs trade, sale or both', async () => {
    await render(<ListingForm uid="u1" />);
    await fireEvent.press(screen.getByTestId('condition-like_new'));
    await fireEvent.press(screen.getByTestId('for-trade'));
    expect(disabled()).toBe(true);
  });

  it('needs an address: without one it offers to add it', async () => {
    mockSaved = { status: 'ready', items: [] };
    await render(<ListingForm uid="u1" />);
    await fireEvent.press(screen.getByTestId('condition-like_new'));
    expect(disabled()).toBe(true);
    await fireEvent.press(screen.getByTestId('add-address'));
    expect(mockPush).toHaveBeenCalledWith('/addresses/new');
  });

  it('explains a failed publish, keeps the form, and allows another try', async () => {
    mockPublish.mockRejectedValueOnce(
      Object.assign(new Error('x'), { details: { reason: 'unknownLocation' } }),
    );
    await render(<ListingForm uid="u1" />);
    await fireEvent.press(screen.getByTestId('condition-like_new'));
    await fireEvent.press(publishButton());
    expect(screen.getByTestId('publish-error').props.children).toBe(
      'That address is gone. Choose another one.',
    );
    expect(disabled()).toBe(false);
    expect(useAddDraft.getState().game).not.toBeNull();
  });
});
