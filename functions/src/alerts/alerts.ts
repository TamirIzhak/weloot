import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  alertSchema,
  distanceKm,
  findCity,
  limitsConfigSchema,
  listingSchema,
  PLATFORMS,
  snapToArea,
  wantlistItemSchema,
  wantsListing,
  type ListingDoc,
} from '@weloot/shared';

// Alerts (PRD W8, #49): when a listing becomes active (new or reactivated), the people with a matching "Notify me"
// alert or want list item, within their radius, get it in "New for you" and, rate-limited, a push:
// at most 1 push per alert per 6 hours and 5 alert pushes per user per day (Israel time); the rest stay in-app.

export type AlertLimits = { alertPushesPerDay: number; alertCooldownHours: number };
export const DEFAULT_ALERT_LIMITS: AlertLimits = { alertPushesPerDay: 5, alertCooldownHours: 6 };

/** `alertState/{uid}` (server only): today's push count and when each alert last pushed. */
export type AlertState = { day: string; pushes: number; last: Record<string, number> };

/** The calendar day in Israel, e.g. "2026-10-25": the daily push cap resets at local midnight. */
export function israelDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

/** Whether this alert may push now, and the state after it does. */
export function decidePush(
  state: AlertState | undefined,
  alertKey: string,
  now: Date,
  limits: AlertLimits,
): { push: boolean; state: AlertState } {
  const day = israelDay(now);
  const current: AlertState =
    state && state.day === day ? state : { day, pushes: 0, last: state?.last ?? {} };
  const last = current.last[alertKey];
  const cooledDown =
    last === undefined || now.getTime() - last >= limits.alertCooldownHours * 3_600_000;
  if (!cooledDown || current.pushes >= limits.alertPushesPerDay)
    return { push: false, state: current };
  return {
    push: true,
    state: {
      day,
      pushes: current.pushes + 1,
      last: { ...current.last, [alertKey]: now.getTime() },
    },
  };
}

export type AlertPush = {
  uid: string;
  tokens: string[];
  title: string;
  body: string;
  listingId: string;
};

/** Sends pushes (FCM in production; a fake in tests). */
export type Notifier = { send(push: AlertPush): Promise<void> };

const TEXT = {
  en: {
    title: 'New for you on WeLoot',
    body: '{game} ({platform}) was just listed in {area}',
  },
  he: {
    title: 'חדש בשבילך ב־WeLoot',
    body: '{game} ({platform}) פורסם עכשיו ב־{area}',
  },
} as const;

function pushText(listing: ListingDoc, language: 'en' | 'he') {
  const city = listing.location.cityId ? findCity(listing.location.cityId) : undefined;
  const fill = (template: string) =>
    template
      .replace('{game}', listing.gameTitle)
      .replace('{platform}', PLATFORMS[listing.platform].label)
      .replace('{area}', city?.[language] ?? listing.location.areaName);
  return { title: TEXT[language].title, body: fill(TEXT[language].body) };
}

type Candidate = {
  alertKey: string;
  /** "Notify me" alerts carry their own area; want list items use the user's places and search radius. */
  center?: { lat: number; lng: number };
  radiusKm?: number;
};

function isActive(data: unknown): boolean {
  return (data as { status?: unknown } | undefined)?.status === 'active';
}

async function placesOf(db: Firestore, uid: string) {
  const [locations, listings] = await Promise.all([
    db.collection('users').doc(uid).collection('locations').get(),
    db.collection('listings').where('userId', '==', uid).where('status', '==', 'active').get(),
  ]);
  return [...locations.docs, ...listings.docs].flatMap((d) => {
    const lat: unknown = d.get('lat') ?? d.get('location.lat');
    const lng: unknown = d.get('lng') ?? d.get('location.lng');
    return typeof lat === 'number' && typeof lng === 'number' ? [snapToArea(lat, lng)] : [];
  });
}

async function limitsOf(db: Firestore): Promise<AlertLimits> {
  const parsed = limitsConfigSchema
    .partial()
    .safeParse((await db.doc('config/limits').get()).data() ?? {});
  return { ...DEFAULT_ALERT_LIMITS, ...(parsed.success ? parsed.data : {}) };
}

/**
 * A listing was written: if it just became active, deliver it to everyone it alerts. Idempotent per listing and
 * user (the "New for you" doc is the record), so a repeated event never pushes twice.
 */
