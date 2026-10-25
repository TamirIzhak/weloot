import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import {
  MAX_PUSH_TOKENS,
  pushTokenInputSchema,
  wantsNotification,
  type NotificationKind,
  type SystemEvent,
} from '@weloot/shared';

// Push notifications (PRD §10, #27): localized server-side in each recipient's language, only for the kinds they
// keep on, to the devices they registered. Chat pushes collapse per conversation.

export type Push = {
  title: string;
  body: string;
  /** Where a tap goes (read by the app). */
  data: Record<string, string>;
  /** Pushes with the same key replace each other on the device (one per conversation). */
  collapseKey?: string;
};

/** Sends to devices; reports tokens the push service no longer knows, so they're forgotten. */
export type PushSender = {
  send(tokens: string[], push: Push): Promise<{ invalidTokens: string[] }>;
};

type Language = 'en' | 'he';

const TEXT: Record<string, Record<Language, string>> = {
  newMessageTitle: { en: '{name}', he: '{name}' },
  newOfferTitle: { en: 'New offer from {name}', he: 'הצעה חדשה מ־{name}' },
  counterTitle: { en: 'Counter-offer from {name}', he: 'הצעה נגדית מ־{name}' },
  questionTitle: { en: '{name} asked about {game}', he: '{name} שאל/ה על {game}' },
  offerBody: { en: 'For {game}. Tap to see it.', he: 'על {game}. הקישו כדי לראות.' },
  offer_accepted: {
    en: '{name} accepted your offer. It’s a deal!',
    he: '{name} אישר/ה את ההצעה שלך. יש עסקה!',
  },
  offer_declined: { en: '{name} declined your offer.', he: '{name} דחה/תה את ההצעה שלך.' },
  offer_withdrawn: { en: '{name} withdrew their offer.', he: '{name} ביטל/ה את ההצעה.' },
  offer_expired: { en: 'Your offer for {game} expired.', he: 'תוקף ההצעה שלך על {game} פג.' },
  offer_invalidated: {
    en: 'Your offer for {game} was declined: a game in it is no longer available.',
    he: 'ההצעה שלך על {game} נדחתה: אחד המשחקים בה כבר לא זמין.',
  },
  deal_confirmed: { en: 'Did you swap {game} with {name}?', he: 'החלפת את {game} עם {name}?' },
  deal_completed: { en: 'Swap completed with {name}. Nice!', he: 'ההחלפה עם {name} הושלמה!' },
  deal_cancelled: { en: 'The deal for {game} was cancelled.', he: 'העסקה על {game} בוטלה.' },
  deal_disputed: {
    en: 'The swap for {game} was reported as not happening. Support will look into it.',
    he: 'דווח שההחלפה על {game} לא קרתה. התמיכה תבדוק.',
  },
  deal_unconfirmed: {
    en: 'The swap for {game} wasn’t confirmed in 7 days, so it doesn’t count.',
    he: 'ההחלפה על {game} לא אושרה תוך 7 ימים, ולכן לא נספרת.',
  },
  deal_swap_reminder: { en: 'Did the swap of {game} happen?', he: 'ההחלפה של {game} קרתה?' },
  deal_confirm_reminder: {
    en: 'Confirm your swap of {game} with {name}, so it counts for you both.',
    he: 'אשרו את ההחלפה של {game} עם {name}, כדי שתיספר לשניכם.',
  },
  appTitle: { en: 'WeLoot', he: 'WeLoot' },
};

function text(key: string, language: Language, values: Record<string, string>): string {
  let out = TEXT[key]?.[language] ?? TEXT[key]?.en ?? '';
  for (const [k, v] of Object.entries(values)) out = out.split(`{${k}}`).join(v);
  return out;
}

/**
 * Sends one push to a user if they keep that kind on and have a device registered. Returns whether it was sent.
 * Unknown tokens are removed from their settings.
 */
