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

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'games/119133'), {
      title: 'Elden Ring',
      platforms: ['ps4', 'ps5'],
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

/** A want list item as the app writes it; an override of `undefined` leaves that field out. */
function want(overrides: Record<string, unknown> = {}) {
  const item: Record<string, unknown> = {
    igdbGameId: 119133,
    platform: 'ps5',
    gameTitle: 'Elden Ring',
    createdAt: serverTimestamp(),
    ...overrides,
  };
  return Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
}

const item = (db: Firestore, uid: string, id: string) => doc(db, `wantlist/${uid}/items/${id}`);

describe('wantlist', () => {
  it('lets the owner add a game on one console or any, read and remove it', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(item(db, 'alice', '119133_ps5'), want()));
    await assertSucceeds(setDoc(item(db, 'alice', '119133_any'), want({ platform: undefined })));
    await assertSucceeds(getDocs(collection(db, 'wantlist/alice/items')));
    await assertSucceeds(deleteDoc(item(db, 'alice', '119133_ps5')));
  });

  it('keeps want lists private: no one else, and no guest, reads or writes them', async () => {
    await assertSucceeds(setDoc(item(as('alice'), 'alice', '119133_ps5'), want()));
    await assertFails(getDoc(item(as('bob'), 'alice', '119133_ps5')));
    await assertFails(getDocs(collection(as('bob'), 'wantlist/alice/items')));
    await assertFails(getDoc(item(guest(), 'alice', '119133_ps5')));
    await assertFails(setDoc(item(as('bob'), 'alice', '119133_ps4'), want({ platform: 'ps4' })));
    await assertFails(deleteDoc(item(as('bob'), 'alice', '119133_ps5')));
    await assertFails(setDoc(item(guest(), 'alice', '119133_ps4'), want({ platform: 'ps4' })));
  });

  it('only takes real catalog games, on a console the game is on, with its real title', async () => {
    const db = as('alice');
    await assertFails(setDoc(item(db, 'alice', '999_ps5'), want({ igdbGameId: 999 })));
    await assertFails(setDoc(item(db, 'alice', '119133_switch'), want({ platform: 'switch' })));
    await assertFails(setDoc(item(db, 'alice', '119133_ps5'), want({ gameTitle: 'Free money' })));
  });

  it('needs the ID to match the game and console, so a game is never added twice', async () => {
    const db = as('alice');
    await assertFails(setDoc(item(db, 'alice', 'random'), want()));
    await assertFails(setDoc(item(db, 'alice', '119133_ps4'), want()));
    await assertFails(setDoc(item(db, 'alice', '119133_ps5'), want({ platform: undefined })));
  });

  it('checks the fields: no extras, the server time, a positive whole game ID', async () => {
    const db = as('alice');
    await assertFails(setDoc(item(db, 'alice', '119133_ps5'), want({ extra: true })));
    await assertFails(
      setDoc(item(db, 'alice', '119133_ps5'), want({ createdAt: Timestamp.fromMillis(0) })),
    );
    await assertFails(setDoc(item(db, 'alice', '119133_ps5'), want({ gameTitle: undefined })));
    await assertFails(setDoc(item(db, 'alice', '-1_ps5'), want({ igdbGameId: -1 })));
  });

  it('lets the owner add an item again (replaced whole), but never edit one in part', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(item(db, 'alice', '119133_ps5'), want()));
    await assertFails(setDoc(item(as('bob'), 'alice', '119133_ps5'), want()));
    // An item added earlier (an old time, so no same-millisecond match with request.time):
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'wantlist/alice/items/119133_ps4'), {
        ...want({ platform: 'ps4' }),
        createdAt: Timestamp.fromMillis(Date.now() - 60_000),
      });
    });
    await assertFails(updateDoc(item(db, 'alice', '119133_ps4'), { gameTitle: 'Elden Ring' }));
  });
});
