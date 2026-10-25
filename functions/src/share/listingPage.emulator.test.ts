import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { escapeHtml, languageOf, renderListingPage } from './listingPage';

const db = getFirestore(getApps()[0] ?? initializeApp());
const now = Timestamp.fromMillis(Date.UTC(2026, 9, 25));

function listing(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'owner',
    igdbGameId: 119388,
    platform: 'switch',
    gameTitle: 'Zelda <TOTK>',
    coverImageId: 'co5vmg',
    condition: 'like_new',
    hasCase: true,
    notes: 'Call me on 054-1234567, Herzl 5',
    isForTrade: true,
    isForSale: true,
    askingPriceAgorot: 15000,
    photoPaths: ['listings/l1/0.jpg'],
    hasPhotos: true,
    status: 'active',
    location: {
      lat: 32.0812,
      lng: 34.7812,
      geohash: 'sv8wr',
      areaName: 'Tel Aviv-Yafo',
      cityId: '5000',
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.recursiveDelete(db.collection('listings'));
  await db.recursiveDelete(db.collection('users'));
  await db.doc('users/owner').set({ username: 'dana_games' });
  await db.doc('listings/l1').set(listing());
});
afterAll(async () => {
  await db.recursiveDelete(db.collection('listings'));
  await db.recursiveDelete(db.collection('users'));
});

describe('listing landing page', () => {
  it('shows cover, title, platform, condition, username and area, escaped, with an app link', async () => {
    const { status, html } = await renderListingPage(db, 'l1', 'en');
    expect(status).toBe(200);
    expect(html).toContain('Zelda &lt;TOTK&gt;');
    expect(html).not.toContain('<TOTK>');
    expect(html).toContain('Switch');
    expect(html).toContain('Like new');
    expect(html).toContain('Listed by dana_games');
    expect(html).toContain('t_cover_big/co5vmg.jpg');
    expect(html).toContain('href="weloot://listings/l1"');
  });

  it('never shows personal data: no notes, phone, exact point or photos', async () => {
    const { html } = await renderListingPage(db, 'l1', 'en');
    expect(html).not.toContain('054-1234567');
    expect(html).not.toContain('Herzl');
    expect(html).not.toContain('32.0812');
    expect(html).not.toContain('listings/l1/0.jpg');
  });

  it('shows "not available" for a paused, closed or unknown listing, with nothing of it', async () => {
    for (const status of ['paused', 'traded', 'removed']) {
      await db.doc('listings/l1').set(listing({ status }));
      const page = await renderListingPage(db, 'l1', 'en');
      expect(page.status).toBe(404);
      expect(page.html).toContain('isn’t available anymore');
      expect(page.html).not.toContain('Zelda');
    }
    expect((await renderListingPage(db, 'nope', 'en')).status).toBe(404);
    expect((await renderListingPage(db, '../etc', 'en')).status).toBe(404);
  });

  it('speaks Hebrew to Hebrew browsers, right to left', async () => {
    expect(languageOf('he-IL,he;q=0.9,en;q=0.8')).toBe('he');
    expect(languageOf('en-US,en;q=0.9,he;q=0.5')).toBe('he');
    expect(languageOf('en-US')).toBe('en');
    expect(languageOf(undefined)).toBe('en');
    const { html } = await renderListingPage(db, 'l1', 'he');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('תל אביב');
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });
});
