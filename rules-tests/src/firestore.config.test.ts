import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';

import { createTestEnv } from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'config/app'), { minVersion: '0.0.0' });
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

describe('config/* (read-only app settings)', () => {
  it('allows anyone to read a config doc, signed in or not', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'config/app')));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), 'config/app')));
  });

  it('allows listing the config collection', async () => {
    await assertSucceeds(getDocs(collection(env.unauthenticatedContext().firestore(), 'config')));
  });

  it('denies creating, updating and deleting config docs from clients', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'config/fees'), { platformPercent: 0 }));
    await assertFails(setDoc(doc(db, 'config/app'), { minVersion: '9.9.9' }));
    await assertFails(deleteDoc(doc(db, 'config/app')));
  });

  it('does not open anything below config docs', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'config/app/secrets/x')));
  });
});
