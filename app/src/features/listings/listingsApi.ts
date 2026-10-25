import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { getApp } from '@react-native-firebase/app';
import { collection, doc, getFirestore } from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import {
  FIREBASE_REGION,
  type PublishListingInput,
  type PublishListingResult,
} from '@weloot/shared';

/** A fresh listing ID (Firestore auto-ID, generated on the device): the publish request's idempotency key. */
export function newListingId(): string {
  return doc(collection(getFirestore(), 'listings')).id;
}

/** Publishes through the `publishListing` function (PRD W2) and logs `game_listed`. */
export async function publishListing(input: PublishListingInput): Promise<string> {
  const call = httpsCallable<PublishListingInput, PublishListingResult>(
    getFunctions(getApp(), FIREBASE_REGION),
    'publishListing',
  );
  const { data } = await call(input);
  try {
    logEvent(getAnalytics(), 'game_listed', {
      platform: input.listing.platform,
      has_photos: false,
    });
  } catch {
    // Analytics must never block publishing.
  }
  return data.listingId;
}

/** `details.reason` of a failed publish, to pick the message. */
export function publishErrorReason(error: unknown): string | undefined {
  const details = (error as { details?: { reason?: unknown } } | null)?.details;
  return typeof details?.reason === 'string' ? details.reason : undefined;
}
