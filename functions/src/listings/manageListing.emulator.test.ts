import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

import { handleManageListing } from './manageListing';

jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const db = getFirestore(getApps()[0] ?? initializeApp());
const trader = (uid: string) =>
  ({
    uid,
    token: { phone_number: '+972541234567' },
    rawToken: 'raw',
  }) as unknown as CallableRequest['auth'];
const OUTSIDE = { kind: 'outside' } as const;

const manage = (data: Record<string, unknown>, uid = 'u1') =>
  handleManageListing(trader(uid), { listingId: 'l1', ...data }, { db });
const listing = async () => (await db.doc('listings/l1').get()).data();

async function seed(fields: Record<string, unknown> = {}) {
  await db.doc('listings/l1').set({
    userId: 'u1',
    status: 'active',
    isForTrade: true,
    isForSale: true,
    ...fields,
  });
}

beforeEach(async () => {
  await db.recursiveDelete(db.collection('listings'));
  await seed();
});
afterAll(async () => {
  await db.recursiveDelete(db.collection('listings'));
});

describe('manageListing', () => {
  it('pauses, resumes and removes through the state machine', async () => {
    await expect(manage({ action: 'pause' })).resolves.toEqual({ status: 'paused' });
    await expect(manage({ action: 'resume' })).resolves.toEqual({ status: 'active' });
    await expect(manage({ action: 'remove' })).resolves.toEqual({ status: 'removed' });
    expect(await listing()).toMatchObject({ status: 'removed' });
  });

  it('closes as Swapped with someone outside WeLoot, at once', async () => {
    await expect(manage({ action: 'closeTraded', closedWith: OUTSIDE })).resolves.toEqual({
      status: 'traded',
    });
    const after = await listing();
    expect(after).toMatchObject({ status: 'traded', closedWith: OUTSIDE });
    expect(after?.closedAt).toBeDefined();
  });

  it('closes a paused listing as Sold', async () => {
    await seed({ status: 'paused' });
    await expect(manage({ action: 'closeSold', closedWith: OUTSIDE })).resolves.toEqual({
      status: 'sold',
    });
  });

  it('rejects transitions the machine does not allow', async () => {
    await manage({ action: 'closeTraded', closedWith: OUTSIDE });
    await expect(manage({ action: 'resume' })).rejects.toMatchObject({
      details: { reason: 'invalidTransition' },
    });
    await expect(manage({ action: 'remove' })).rejects.toMatchObject({
      details: { reason: 'invalidTransition' },
    });
  });

  it('only closes as Swapped/Sold what the listing offered', async () => {
    await seed({ isForSale: false });
    await expect(manage({ action: 'closeSold', closedWith: OUTSIDE })).rejects.toMatchObject({
      details: { reason: 'notForSale' },
    });
    await seed({ isForTrade: false });
    await expect(manage({ action: 'closeTraded', closedWith: OUTSIDE })).rejects.toMatchObject({
      details: { reason: 'notForTrade' },
    });
  });

  it('needs "who with" for closing, and only for closing', async () => {
    await expect(manage({ action: 'closeTraded' })).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
    await expect(manage({ action: 'pause', closedWith: OUTSIDE })).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
  });

  it('does not close with a WeLoot user until deals exist (#47)', async () => {
    await expect(
      manage({
        action: 'closeTraded',
        closedWith: { kind: 'deal', userId: 'u2', conversationId: 'c1' },
      }),
    ).rejects.toMatchObject({ details: { reason: 'dealNotAvailable' } });
    expect(await listing()).toMatchObject({ status: 'active' });
  });

  it("refuses someone else's listing or one that does not exist", async () => {
    await expect(manage({ action: 'pause' }, 'u2')).rejects.toMatchObject({
      details: { reason: 'notOwner' },
    });
    await expect(
      handleManageListing(trader('u1'), { listingId: 'nope', action: 'pause' }, { db }),
    ).rejects.toMatchObject({ details: { reason: 'notFound' } });
    expect(await listing()).toMatchObject({ status: 'active' });
  });
});