export async function alertOnListingWrite(
  deps: { db: Firestore; notifier: Notifier; now?: () => Date },
  listingId: string,
  before: unknown,
  after: unknown,
): Promise<number> {
  if (!isActive(after) || isActive(before)) return 0;
  const parsed = listingSchema.safeParse(after);
  if (!parsed.success) return 0;
  const listing = parsed.data;
  const { db } = deps;
  const now = deps.now?.() ?? new Date();

  // Everyone with this game on an alert or the want list (same console, or any).
  const items = await db
    .collectionGroup('items')
    .where('igdbGameId', '==', listing.igdbGameId)
    .get();
  const candidates = new Map<string, Candidate[]>();
  for (const d of items.docs) {
    const owner = d.ref.parent.parent;
    const kind = owner?.parent.id;
    if (!owner || owner.id === listing.userId) continue;
    let candidate: Candidate | null = null;
    if (kind === 'alerts') {
      const alert = alertSchema.safeParse(d.data());
      if (
        alert.success &&
        wantsListing(alert.data, { ...listing, id: listingId, ...listing.location })
      ) {
        candidate = {
          alertKey: `a_${d.id}`,
          radiusKm: alert.data.radiusKm,
          ...(alert.data.lat !== undefined && alert.data.lng !== undefined
            ? { center: { lat: alert.data.lat, lng: alert.data.lng } }
            : {}),
        };
      }
    } else if (kind === 'wantlist') {
      const want = wantlistItemSchema.safeParse(d.data());
      if (
        want.success &&
        wantsListing(want.data, { ...listing, id: listingId, ...listing.location })
      ) {
        candidate = { alertKey: `w_${d.id}` };
      }
    }
    if (candidate) candidates.set(owner.id, [...(candidates.get(owner.id) ?? []), candidate]);
  }
  if (candidates.size === 0) return 0;

  const [limits, ownerSettings] = await Promise.all([
    limitsOf(db),
    db.collection('users').doc(listing.userId).collection('private').doc('settings').get(),
  ]);
  const blockedByOwner = new Set(
    (ownerSettings.get('blockedUserIds') as string[] | undefined) ?? [],
  );
  let delivered = 0;

  for (const [uid, list] of candidates) {
    if (blockedByOwner.has(uid)) continue;
    const settings = await db
      .collection('users')
      .doc(uid)
      .collection('private')
      .doc('settings')
      .get();
    const blocked = (settings.get('blockedUserIds') as string[] | undefined) ?? [];
    if (blocked.includes(listing.userId)) continue;

    // The first of the user's alerts that covers where the listing is.
    let match: Candidate | undefined;
    let places: { lat: number; lng: number }[] | undefined;
    for (const candidate of list) {
      if (candidate.center) {
        if (distanceKm(candidate.center, listing.location) <= (candidate.radiusKm ?? Infinity)) {
          match = candidate;
          break;
        }
        continue;
      }
      places ??= await placesOf(db, uid);
      const radius = (settings.get('searchRadiusKm') as number | undefined) ?? 25;
      // A want list with nowhere to measure from (no address, no listing yet) alerts anywhere in Israel.
      if (places.length === 0 || places.some((p) => distanceKm(p, listing.location) <= radius)) {
        match = candidate;
        break;
      }
    }
    if (!match) continue;
    const alertKey = match.alertKey;

    const tokens = ((settings.get('fcmTokens') as string[] | undefined) ?? []).filter(Boolean);
    const itemRef = db.collection('newForYou').doc(uid).collection('items').doc(listingId);
    const stateRef = db.collection('alertState').doc(uid);
    const pushed = await db.runTransaction(async (tx) => {
      if ((await tx.get(itemRef)).exists) return null;
      const state = (await tx.get(stateRef)).data() as AlertState | undefined;
      const decision = decidePush(state, alertKey, now, limits);
      const push = decision.push && tokens.length > 0;
      tx.set(itemRef, {
        listingId,
        igdbGameId: listing.igdbGameId,
        platform: listing.platform,
        gameTitle: listing.gameTitle,
        areaName: listing.location.areaName,
        ...(listing.location.cityId ? { cityId: listing.location.cityId } : {}),
        alertKey,
        pushed: push,
        createdAt: Timestamp.fromDate(now),
      });
      if (push) tx.set(stateRef, decision.state);
      return push;
    });
    if (pushed === null) continue;
    delivered++;
    if (pushed) {
      const language = settings.get('preferredLanguage') === 'he' ? 'he' : 'en';
      try {
        await deps.notifier.send({ uid, tokens, listingId, ...pushText(listing, language) });
      } catch (error) {
        // It's still in "New for you"; a failed push isn't retried (the count is already spent).
        logger.warn('alerts: push failed', { uid, listingId, error: String(error) });
      }
    }
  }
  return delivered;
}
