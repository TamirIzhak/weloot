import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { deletePhotosOf, syncListingPhotos } from './listingPhotos';

const db = getFirestore(getApps()[0] ?? initializeApp());

async function clear() {
  await db.recursiveDelete(db.collection('listings'));
}
beforeEach(async () => {
  await clear();
  await db
    .doc('listings/l1')
    .set({ userId: 'u1', status: 'active', photoPaths: [], hasPhotos: false });
});
afterAll(clear);

const deps = (files: string[]) => ({ db, listFiles: jest.fn(async () => files) });

describe('syncListingPhotos', () => {
  it('sets photoPaths (in order) and hasPhotos from the files in Storage', async () => {
    const d = deps(['listings/l1/2.jpg', 'listings/l1/0.jpg', 'listings/l1/notes.txt']);
    await expect(syncListingPhotos(d, 'listings/l1/2.jpg')).resolves.toBe('updated');
    expect(d.listFiles).toHaveBeenCalledWith('listings/l1/');
    expect((await db.doc('listings/l1').get()).data()).toMatchObject({
      photoPaths: ['listings/l1/0.jpg', 'listings/l1/2.jpg'],
      hasPhotos: true,
    });
  });

  it('clears the badge when the last photo is deleted', async () => {
    await db.doc('listings/l1').update({ photoPaths: ['listings/l1/0.jpg'], hasPhotos: true });
    await syncListingPhotos(deps([]), 'listings/l1/0.jpg');
    expect((await db.doc('listings/l1').get()).data()).toMatchObject({
      photoPaths: [],
      hasPhotos: false,
    });
  });

  it('gives the same result whatever order events arrive in', async () => {
    const files = ['listings/l1/0.jpg', 'listings/l1/1.jpg'];
    await syncListingPhotos(deps(files), 'listings/l1/1.jpg');
    await syncListingPhotos(deps(files), 'listings/l1/0.jpg');
    expect((await db.doc('listings/l1').get()).get('photoPaths')).toEqual(files);
  });

  it('ignores other files and unknown listings', async () => {
    await expect(syncListingPhotos(deps([]), 'users/u1/avatar.jpg')).resolves.toBe('ignored');
    await expect(syncListingPhotos(deps([]), 'listings/l1/7.jpg')).resolves.toBe('ignored');
    await expect(syncListingPhotos(deps([]), 'listings/gone/0.jpg')).resolves.toBe('ignored');
  });
});

describe('deletePhotosOf (account deletion)', () => {
  it("deletes the photo folders of the user's listings only", async () => {
    await db.doc('listings/l2').set({ userId: 'u1', status: 'traded' });
    await db.doc('listings/l3').set({ userId: 'u2', status: 'active' });
    const deleted: string[] = [];
    const deleteFiles = jest.fn(async (prefix: string) => {
      deleted.push(prefix);
    });
    await deletePhotosOf(db, deleteFiles)('u1');
    expect(deleted.sort()).toEqual(['listings/l1/', 'listings/l2/']);
  });
});
