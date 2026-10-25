import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { getApp } from '@react-native-firebase/app';
import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { useEffect, useState } from 'react';

import {
  conversationIdFor,
  conversationSchema,
  FIREBASE_REGION,
  listingSchema,
  offerSchema,
  type ConversationDoc,
  type ConversationError,
  type DealActionInput,
  type DealStatus,
  type OfferDoc,
  type OfferInput,
  type RespondToOfferInput,
  type SendMessageInput,
  type StartConversationInput,
  type StartConversationResult,
} from '@weloot/shared';

import type { Listing } from '@/features/listings/useListing';

// Conversations and offers (PRD W5): every change goes through Cloud Functions (#23); the app only reads.

export class OfferError extends Error {
  readonly reason: ConversationError | 'phoneRequired' | 'signInRequired' | 'unknown';
  constructor(reason: OfferError['reason']) {
    super(reason);
    this.reason = reason;
  }
}

function call<I, O>(name: string) {
  const fn = httpsCallable<I, O>(getFunctions(getApp(), FIREBASE_REGION), name);
  return async (input: I): Promise<O> => {
    try {
      return (await fn(input)).data;
    } catch (error) {
      const reason = (error as { details?: { reason?: unknown } } | null)?.details?.reason;
      throw new OfferError(
        typeof reason === 'string' ? (reason as OfferError['reason']) : 'unknown',
      );
    }
  };
}

function track(event: string, params: Record<string, string | number | boolean>) {
  try {
    logEvent(getAnalytics(), event, params);
  } catch {
    // Analytics never blocks the flow.
  }
}

const offerParams = (offer: OfferInput) => ({
  games_from: offer.itemsFrom.length,
  games_to: offer.itemsTo.length,
  with_cash: offer.cashAgorot > 0,
});

/** "Make an offer" / "Ask a question" on a game page. */
export async function startConversation(
  input: StartConversationInput,
): Promise<StartConversationResult> {
  const result = await call<StartConversationInput, StartConversationResult>('startConversation')(
    input,
  );
  if (result.created) track('conversation_started', { opener: input.opener });
  if (input.opener === 'offer') track('offer_sent', offerParams(input.offer));
  return result;
}

/** An offer in an existing conversation; `counter` when it answers the other side's pending offer. */
export async function sendOffer(conversationId: string, offer: OfferInput, counter: boolean) {
  const result = await call<{ conversationId: string; offer: OfferInput }, { offerId: string }>(
    'sendOffer',
  )({ conversationId, offer });
  track(counter ? 'offer_countered' : 'offer_sent', offerParams(offer));
  return result;
}

export async function respondToOffer(input: RespondToOfferInput) {
  const result = await call<RespondToOfferInput, { status: string }>('respondToOffer')(input);
  if (input.action === 'accept') track('offer_accepted', {});
  return result;
}

export const sendMessage = call<SendMessageInput, { ok: true }>('sendMessage');
export const markConversationRead = call<{ conversationId: string }, { ok: true }>(
  'markConversationRead',
);

/**
 * Whether the viewer already has a conversation about this listing (then the game page shows "Open chat"). A
 * conversation that doesn't exist can't be read under the rules, so a permission error means "none yet".
 */
export function useConversationFor(
  listingId: string,
  uid: string | undefined,
): 'loading' | 'none' | string {
  const id = uid ? conversationIdFor(listingId, uid) : '';
  const [state, setState] = useState<{ id: string; exists: boolean } | null>(null);

  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(getFirestore(), 'conversations', id),
      (snapshot) => setState({ id, exists: snapshot.exists() }),
      () => setState({ id, exists: false }),
    );
  }, [id]);

  if (!id) return 'none';
  if (state?.id !== id) return 'loading';
  return state.exists ? id : 'none';
}