export async function notifyUser(
  db: Firestore,
  sender: PushSender,
  uid: string,
  kind: NotificationKind,
  build: (language: Language) => Omit<Push, 'data' | 'collapseKey'>,
  data: Record<string, string>,
  collapseKey?: string,
): Promise<boolean> {
  const ref = db.collection('users').doc(uid).collection('private').doc('settings');
  const settings = await ref.get();
  const tokens = ((settings.get('fcmTokens') as string[] | undefined) ?? []).filter(Boolean);
  if (tokens.length === 0) return false;
  if (
    !wantsNotification(
      settings.get('notificationPrefs') as Record<string, boolean> | undefined,
      kind,
    )
  ) {
    return false;
  }
  const language: Language = settings.get('preferredLanguage') === 'he' ? 'he' : 'en';
  try {
    const { invalidTokens } = await sender.send(tokens, {
      ...build(language),
      data,
      ...(collapseKey ? { collapseKey } : {}),
    });
    if (invalidTokens.length > 0) {
      await ref.update({ fcmTokens: FieldValue.arrayRemove(...invalidTokens) });
    }
    return true;
  } catch (error) {
    logger.warn('notifications: push failed', { uid, kind, error: String(error) });
    return false;
  }
}

/** Remembers this device for pushes (newest kept first, at most 10 devices). */
export async function handleRegisterPushToken(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: { db: Firestore },
): Promise<{ ok: true }> {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first', { reason: 'signInRequired' });
  const parsed = pushTokenInputSchema.safeParse(data);
  if (!parsed.success)
    throw new HttpsError('invalid-argument', 'Invalid token', { reason: 'invalidInput' });
  const ref = deps.db.collection('users').doc(auth.uid).collection('private').doc('settings');
  await deps.db.runTransaction(async (tx) => {
    const settings = await tx.get(ref);
    if (!settings.exists) return;
    const current = ((settings.get('fcmTokens') as string[] | undefined) ?? []).filter(
      (t) => t !== parsed.data.token,
    );
    tx.update(ref, { fcmTokens: [parsed.data.token, ...current].slice(0, MAX_PUSH_TOKENS) });
  });
  return { ok: true };
}

/** Forgets this device (signing out). */
export async function handleUnregisterPushToken(
  auth: CallableRequest['auth'],
  data: unknown,
  deps: { db: Firestore },
): Promise<{ ok: true }> {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first', { reason: 'signInRequired' });
  const parsed = pushTokenInputSchema.safeParse(data);
  if (!parsed.success)
    throw new HttpsError('invalid-argument', 'Invalid token', { reason: 'invalidInput' });
  const ref = deps.db.collection('users').doc(auth.uid).collection('private').doc('settings');
  if ((await ref.get()).exists)
    await ref.update({ fcmTokens: FieldValue.arrayRemove(parsed.data.token) });
  return { ok: true };
}

type Message = {
  senderId: string;
  type: 'text' | 'offer' | 'system' | 'safety_tips';
  text?: string;
  offerId?: string;
  event?: SystemEvent;
};

const OFFER_EVENT_TO: Partial<Record<SystemEvent, 'fromUid' | 'toUid'>> = {
  offer_accepted: 'fromUid',
  offer_declined: 'fromUid',
  offer_expired: 'fromUid',
  offer_invalidated: 'fromUid',
  offer_withdrawn: 'toUid',
};
/** Deal events: everyone, or only those who still have to confirm. */
const DEAL_EVENT_TO: Partial<Record<SystemEvent, 'both' | 'pending'>> = {
  deal_confirmed: 'pending',
  deal_confirm_reminder: 'pending',
  deal_completed: 'both',
  deal_cancelled: 'both',
  deal_disputed: 'both',
  deal_unconfirmed: 'both',
  deal_swap_reminder: 'both',
};

/**
 * A chat message was written (by a callable or a scheduler): push it to whoever it concerns (PRD §10). Texts and
 * offers go to the other participant; offer and deal events to the people they're about.
 */
