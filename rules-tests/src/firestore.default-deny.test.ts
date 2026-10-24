import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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

describe('firestore default deny', () => {
  it('denies unauthenticated reads and writes', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'listings/l1')));
    await assertFails(setDoc(doc(db, 'listings/l1'), { userId: 'alice' }));
  });

  it('denies a signed-in user collections without rules yet, even for their own data', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'listings/l1'), { userId: 'alice' }));
    await assertFails(getDoc(doc(db, 'wantlist/alice/items/1')));
  });

  it('denies access to server-only collections', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(db, 'system/doneToken')));
  });
});
