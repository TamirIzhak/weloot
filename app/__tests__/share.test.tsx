import { render } from '@testing-library/react-native';
import { Share } from 'react-native';

import SharedListing from '@/app/l/[id]';
import { listingLink, shareListing, shareWantlist } from '@/features/share/share';

jest.unmock('@/features/share/share');

const mockLogEvent = jest.fn();
const mockRedirect = jest.fn();
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: () => ({}),
  logEvent: (...a: unknown[]) => mockLogEvent(...a),
}));
jest.mock('expo-constants', () => ({
  expoConfig: { extra: { shareDomain: 'development-1c64a.web.app' } },
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'l1' }),
  Redirect: (props: { href: unknown }) => {
    mockRedirect(props.href);
    return null;
  },
}));

let shareSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  shareSpy = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
});
afterEach(() => shareSpy.mockRestore());

describe('sharing', () => {
  it('links to the game page on the build’s share domain', () => {
    expect(listingLink('l1')).toBe('https://development-1c64a.web.app/l/l1');
  });

  it('shares a listing with localized text and logs listing_shared only when shared', async () => {
    await shareListing(
      { id: 'l1', gameTitle: 'Elden Ring', platform: 'ps5' },
      (v) => `${v.game} (${v.platform}): ${v.link}`,
      'game_page',
    );
    expect(shareSpy).toHaveBeenCalledWith({
      message: 'Elden Ring (PS5): https://development-1c64a.web.app/l/l1',
      url: 'https://development-1c64a.web.app/l/l1',
    });
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'listing_shared', {
      from: 'game_page',
      listing_id: 'l1',
    });

    shareSpy.mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });
    await shareWantlist('Looking for: Zelda');
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
  });

  it('opens a shared link in the app on the game page', async () => {
    await render(<SharedListing />);
    expect(mockRedirect).toHaveBeenCalledWith({ pathname: '/listings/[id]', params: { id: 'l1' } });
  });
});
