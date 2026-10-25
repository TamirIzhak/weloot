import type { Firestore } from 'firebase-admin/firestore';

import { findCity, listingSchema, PLATFORMS } from '@weloot/shared';

// Shared-link landing page (PRD W7, #50): `https://<hosting-domain>/l/{listingId}` via a Hosting rewrite. It shows
// the game's cover, title, platform and condition, the owner's username and area only, and links into the app.
// Never a phone number, an exact location, or anything of a listing that isn't active.

type Language = 'en' | 'he';

const TEXT = {
  en: {
    open: 'Open in WeLoot',
    soon: 'WeLoot is coming soon to Google Play and the App Store.',
    gone: 'This listing isn’t available anymore.',
    goneBody: 'Open WeLoot to find other copies near you.',
    trade: 'For trade',
    sale: 'For sale',
    by: 'Listed by {user} · {area}',
    conditions: {
      new_sealed: 'New, sealed',
      like_new: 'Like new',
      good: 'Good',
      acceptable: 'Acceptable',
    },
    tagline: 'Swap the games you’ve finished for the ones you want.',
  },
  he: {
    open: 'פתיחה ב־WeLoot',
    soon: 'WeLoot תגיע בקרוב ל־Google Play ול־App Store.',
    gone: 'המודעה כבר לא זמינה.',
    goneBody: 'פתחו את WeLoot כדי למצוא עותקים אחרים לידכם.',
    trade: 'להחלפה',
    sale: 'למכירה',
    by: 'פורסם על ידי {user} · {area}',
    conditions: { new_sealed: 'חדש באריזה', like_new: 'כמו חדש', good: 'טוב', acceptable: 'סביר' },
    tagline: 'מחליפים משחקים שסיימתם במשחקים שאתם רוצים.',
  },
} as const;

/** HTML-escapes text placed in the page (titles and usernames come from users). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Hebrew for Hebrew-speaking browsers, English otherwise. */
export function languageOf(acceptLanguage: string | undefined): Language {
  return /^\s*he\b|,\s*he\b|iw/i.test(acceptLanguage ?? '') ? 'he' : 'en';
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The landing page for a listing ID; a plain "not available" page for anything else. */
export async function renderListingPage(
  db: Firestore,
  listingId: string,
  language: Language,
): Promise<{ status: number; html: string }> {
  const t = TEXT[language];
  const appLink = `weloot://listings/${encodeURIComponent(listingId)}`;
  const page = (title: string, body: string, image?: string) => `<!doctype html>
<html lang="${language}" dir="${language === 'he' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · WeLoot</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(t.tagline)}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
<style>
body{margin:0;background:#121212;color:#f5f5f5;font-family:system-ui,-apple-system,"Segoe UI",Rubik,sans-serif}
main{max-width:420px;margin:0 auto;padding:24px 16px;display:flex;flex-direction:column;gap:12px}
img{width:180px;aspect-ratio:3/4;object-fit:cover;border-radius:12px;align-self:center;background:#1e1e1e}
h1{font-size:22px;margin:8px 0 0}.muted{color:#a0a0a0;font-size:14px}.chip{display:inline-block;background:#2a2a2a;border-radius:999px;padding:4px 10px;font-size:13px}
a.button{display:block;text-align:center;padding:14px;border-radius:12px;background:#7c4dff;color:#fff;text-decoration:none;font-weight:600}
a.secondary{background:#2a2a2a}
</style>
</head>
<body><main>${body}
<a class="button" href="${appLink}">${escapeHtml(t.open)}</a>
<p class="muted">${escapeHtml(t.soon)}</p>
</main></body></html>`;

  const gone = () => ({
    status: 404,
    html: page(
      t.gone,
      `<h1>${escapeHtml(t.gone)}</h1><p class="muted">${escapeHtml(t.goneBody)}</p>`,
    ),
  });
  if (!ID.test(listingId)) return gone();
  const snapshot = await db.collection('listings').doc(listingId).get();
  const parsed = listingSchema.safeParse(snapshot.data());
  if (!parsed.success || parsed.data.status !== 'active') return gone();
  const listing = parsed.data;
  const owner = (await db.collection('users').doc(listing.userId).get()).get('username') as
    string | undefined;
  const city = listing.location.cityId ? findCity(listing.location.cityId) : undefined;
  const area = city?.[language] ?? listing.location.areaName;
  const cover = listing.coverImageId
    ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${listing.coverImageId}.jpg`
    : undefined;
  const offer = [listing.isForTrade ? t.trade : null, listing.isForSale ? t.sale : null]
    .filter(Boolean)
    .join(' · ');
  const body = `${cover ? `<img src="${escapeHtml(cover)}" alt="">` : ''}
<h1>${escapeHtml(listing.gameTitle)}</h1>
<div><span class="chip">${escapeHtml(PLATFORMS[listing.platform].label)}</span> <span class="chip">${escapeHtml(t.conditions[listing.condition])}</span> <span class="chip">${escapeHtml(offer)}</span></div>
<p class="muted">${escapeHtml(t.by.replace('{user}', owner ?? 'WeLoot').replace('{area}', area))}</p>`;
  return { status: 200, html: page(listing.gameTitle, body, cover) };
}
