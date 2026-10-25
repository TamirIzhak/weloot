import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes, uploadString } from 'firebase/storage';

import { createTestEnv } from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'listings/active1'), { userId: 'alice', status: 'active' });
    await setDoc(doc(db, 'listings/paused1'), { userId: 'alice', status: 'paused' });
    await setDoc(doc(db, 'listings/traded1'), { userId: 'alice', status: 'traded' });
  });
});

afterEach(async () => {
  await env.clearStorage();
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

const JPEG = { contentType: 'image/jpeg' };
const photo = (size = 1024) => new Uint8Array(size);
const storageOf = (uid?: string) =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();

async function seedPhoto(path: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), photo(), JPEG);
  });
}

describe('storage default deny', () => {
  it('denies everything outside listing photos', async () => {
    await assertFails(uploadString(ref(storageOf('alice'), 'users/alice/avatar.jpg'), 'x'));
    await assertFails(getBytes(ref(storageOf(), 'anything/else.jpg')));
  });
});

describe('listing photos (PRD W2)', () => {
  it('lets the owner upload JPEG photos 0–5 to an open listing', async () => {
    const storage = storageOf('alice');
    await assertSucceeds(uploadBytes(ref(storage, 'listings/active1/0.jpg'), photo(), JPEG));
    await assertSucceeds(uploadBytes(ref(storage, 'listings/active1/5.jpg'), photo(), JPEG));
    await assertSucceeds(uploadBytes(ref(storage, 'listings/paused1/0.jpg'), photo(), JPEG));
  });

  it.each([
    ['another user', 'bob', 'listings/active1/0.jpg', JPEG, 1024],
    ['a guest', undefined, 'listings/active1/0.jpg', JPEG, 1024],
    ['a seventh photo', 'alice', 'listings/active1/6.jpg', JPEG, 1024],
    ['another file name', 'alice', 'listings/active1/cover.png', JPEG, 1024],
    ['another content type', 'alice', 'listings/active1/0.jpg', { contentType: 'image/png' }, 1024],
    ['a file over 5 MB', 'alice', 'listings/active1/0.jpg', JPEG, 5 * 1024 * 1024 + 1],
    ['a closed listing', 'alice', 'listings/traded1/0.jpg', JPEG, 1024],
    ['a listing that does not exist', 'alice', 'listings/nope/0.jpg', JPEG, 1024],
  ])('denies an upload by/with %s', async (_, uid, path, metadata, size) => {
    await assertFails(uploadBytes(ref(storageOf(uid), path), photo(size), metadata));
  });

  it('shows photos of active listings to everyone, others only to the owner', async () => {
    await seedPhoto('listings/active1/0.jpg');
    await seedPhoto('listings/paused1/0.jpg');
    await assertSucceeds(getBytes(ref(storageOf(), 'listings/active1/0.jpg')));
    await assertSucceeds(getBytes(ref(storageOf('bob'), 'listings/active1/0.jpg')));
    await assertSucceeds(getBytes(ref(storageOf('alice'), 'listings/paused1/0.jpg')));
    await assertFails(getBytes(ref(storageOf('bob'), 'listings/paused1/0.jpg')));
    await assertFails(getBytes(ref(storageOf(), 'listings/paused1/0.jpg')));
  });

  it('lets only the owner delete photos', async () => {
    await seedPhoto('listings/active1/0.jpg');
    await assertFails(deleteObject(ref(storageOf('bob'), 'listings/active1/0.jpg')));
    await assertSucceeds(deleteObject(ref(storageOf('alice'), 'listings/active1/0.jpg')));
  });
});
