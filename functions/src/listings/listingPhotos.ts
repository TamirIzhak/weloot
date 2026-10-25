import { FieldValue, type Firestore } from 'firebase-admin/firestore';

// Listing photos (PRD W2, #15): the app uploads `listings/{listingId}/{0-5}.jpg` (Storage Rules: owner only, JPEG,
// ≤ 5 MB). After every upload or delete this recomputes the listing's `photoPaths` and `hasPhotos` from the files
// actually there, so the "Real photos" badge can't be faked and stays right whatever order events arrive in.

const PHOTO_PATH = /^listings\/([^/]+)\/([0-5])\.jpg$/;

export type PhotoDeps = {
  db: Firestore;
  /** Object names under a prefix in the default bucket. */
  listFiles(prefix: string): Promise<string[]>;
};

export async function syncListingPhotos(
  deps: PhotoDeps,
  objectName: string,
): Promise<'updated' | 'ignored'> {
  const match = PHOTO_PATH.exec(objectName);
  const listingId = match?.[1];
  if (!listingId) return 'ignored';
  const listing = deps.db.collection('listings').doc(listingId);
  if (!(await listing.get()).exists) return 'ignored';
  const photoPaths = (await deps.listFiles(`listings/${listingId}/`))
    .filter((name) => PHOTO_PATH.test(name))
    .sort();
  await listing.update({
    photoPaths,
    hasPhotos: photoPaths.length > 0,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return 'updated';
}

/** Account deletion cleanup (#11): deletes the photos of all the user's listings. */
export function deletePhotosOf(db: Firestore, deleteFiles: (prefix: string) => Promise<void>) {
  return async (uid: string) => {
    const listings = await db.collection('listings').where('userId', '==', uid).get();
    for (const listing of listings.docs) await deleteFiles(`listings/${listing.id}/`);
  };
}
