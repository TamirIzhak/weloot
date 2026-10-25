import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';

import { createTestEnv } from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'matches/alice/items/bob'), {
      theirListingIds: ['b1'],
      myListingIds: [],
      perfect: false,
      score: 10,
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

describe('matches', () => {
  it('lets a user read their own matches', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'matches/alice/items/bob')));
  });

  it('hides them from everyone else, guests included', async () => {
    await assertFails(getDoc(doc(as('bob'), 'matches/alice/items/bob')));
    await assertFails(getDoc(doc(guest(), 'matches/alice/items/bob')));
  });

  it('lets no client write matches, not even the owner (functions only)', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'matches/alice/items/carol'), { perfect: true }));
    await assertFails(updateDoc(doc(db, 'matches/alice/items/bob'), { perfect: true }));
    await assertFails(deleteDoc(doc(db, 'matches/alice/items/bob')));
  });
});
