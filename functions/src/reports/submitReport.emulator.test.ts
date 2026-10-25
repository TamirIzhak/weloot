import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

import { REPORTS_PER_DAY } from '@weloot/shared';

import { handleSubmitReport } from './submitReport';

jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const db = getFirestore(getApps()[0] ?? initializeApp());
// A signed-in user without a verified phone: reporting doesn't need one.
const user = (uid: string) =>
  ({ uid, token: {}, rawToken: 'raw' }) as unknown as CallableRequest['auth'];
const NOW = new Date('2026-10-25T12:00:00Z');
const report = (data: Record<string, unknown>, uid = 'reporter') =>
  handleSubmitReport(
    user(uid),
    { targetType: 'listing', targetId: 'l1', reason: 'scam', ...data },
    { db, now: () => NOW },
  );

beforeEach(async () => {
  await db.recursiveDelete(db.collection('reports'));
  await db.recursiveDelete(db.collection('listings'));
  await db.doc('listings/l1').set({ userId: 'owner', status: 'active' });
});
afterAll(async () => {
  await db.recursiveDelete(db.collection('reports'));
  await db.recursiveDelete(db.collection('listings'));
});

describe('submitReport', () => {
  it('files a report on a listing for review', async () => {
    await expect(report({ details: '  Asked me to pay first  ' })).resolves.toEqual({
      reportId: 'reporter_listing_l1',
    });
    const saved = (await db.doc('reports/reporter_listing_l1').get()).data();
    expect(saved).toEqual({
      reporterId: 'reporter',
      targetType: 'listing',
      targetId: 'l1',
      reason: 'scam',
      details: 'Asked me to pay first',
      createdAt: Timestamp.fromDate(NOW),
    });
  });

  it('keeps one report per reporter and listing, updated when sent again', async () => {
    await report({});
    await report({ reason: 'fake_or_damaged' });
    const all = await db.collection('reports').get();
    expect(all.size).toBe(1);
    expect(all.docs[0]?.get('reason')).toBe('fake_or_damaged');
  });

  it('needs a signed-in user and a valid reason', async () => {
    await expect(
      handleSubmitReport(
        undefined,
        { targetType: 'listing', targetId: 'l1', reason: 'scam' },
        { db },
      ),
    ).rejects.toMatchObject({ details: { reason: 'signInRequired' } });
    await expect(report({ reason: 'boring' })).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
    await expect(report({ details: 'x'.repeat(1001) })).rejects.toMatchObject({
      details: { reason: 'invalidInput' },
    });
  });

  it('refuses a listing that does not exist, or your own', async () => {
    await expect(report({ targetId: 'nope' })).rejects.toMatchObject({
      details: { reason: 'notFound' },
    });
    await expect(report({}, 'owner')).rejects.toMatchObject({ details: { reason: 'ownTarget' } });
  });

  it('does not take other targets until their screens exist (#37)', async () => {
    await expect(report({ targetType: 'user', targetId: 'owner' })).rejects.toMatchObject({
      details: { reason: 'notSupported' },
    });
  });

  it(`allows ${REPORTS_PER_DAY} new reports a day, then refuses; updates still go through`, async () => {
    const batch = db.batch();
    for (let i = 0; i < REPORTS_PER_DAY; i++) {
      await db.doc(`listings/x${i}`).set({ userId: 'owner', status: 'active' });
      batch.set(db.doc(`reports/reporter_listing_x${i}`), {
        reporterId: 'reporter',
        createdAt: Timestamp.fromMillis(NOW.getTime() - 60_000),
      });
    }
    // An old one doesn't count.
    batch.set(db.doc('reports/reporter_listing_old'), {
      reporterId: 'reporter',
      createdAt: Timestamp.fromMillis(NOW.getTime() - 25 * 60 * 60 * 1000),
    });
    await batch.commit();
    await expect(report({})).rejects.toMatchObject({ details: { reason: 'rateLimited' } });
    await expect(report({ targetId: 'x0', reason: 'spam' })).resolves.toBeDefined();
    await expect(report({}, 'someone_else')).resolves.toBeDefined();
  });
});
