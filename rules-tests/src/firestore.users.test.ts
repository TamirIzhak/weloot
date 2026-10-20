import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

import { createTestEnv } from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

const geo = { lat: 32.085, lng: 34.782, geohash: 'sv8wr' };

function profile(username: string, overrides: Record<string, unknown> = {}) {
  return {
    username,
    usernameLower: username.toLowerCase(),
    cityId: 'tel-aviv',
    geo,
    ratingAvg: 0,
    ratingCount: 0,
    completedTrades: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function settings(overrides: Record<string, unknown> = {}) {
  return {
    preferredLanguage: 'he',
    tosVersion: '2026-10-draft',
    tosAcceptedAt: serverTimestamp(),
    ageConfirmed: true,
    fcmTokens: [],
    blockedUserIds: [],
    searchRadiusKm: 25,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

type SetupOptions = {
  profile?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  claimUid?: string;
  claimId?: string;
  skip?: 'claim' | 'profile' | 'settings';
};

/** The app's profile-setup batch, optionally tampered with. */
function setupBatch(db: Firestore, uid: string, username: string, opts: SetupOptions = {}) {
  const batch = writeBatch(db);
  if (opts.skip !== 'claim') {
    batch.set(doc(db, 'usernames', opts.claimId ?? username.toLowerCase()), {
      uid: opts.claimUid ?? uid,
    });
  }
  if (opts.skip !== 'profile') batch.set(doc(db, 'users', uid), profile(username, opts.profile));
  if (opts.skip !== 'settings') {
    batch.set(doc(db, 'users', uid, 'private', 'settings'), settings(opts.settings));
  }
  return batch.commit();
}

// The test contexts return the compat Firestore type; at runtime it works with the modular API (writeBatch too).
const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const guest = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

describe('profile setup batch', () => {
  it('lets a signed-in user claim a username and create their profile and settings', async () => {
    await assertSucceeds(setupBatch(as('alice'), 'alice', 'Alice_1'));
  });

  it('accepts Hebrew usernames', async () => {
    await assertSucceeds(setupBatch(as('alice'), 'alice', 'גיימר_1'));
  });

  it('denies guests', async () => {
    await assertFails(setupBatch(guest(), 'alice', 'Alice_1'));
  });

  it('denies a profile without its username claim, a claim without a profile, and settings alone', async () => {
    await assertFails(setupBatch(as('alice'), 'alice', 'Alice_1', { skip: 'claim' }));
    await assertFails(setupBatch(as('alice'), 'alice', 'Alice_1', { skip: 'profile' }));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/private/settings'), settings()));
  });

  it("denies writing someone else's profile or claiming a name for someone else", async () => {
    await assertFails(setupBatch(as('mallory'), 'alice', 'Alice_1'));
    await assertFails(setupBatch(as('alice'), 'alice', 'Alice_1', { claimUid: 'bob' }));
  });

  it('denies a username that is already taken, in any letter case', async () => {
    await assertSucceeds(setupBatch(as('alice'), 'alice', 'Gamer'));
    await assertFails(setupBatch(as('bob'), 'bob', 'Gamer'));
    await assertFails(setupBatch(as('bob'), 'bob', 'GAMER'));
  });

  it("denies a claim id that doesn't match the profile's username", async () => {
    await assertFails(setupBatch(as('alice'), 'alice', 'Alice_1', { claimId: 'someone_else' }));
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(21)],
    ['a space', 'two words'],
    ['a symbol', 'alice!'],
  ])('denies a username with %s', async (_, username) => {
    await assertFails(setupBatch(as('alice'), 'alice', username));
  });

  it.each<[string, Record<string, unknown>]>([
    ['a usernameLower mismatch', { usernameLower: 'bob' }],
    ['a non-zero rating', { ratingAvg: 5 }],
    ['a non-zero rating count', { ratingCount: 3 }],
    ['non-zero trades', { completedTrades: 10 }],
    ['a client createdAt', { createdAt: Timestamp.fromMillis(0) }],
    ['a bad city id', { cityId: 'Tel Aviv' }],
    ['a location outside Israel', { geo: { ...geo, lat: 51.5 } }],
    ['an extra geo field', { geo: { ...geo, street: 'Dizengoff 1' } }],
    ['no geo', { geo: null }],
    ['a phone number', { phoneE164: '+972500000001' }],
  ])('denies a profile with %s', async (_, overrides) => {
    await assertFails(setupBatch(as('alice'), 'alice', 'Alice_1', { profile: overrides }));
  });

  it.each<[string, Record<string, unknown>]>([
    ['an unknown language', { preferredLanguage: 'fr' }],
    ['age not confirmed', { ageConfirmed: false }],
    ['an empty TOS version', { tosVersion: '' }],
    ['a client tosAcceptedAt', { tosAcceptedAt: Timestamp.fromMillis(0) }],
    ['prefilled push tokens', { fcmTokens: ['x'] }],
    ['a prefilled block list', { blockedUserIds: ['bob'] }],
    ['a radius out of range', { searchRadiusKm: 500 }],
    ['a fractional radius', { searchRadiusKm: 2.5 }],
    ['an extra field', { isAdmin: true }],
  ])('denies settings with %s', async (_, overrides) => {
    await assertFails(setupBatch(as('alice'), 'alice', 'Alice_1', { settings: overrides }));
  });
});

describe('after setup', () => {
  beforeEach(async () => {
    await setupBatch(as('alice'), 'alice', 'Alice_1');
  });

  it('lets anyone, guests included, read a public profile and check a username', async () => {
    await assertSucceeds(getDoc(doc(guest(), 'users', 'alice')));
    await assertSucceeds(getDoc(doc(guest(), 'usernames', 'alice_1')));
    await assertSucceeds(getDoc(doc(guest(), 'usernames', 'free_name')));
  });

  it('denies listing usernames', async () => {
    await assertFails(getDocs(collection(guest(), 'usernames')));
  });

  it('keeps settings private to their owner', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'users/alice/private/settings')));
    await assertFails(getDoc(doc(as('bob'), 'users/alice/private/settings')));
    await assertFails(getDoc(doc(guest(), 'users/alice/private/settings')));
  });

  it('denies claiming a second username', async () => {
    await assertFails(setDoc(doc(as('alice'), 'usernames', 'alice_2'), { uid: 'alice' }));
    await assertFails(setupBatch(as('alice'), 'alice', 'Alice_2'));
  });

  it('denies client updates and deletes (edits come with #10, deletion with #11)', async () => {
    const db = as('alice');
    await assertFails(updateDoc(doc(db, 'users/alice'), { ratingAvg: 5 }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { cityId: 'haifa' }));
    await assertFails(deleteDoc(doc(db, 'users/alice')));
    await assertFails(setDoc(doc(db, 'usernames/alice_1'), { uid: 'alice' }));
    await assertFails(deleteDoc(doc(db, 'usernames/alice_1')));
    await assertFails(updateDoc(doc(db, 'users/alice/private/settings'), { searchRadiusKm: 50 }));
    await assertFails(deleteDoc(doc(db, 'users/alice/private/settings')));
  });

  it("denies a squatter taking a released-looking name or another user's claim", async () => {
    await assertFails(setDoc(doc(as('bob'), 'usernames', 'alice_1'), { uid: 'bob' }));
  });

  it('does not open other docs under a profile', async () => {
    await assertFails(getDoc(doc(as('alice'), 'users/alice/private/other')));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/private/other'), { x: 1 }));
  });
});
