import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  putFile,
  ref,
} from '@react-native-firebase/storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Listing photos (PRD W2): up to 6, resized to ≤1600 px on the long edge and re-encoded as JPEG ~0.8. Re-encoding
// writes a fresh file without the original EXIF, so no GPS or camera data leaves the phone. Storage Rules only
// accept the listing owner's JPEGs ≤ 5 MB at listings/{listingId}/{0-5}.jpg; a function then updates the listing.

export const MAX_PHOTOS = 6;
const MAX_EDGE = 1600;
const QUALITY = 0.8;

export const photoPath = (listingId: string, slot: number) => `listings/${listingId}/${slot}.jpg`;

/** The first free slot (0–5) given the paths already used, or null when all six are taken. */
export function freeSlot(usedPaths: readonly string[]): number | null {
  for (let slot = 0; slot < MAX_PHOTOS; slot += 1) {
    if (!usedPaths.some((path) => path.endsWith(`/${slot}.jpg`))) return slot;
  }
  return null;
}

/** Resizes (long edge ≤ 1600) and re-encodes as JPEG without EXIF; returns the new local file URI. */
export async function preparePhoto(uri: string, width: number, height: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_EDGE) {
    context.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
  return result.uri;
}

/** Uploads a prepared photo to its slot, reporting progress from 0 to 1. */
export async function uploadPhoto(
  listingId: string,
  slot: number,
  fileUri: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const task = putFile(ref(getStorage(), photoPath(listingId, slot)), fileUri, {
    contentType: 'image/jpeg',
  });
  task.on('state_changed', (snapshot) => {
    if (snapshot.totalBytes > 0) onProgress(snapshot.bytesTransferred / snapshot.totalBytes);
  });
  await task;
  try {
    logEvent(getAnalytics(), 'photo_added', { slot });
  } catch {
    // Analytics must never block uploads.
  }
}

export function deletePhoto(path: string): Promise<void> {
  return deleteObject(ref(getStorage(), path));
}

export function photoUrl(path: string): Promise<string> {
  return getDownloadURL(ref(getStorage(), path));
}
