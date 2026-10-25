import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import Constants from 'expo-constants';
import { Share } from 'react-native';

import { PLATFORMS, type PlatformKey } from '@weloot/shared';

// Sharing (PRD W7, #50): the native share sheet with localized text and a link that opens the game page in the app,
// or the landing page in a browser.

/** The shared-link domain from the build config (TODO(OPEN-12): the Firebase Hosting domain for now). */
export function shareDomain(): string {
  const extra = Constants.expoConfig?.extra as { shareDomain?: unknown } | undefined;
  return typeof extra?.shareDomain === 'string' ? extra.shareDomain : 'weloot-c5fb2.web.app';
}

export const listingLink = (listingId: string) =>
  `https://${shareDomain()}/l/${encodeURIComponent(listingId)}`;

export type ShareFrom = 'game_page' | 'my_listings' | 'wantlist';

function track(from: ShareFrom, listingId?: string) {
  try {
    logEvent(getAnalytics(), 'listing_shared', {
      from,
      ...(listingId ? { listing_id: listingId } : {}),
    });
  } catch {
    // Analytics never blocks sharing.
  }
}

/** Shares one listing. Resolves once the sheet closes (shared or not). */
export async function shareListing(
  listing: { id: string; gameTitle: string; platform: PlatformKey },
  text: (values: { game: string; platform: string; link: string }) => string,
  from: ShareFrom,
): Promise<void> {
  const link = listingLink(listing.id);
  const result = await Share.share({
    message: text({ game: listing.gameTitle, platform: PLATFORMS[listing.platform].label, link }),
    url: link,
  });
  if (result.action === Share.sharedAction) track(from, listing.id);
}

/** Shares the want list as text ("Looking for: …"), so friends can tell you who has them. */
export async function shareWantlist(message: string): Promise<void> {
  const result = await Share.share({ message });
  if (result.action === Share.sharedAction) track('wantlist');
}
