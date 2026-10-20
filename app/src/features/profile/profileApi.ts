import {
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from '@react-native-firebase/firestore';

import {
  cityGeo,
  DEFAULT_SEARCH_RADIUS_KM,
  findCity,
  userProfileSchema,
  type LanguageCode,
  type ProfileSetupInput,
  type UserProfile,
} from '@weloot/shared';

/**
 * Version of the Terms of Service and Privacy Policy a user accepts at profile setup (stored with the time).
 * TODO: the legal texts don't exist yet; bump this whenever they change so users can be asked again.
 */
export const TOS_VERSION = '2026-10-draft';

/** Where the signed-in user's public profile stands. `missing` means profile setup hasn't been done. */
export type ProfileState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; profile: UserProfile }
  | { status: 'error' };

/**
 * Listens to `users/{uid}`. A "doesn't exist" answer from the offline cache isn't trusted (the profile may just
 * not be cached yet), so it stays `loading` until the server confirms.
 */
export function subscribeToProfile(uid: string, onChange: (state: ProfileState) => void) {
  return onSnapshot(
    doc(getFirestore(), 'users', uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(snapshot.metadata.fromCache ? { status: 'loading' } : { status: 'missing' });
        return;
      }
      // Right after setup, the server timestamps are still pending locally: estimate them.
      const parsed = userProfileSchema.safeParse(snapshot.data({ serverTimestamps: 'estimate' }));
      onChange(parsed.success ? { status: 'ready', profile: parsed.data } : { status: 'error' });
    },
    () => onChange({ status: 'error' }),
  );
}

/** Whether nobody has claimed this username yet (case-insensitive). Asks the server, never the cache. */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const claim = await getDocFromServer(doc(getFirestore(), 'usernames', username.toLowerCase()));
  return !claim.exists();
}

export class ProfileSetupError extends Error {
  constructor(
    readonly reason: 'usernameTaken' | 'unknownCity' | 'failed',
    options?: ErrorOptions,
  ) {
    super(reason, options);
    this.name = 'ProfileSetupError';
  }
}

/**
 * Claims the username and creates the public profile and private settings in one atomic batch (Security Rules
 * check the three together). The phone number is never written: it stays in Firebase Auth.
 */
export async function createProfile(
  uid: string,
  input: Omit<ProfileSetupInput, 'acceptedTerms'>,
  language: LanguageCode,
): Promise<void> {
  const city = findCity(input.cityId);
  if (!city) throw new ProfileSetupError('unknownCity');
  const db = getFirestore();
  const usernameLower = input.username.toLowerCase();
  const now = serverTimestamp();

  const batch = writeBatch(db);
  batch.set(doc(db, 'usernames', usernameLower), { uid });
  batch.set(doc(db, 'users', uid), {
    username: input.username,
    usernameLower,
    cityId: city.id,
    geo: cityGeo(city),
    ratingAvg: 0,
    ratingCount: 0,
    completedTrades: 0,
    createdAt: now,
    updatedAt: now,
  });
  batch.set(doc(db, 'users', uid, 'private', 'settings'), {
    preferredLanguage: language,
    tosVersion: TOS_VERSION,
    tosAcceptedAt: now,
    ageConfirmed: true,
    fcmTokens: [],
    blockedUserIds: [],
    searchRadiusKm: DEFAULT_SEARCH_RADIUS_KM,
    createdAt: now,
    updatedAt: now,
  });

  try {
    await batch.commit();
  } catch (error) {
    // Rules reject the batch when someone claimed the name first; tell that apart from other failures.
    const taken = await isUsernameAvailable(input.username).then(
      (available) => !available,
      () => false,
    );
    throw new ProfileSetupError(taken ? 'usernameTaken' : 'failed', { cause: error });
  }
}
