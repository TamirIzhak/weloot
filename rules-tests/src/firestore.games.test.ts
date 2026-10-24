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
  setDoc,
  type Firestore,
} from 'firebase/firestore';

import { createTestEnv } from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'games/119133'), { title: 'Elden Ring', slug: 'elden-ring' });
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

describe('games (catalog, PRD §5.1)', () => {
  it('lets anyone, guests included, read and list games', async () => {
    for (const db of [guest(), as('alice')]) {
      await assertSucceeds(getDoc(doc(db, 'games/119133')));
      await assertSucceeds(getDocs(collection(db, 'games')));
    }
  });

  it('denies every client write: only the sync function writes the catalog', async () => {
    for (const db of [guest(), as('alice')]) {
      await assertFails(setDoc(doc(db, 'games/1'), { title: 'Fake game', slug: 'fake' }));
      await assertFails(setDoc(doc(db, 'games/119133'), { title: 'Renamed', slug: 'elden-ring' }));
      await assertFails(deleteDoc(doc(db, 'games/119133')));
    }
  });

  it('keeps the sync state and IGDB token private', async () => {
    await assertFails(getDoc(doc(as('alice'), 'system/igdbToken')));
    await assertFails(getDoc(doc(guest(), 'system/catalogSync')));
  });
});

describe('barcodes (server-only, PRD §5.1)', () => {
  it('denies every client read and write: only functions use the barcode table', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'barcodes/0711719541783'), {
        igdbGameId: 1,
        platform: 'ps5',
      });
    });
    for (const db of [guest(), as('alice')]) {
      await assertFails(getDoc(doc(db, 'barcodes/0711719541783')));
      await assertFails(
        setDoc(doc(db, 'barcodes/0711719541783'), { igdbGameId: 2, platform: 'ps5' }),
      );
      await assertFails(
        setDoc(doc(db, 'barcodes/0711719541783/votes/alice'), { igdbGameId: 2, platform: 'ps5' }),
      );
    }
  });
});
