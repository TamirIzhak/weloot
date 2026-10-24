import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
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

// The test contexts return the compat Firestore type; at runtime it works with the modular API.
const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const guest = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

/** A saved address as the app writes it; an override of `undefined` leaves that field out. */
function address(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    label: 'Home',
    address: 'Dizengoff 50, Tel Aviv',
    lat: 32.0754,
    lng: 34.7752,
    cityId: '5000',
    areaName: 'Tel Aviv - Yafo',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

const HOME = 'users/alice/locations/home';

describe('users/{uid}/locations (saved addresses, PRD W2)', () => {
  it('lets the owner add, read, list, edit and delete their addresses', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, HOME), address()));
    await assertSucceeds(
      addDoc(collection(db, 'users/alice/locations'), address({ label: 'Work' })),
    );
    await assertSucceeds(getDoc(doc(db, HOME)));
    await assertSucceeds(getDocs(collection(db, 'users/alice/locations')));
    await assertSucceeds(
      updateDoc(doc(db, HOME), { label: 'Parents', updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(deleteDoc(doc(db, HOME)));
  });

  it('accepts an address without a locality code', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), HOME), address({ cityId: undefined })));
  });

  it('keeps addresses private: nobody else can read, list or write them', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), HOME), address()));
    for (const db of [as('bob'), guest()]) {
      await assertFails(getDoc(doc(db, HOME)));
      await assertFails(getDocs(collection(db, 'users/alice/locations')));
      await assertFails(setDoc(doc(db, 'users/alice/locations/other'), address()));
      await assertFails(
        updateDoc(doc(db, HOME), { label: 'Hacked', updatedAt: serverTimestamp() }),
      );
      await assertFails(deleteDoc(doc(db, HOME)));
    }
  });

  it.each<[string, Record<string, unknown>]>([
    ['an empty label', { label: '' }],
    ['a long label', { label: 'x'.repeat(31) }],
    ['no address', { address: undefined }],
    ['a long address', { address: 'x'.repeat(201) }],
    ['a point outside Israel', { lat: 48.85, lng: 2.35 }],
    ['a text latitude', { lat: '32.07' }],
    ['a bad locality code', { cityId: 'tel-aviv' }],
    ['no area name', { areaName: undefined }],
    ['an extra field', { phone: '+972541234567' }],
    ['a client createdAt', { createdAt: Timestamp.fromMillis(0) }],
  ])('denies an address with %s', async (_, overrides) => {
    await assertFails(setDoc(doc(as('alice'), HOME), address(overrides)));
  });

  it('keeps createdAt and requires a fresh updatedAt on edits', async () => {
    const db = as('alice');
    // Seeded with old timestamps: a write in the same millisecond as the create could otherwise match request.time.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const old = Timestamp.fromMillis(1_000);
      await setDoc(doc(ctx.firestore(), HOME), address({ createdAt: old, updatedAt: old }));
    });
    await assertFails(updateDoc(doc(db, HOME), { label: 'Work' }));
    await assertFails(
      updateDoc(doc(db, HOME), {
        createdAt: Timestamp.fromMillis(0),
        updatedAt: serverTimestamp(),
      }),
    );
  });
});