export async function notifyForMessage(
  deps: { db: Firestore; sender: PushSender },
  conversationId: string,
  message: Message,
): Promise<number> {
  const { db, sender } = deps;
  const conversation = await db.collection('conversations').doc(conversationId).get();
  if (!conversation.exists) return 0;
  const participants = (conversation.get('participants') as string[] | undefined) ?? [];
  const game = (conversation.get('listingTitle') as string | undefined) ?? 'WeLoot';
  const usernames = new Map<string, string>();
  const nameOf = async (uid: string) => {
    if (!usernames.has(uid)) {
      usernames.set(
        uid,
        ((await db.collection('users').doc(uid).get()).get('username') as string) ?? '',
      );
    }
    return usernames.get(uid) ?? '';
  };
  const data = { type: 'conversation', conversationId };
  const otherOf = (uid: string) => participants.find((p) => p !== uid) ?? '';
  let sent = 0;
  const push = async (
    to: string,
    kind: NotificationKind,
    build: (language: Language) => Omit<Push, 'data' | 'collapseKey'>,
  ) => {
    if (to && (await notifyUser(db, sender, to, kind, build, data, conversationId))) sent++;
  };

  if (message.type === 'text' && message.text) {
    const name = await nameOf(message.senderId);
    const body = message.text.length > 120 ? `${message.text.slice(0, 117)}…` : message.text;
    await push(otherOf(message.senderId), 'messages', (lang) => ({
      title: text('newMessageTitle', lang, { name }),
      body,
    }));
    return sent;
  }

  if (message.type === 'offer' && message.offerId) {
    const offer = await conversation.ref.collection('offers').doc(message.offerId).get();
    const to = offer.get('toUid') as string | undefined;
    const name = await nameOf(message.senderId);
    const counter = Boolean(offer.get('supersedesOfferId'));
    if (to) {
      await push(to, 'offers', (lang) => ({
        title: text(counter ? 'counterTitle' : 'newOfferTitle', lang, { name }),
        body: text('offerBody', lang, { game }),
      }));
    }
    return sent;
  }

  if (message.type !== 'system' || !message.event) return sent;
  const event = message.event;
  const offerSide = OFFER_EVENT_TO[event];
  if (offerSide && message.offerId) {
    const offer = await conversation.ref.collection('offers').doc(message.offerId).get();
    const to = offer.get(offerSide) as string | undefined;
    if (to) {
      const name = await nameOf(otherOf(to));
      await push(to, 'offers', (lang) => ({
        title: text('appTitle', lang, {}),
        body: text(event, lang, { name, game }),
      }));
    }
    return sent;
  }
  const dealSide = DEAL_EVENT_TO[event];
  if (dealSide) {
    const confirmedBy = (conversation.get('deal.confirmedBy') as string[] | undefined) ?? [];
    const recipients =
      dealSide === 'both' ? participants : participants.filter((p) => !confirmedBy.includes(p));
    for (const to of recipients) {
      const name = await nameOf(otherOf(to));
      await push(to, 'deals', (lang) => ({
        title: text('appTitle', lang, {}),
        body: text(event, lang, { name, game }),
      }));
    }
  }
  return sent;
}

/** The PushSender over FCM (Admin SDK messaging). */
export function fcmSender(messaging: {
  sendEachForMulticast(message: {
    tokens: string[];
    notification: { title: string; body: string };
    data: Record<string, string>;
    android?: { collapseKey?: string; notification?: { tag?: string } };
    apns?: { headers?: Record<string, string>; payload?: { aps: { threadId?: string } } };
  }): Promise<{ responses: { success: boolean; error?: { code?: string } }[] }>;
}): PushSender {
  return {
    async send(tokens, push) {
      const result = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: push.title, body: push.body },
        data: push.data,
        ...(push.collapseKey
          ? {
              android: { collapseKey: push.collapseKey, notification: { tag: push.collapseKey } },
              apns: {
                headers: { 'apns-collapse-id': push.collapseKey.slice(0, 64) },
                payload: { aps: { threadId: push.collapseKey } },
              },
            }
          : {}),
      });
      const invalidTokens = tokens.filter((_, i) => {
        const code = result.responses[i]?.error?.code;
        return (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        );
      });
      return { invalidTokens };
    },
  };
}
