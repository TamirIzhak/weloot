import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
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
    await setDoc(doc(db, 'conversations/l1_bob'), {
      listingId: 'l1',
      ownerId: 'alice',
      otherId: 'bob',
      participants: ['alice', 'bob'],
      openedWith: 'question',
      unread: { alice: 1, bob: 0 },
    });
    await setDoc(doc(db, 'conversations/l1_bob/messages/m1'), {
      senderId: 'bob',
      type: 'text',
      text: 'Hi',
    });
    await setDoc(doc(db, 'conversations/l1_bob/offers/o1'), {
      fromUid: 'bob',
      toUid: 'alice',
      status: 'pending',
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

describe('conversations', () => {
  it('lets both participants read the conversation, its messages and offers', async () => {
    for (const uid of ['alice', 'bob']) {
      const db = as(uid);
      await assertSucceeds(getDoc(doc(db, 'conversations/l1_bob')));
      await assertSucceeds(getDocs(collection(db, 'conversations/l1_bob/messages')));
      await assertSucceeds(getDoc(doc(db, 'conversations/l1_bob/offers/o1')));
    }
    // The inbox query: conversations I'm in.
    await assertSucceeds(
      getDocs(
        query(
          collection(as('bob'), 'conversations'),
          where('participants', 'array-contains', 'bob'),
        ),
      ),
    );
  });

  it('hides them from everyone else, guests included', async () => {
    for (const db of [as('carol'), guest()]) {
      await assertFails(getDoc(doc(db, 'conversations/l1_bob')));
      await assertFails(getDocs(collection(db, 'conversations/l1_bob/messages')));
      await assertFails(getDoc(doc(db, 'conversations/l1_bob/offers/o1')));
    }
    await assertFails(getDocs(collection(as('carol'), 'conversations')));
  });

  it('lets no client write: not conversations, messages, offers, statuses or deals', async () => {
    const db = as('alice');
    await assertFails(
      setDoc(doc(db, 'conversations/l2_alice'), { participants: ['alice', 'bob'] }),
    );
    await assertFails(updateDoc(doc(db, 'conversations/l1_bob'), { 'unread.alice': 0 }));
    await assertFails(
      updateDoc(doc(db, 'conversations/l1_bob'), { deal: { status: 'completed' } }),
    );
    await assertFails(deleteDoc(doc(db, 'conversations/l1_bob')));
    await assertFails(
      addDoc(collection(db, 'conversations/l1_bob/messages'), {
        senderId: 'alice',
        type: 'text',
        text: 'x',
      }),
    );
    await assertFails(updateDoc(doc(db, 'conversations/l1_bob/offers/o1'), { status: 'accepted' }));
    await assertFails(
      setDoc(doc(as('bob'), 'conversations/l1_bob/offers/o2'), {
        fromUid: 'bob',
        status: 'pending',
      }),
    );
  });
});
