import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';

import { createTestEnv } from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'ratings/c1_bob'), {
      raterId: 'bob',
      rateeId: 'alice',
      stars: 5,
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

describe('ratings', () => {
  it('lets the rater and the rated person read it', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'ratings/c1_bob')));
    await assertSucceeds(getDoc(doc(as('alice'), 'ratings/c1_bob')));
  });

  it('hides it from others and guests, and nobody writes ratings directly', async () => {
    await assertFails(getDoc(doc(as('carol'), 'ratings/c1_bob')));
    await assertFails(
      getDoc(
        doc(env.unauthenticatedContext().firestore() as unknown as Firestore, 'ratings/c1_bob'),
      ),
    );
    await assertFails(
      setDoc(doc(as('bob'), 'ratings/c1_bob2'), { raterId: 'bob', rateeId: 'alice', stars: 5 }),
    );
    await assertFails(updateDoc(doc(as('bob'), 'ratings/c1_bob'), { stars: 1 }));
  });
});