/** Someone's active listings, newest first (public): the games an offer can include. */
export function useActiveListingsOf(uid: string | undefined): Listing[] | null {
  const [state, setState] = useState<{ uid: string; listings: Listing[] } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(
        collection(getFirestore(), 'listings'),
        where('userId', '==', uid),
        where('status', '==', 'active'),
      ),
      (snapshot) => {
        const listings = snapshot.docs.flatMap((d) => {
          const parsed = listingSchema.safeParse(d.data({ serverTimestamps: 'estimate' }));
          return parsed.success ? [{ ...parsed.data, id: d.id }] : [];
        });
        listings.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        setState({ uid, listings });
      },
      () => setState({ uid, listings: [] }),
    );
  }, [uid]);

  if (!uid) return [];
  return state?.uid === uid ? state.listings : null;
}

export type Offer = OfferDoc & { id: string };

/** One offer of a conversation (participants only), e.g. to prefill a counter-offer. */
export function useOffer(
  conversationId: string | undefined,
  offerId: string | undefined,
): Offer | null {
  const key = conversationId && offerId ? `${conversationId}/${offerId}` : '';
  const [state, setState] = useState<{ key: string; offer: Offer | null } | null>(null);

  useEffect(() => {
    if (!key || !conversationId || !offerId) return;
    return onSnapshot(
      doc(getFirestore(), 'conversations', conversationId, 'offers', offerId),
      (snapshot) => {
        const parsed = offerSchema.safeParse(snapshot.data({ serverTimestamps: 'estimate' }));
        setState({ key, offer: parsed.success ? { ...parsed.data, id: offerId } : null });
      },
      () => setState({ key, offer: null }),
    );
  }, [key, conversationId, offerId]);

  return state?.key === key ? state.offer : null;
}

export type Conversation = ConversationDoc & { id: string };

/** A conversation the viewer takes part in (rules: participants only). */
export function useConversation(
  conversationId: string | undefined,
): Conversation | null | 'loading' {
  const [state, setState] = useState<{ id: string; value: Conversation | null } | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    return onSnapshot(
      doc(getFirestore(), 'conversations', conversationId),
      (snapshot) => {
        const parsed = conversationSchema.safeParse(
          snapshot.data({ serverTimestamps: 'estimate' }),
        );
        setState({
          id: conversationId,
          value: parsed.success ? { ...parsed.data, id: conversationId } : null,
        });
      },
      () => setState({ id: conversationId, value: null }),
    );
  }, [conversationId]);

  if (!conversationId) return null;
  return state?.id === conversationId ? state.value : 'loading';
}

/** Deal header and banner actions (PRD W6, #47): confirm the swap, say it didn't happen, or cancel. */
export async function dealAction(input: DealActionInput): Promise<{ status: DealStatus }> {
  const result = await call<DealActionInput, { status: DealStatus }>('dealAction')(input);
  const event =
    result.status === 'completed'
      ? 'deal_completed'
      : input.action === 'confirm'
        ? 'deal_confirmed'
        : input.action === 'dispute'
          ? 'deal_disputed'
          : 'deal_cancelled';
  track(event, {});
  return result;
}

/** Conversations shown at a time (inbox, "Who with?"). */
export const CONVERSATIONS_SHOWN = 100;

/** The user's conversations, most recently active first. */
export function useMyConversations(uid: string | undefined): Conversation[] | null {
  const [state, setState] = useState<{ uid: string; list: Conversation[] } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(
        collection(getFirestore(), 'conversations'),
        where('participants', 'array-contains', uid),
        orderBy('updatedAt', 'desc'),
        limit(CONVERSATIONS_SHOWN),
      ),
      (snapshot) => {
        const list = snapshot.docs.flatMap((d) => {
          const parsed = conversationSchema.safeParse(d.data({ serverTimestamps: 'estimate' }));
          return parsed.success ? [{ ...parsed.data, id: d.id }] : [];
        });
        setState({ uid, list });
      },
      () => setState({ uid, list: [] }),
    );
  }, [uid]);

  if (!uid) return [];
  return state?.uid === uid ? state.list : null;
}
