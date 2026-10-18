import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadString } from 'firebase/storage';

import { createTestEnv } from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.clearStorage();
});

afterAll(async () => {
  await env.cleanup();
});

describe('storage default deny', () => {
  it('denies unauthenticated uploads and downloads', async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(uploadString(ref(storage, 'listings/l1/0.jpg'), 'x'));
    await assertFails(getBytes(ref(storage, 'listings/l1/0.jpg')));
  });

  it('denies signed-in uploads until listing photo rules exist', async () => {
    const storage = env.authenticatedContext('alice').storage();
    await assertFails(uploadString(ref(storage, 'listings/l1/0.jpg'), 'x'));
  });
});
