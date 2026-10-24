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
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

import { createTestEnv } from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'listings/active1'), {
      userId: 'alice',
      status: 'active',
      gameTitle: 'A',
    });
    await setDoc(doc(db, 'listings/paused1'), {
      userId: 'alice',
      status: 'paused',
      gameTitle: 'B',
    });
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const guest = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

describe('listings (PRD W1, W2)', () => {
  it('lets anyone, guests included, read active listings and query them', async () => {
    for (const db of [guest(), as('bob')]) {
      await assertSucceeds(getDoc(doc(db, 'listings/active1')));
      await assertSucceeds(
        getDocs(query(collection(db, 'listings'), where('status', '==', 'active'))),
      );
    }
  });

  it('shows paused (and other non-active) listings only to their owner', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'listings/paused1')));
    await assertSucceeds(
      getDocs(query(collection(as('alice'), 'listings'), where('userId', '==', 'alice'))),
    );
    await assertFails(getDoc(doc(as('bob'), 'listings/paused1')));
    await assertFails(getDoc(doc(guest(), 'listings/paused1')));
  });

  it('denies queries that could return non-active listings of others', async () => {
    await assertFails(getDocs(collection(as('bob'), 'listings')));
    await assertFails(
      getDocs(query(collection(as('bob'), 'listings'), where('userId', '==', 'alice'))),
    );
  });

  it('denies every client write: publishing and status changes go through functions', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'listings/new1'), { userId: 'alice', status: 'active' }));
    await assertFails(updateDoc(doc(db, 'listings/active1'), { status: 'traded' }));
    await assertFails(updateDoc(doc(db, 'listings/active1'), { notes: 'edited' }));
    await assertFails(deleteDoc(doc(db, 'listings/active1')));
  });
});
