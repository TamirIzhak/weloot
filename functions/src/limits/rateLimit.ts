import { type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { limitsConfigSchema } from '@weloot/shared';

// Per-user rate limits for callables (PRD §12, #38). A sliding window per user and action, kept server-side in
// `rateLimits/{uid}_{action}` (denied to clients), checked and recorded in one transaction. Over the limit the
// call fails with `resource-exhausted` / `rateLimited`, which the app shows as "try again later".

export type Limit = { max: number; windowMs: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Generous limits for honest use, tight enough to stop scripts and spam. */
export const LIMITS = {
  startConversation: { max: 30, windowMs: DAY },
  sendMessage: { max: 60, windowMs: 10 * MINUTE },
  sendOffer: { max: 40, windowMs: HOUR },
  lookupBarcode: { max: 60, windowMs: HOUR },
} as const satisfies Record<string, Limit>;
export type LimitedAction = keyof typeof LIMITS;

/** Accounts younger than this count as new (PRD §12: new accounts get fewer new conversations per day). */
export const NEW_ACCOUNT_MS = 7 * DAY;
export const DEFAULT_NEW_ACCOUNT_CONVERSATIONS_PER_DAY = 5;

/**
 * Records one use of `action` by `uid` at `now`, or throws `rateLimited` when the window is full. Timestamps outside
 * the window are dropped, so the doc stays small.
 */
export async function consume(
  db: Firestore,
  uid: string,
  action: string,
  limit: Limit,
  now: Date = new Date(),
): Promise<void> {
  const ref = db.collection('rateLimits').doc(`${uid}_${action}`);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const since = now.getTime() - limit.windowMs;
    const recent = ((snapshot.get('hits') as number[] | undefined) ?? []).filter((t) => t > since);
    if (recent.length >= limit.max) {
      throw new HttpsError('resource-exhausted', `Too many ${action}`, { reason: 'rateLimited' });
    }
    tx.set(ref, { hits: [...recent, now.getTime()], updatedAt: now });
  });
}

/** The limit for one action and user; new accounts start fewer conversations a day (config/limits). */
export async function limitFor(
  db: Firestore,
  uid: string,
  action: LimitedAction,
  now: Date = new Date(),
): Promise<Limit> {
  if (action !== 'startConversation') return LIMITS[action];
  const [profile, config] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.doc('config/limits').get(),
  ]);
  const created = (profile.get('createdAt') as { toMillis(): number } | undefined)?.toMillis();
  const isNew = created === undefined || now.getTime() - created < NEW_ACCOUNT_MS;
  if (!isNew) return LIMITS.startConversation;
  const parsed = limitsConfigSchema.partial().safeParse(config.data() ?? {});
  const max =
    (parsed.success ? parsed.data.newAccountConversationsPerDay : undefined) ??
    DEFAULT_NEW_ACCOUNT_CONVERSATIONS_PER_DAY;
  return { max, windowMs: DAY };
}

/** Checks and records one use, with the right limit for this user. */
export async function rateLimit(
  db: Firestore,
  uid: string,
  action: LimitedAction,
  now: Date = new Date(),
): Promise<void> {
  await consume(db, uid, action, await limitFor(db, uid, action, now), now);
}
