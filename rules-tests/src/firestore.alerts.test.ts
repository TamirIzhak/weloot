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
    const db = ctx.firestore();
    await setDoc(doc(db, 'games/119388'), { title: 'Zelda', platforms: ['switch'] });
    // Old timestamps, so no same-millisecond match with request.time in update tests.
    const old = Timestamp.fromMillis(Date.now() - 60_000);
    await setDoc(doc(db, 'newForYou/alice/items/l1'), {
      listingId: 'l1',
      igdbGameId: 119388,
      platform: 'switch',
      gameTitle: 'Zelda',
      areaName: 'Haifa',
      alertKey: 'a_119388_any',
      pushed: true,
      createdAt: old,
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

function alert(overrides: Record<string, unknown> = {}) {
  const value: Record<string, unknown> = {
    igdbGameId: 119388,
    gameTitle: 'Zelda',
    radiusKm: 25,
    lat: 32.79,
    lng: 34.99,
    source: 'search',
    createdAt: serverTimestamp(),
    ...overrides,
  };
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}
const alertDoc = (db: Firestore, uid: string, id = '119388_any') =>
  doc(db, `alerts/${uid}/items/${id}`);

describe('alerts', () => {
  it('lets the owner create, read, re-create and delete a game alert', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(alertDoc(db, 'alice'), alert()));
    await assertSucceeds(
      setDoc(alertDoc(db, 'alice', '119388_switch'), alert({ platform: 'switch' })),
    );
    await assertSucceeds(setDoc(alertDoc(db, 'alice'), alert({ lat: undefined, lng: undefined })));
    await assertSucceeds(getDocs(collection(db, 'alerts/alice/items')));
    await assertSucceeds(deleteDoc(alertDoc(db, 'alice')));
  });

  it('keeps alerts private', async () => {
    await assertSucceeds(setDoc(alertDoc(as('alice'), 'alice'), alert()));
    await assertFails(getDoc(alertDoc(as('bob'), 'alice')));
    await assertFails(getDoc(alertDoc(guest(), 'alice')));
    await assertFails(
      setDoc(alertDoc(as('bob'), 'alice', '119388_switch'), alert({ platform: 'switch' })),
    );
    await assertFails(deleteDoc(alertDoc(as('bob'), 'alice')));
  });

  it('only takes real games and consoles, a sane radius and a place in Israel', async () => {
    const db = as('alice');
    await assertFails(setDoc(alertDoc(db, 'alice', '1_any'), alert({ igdbGameId: 1 })));
    await assertFails(setDoc(alertDoc(db, 'alice', '119388_ps5'), alert({ platform: 'ps5' })));
    await assertFails(setDoc(alertDoc(db, 'alice'), alert({ gameTitle: 'Other' })));
    await assertFails(setDoc(alertDoc(db, 'alice'), alert({ radiusKm: 500 })));
    await assertFails(setDoc(alertDoc(db, 'alice'), alert({ lat: 51.5, lng: -0.1 })));
    await assertFails(setDoc(alertDoc(db, 'alice'), alert({ lng: undefined })));
    await assertFails(setDoc(alertDoc(db, 'alice'), alert({ source: 'wantlist' })));
    await assertFails(setDoc(alertDoc(db, 'alice'), alert({ createdAt: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(alertDoc(db, 'alice', 'random'), alert()));
    await assertFails(setDoc(alertDoc(db, 'alice'), alert({ query: 'zelda' })));
  });
});

describe('newForYou', () => {
  const item = (db: Firestore, uid = 'alice') => doc(db, `newForYou/${uid}/items/l1`);

  it('lets the owner read, mark seen/opened (server time) and dismiss', async () => {
    const db = as('alice');
    await assertSucceeds(getDoc(item(db)));
    await assertSucceeds(updateDoc(item(db), { seenAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(item(db), { openedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(item(db)));
  });

  it('denies other users, guests, and any other change', async () => {
    await assertFails(getDoc(item(as('bob'))));
    await assertFails(getDoc(item(guest())));
    const db = as('alice');
    await assertFails(updateDoc(item(db), { pushed: false }));
    await assertFails(updateDoc(item(db), { seenAt: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(doc(db, 'newForYou/alice/items/l2'), { listingId: 'l2' }));
    await assertFails(deleteDoc(item(as('bob'))));
  });
});
