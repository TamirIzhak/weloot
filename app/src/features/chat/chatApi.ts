import {
  collection,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
} from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import { messageSchema, offerSchema, type MessageDoc } from '@weloot/shared';

import type { Offer } from '@/features/offers/offersApi';

// A conversation's messages and offers (PRD W5): participants read them live; only Cloud Functions write them.

export type Message = MessageDoc & { id: string };

/** The newest messages a conversation shows. */
export const MESSAGES_SHOWN = 200;

/** Messages, newest first (for an inverted list). `null` while loading. */
export function useMessages(conversationId: string): Message[] | null {
  const [state, setState] = useState<{ id: string; messages: Message[] } | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(
        collection(getFirestore(), 'conversations', conversationId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(MESSAGES_SHOWN),
      ),
      (snapshot) => {
        const messages = snapshot.docs.flatMap((d) => {
          const parsed = messageSchema.safeParse(d.data({ serverTimestamps: 'estimate' }));
          return parsed.success ? [{ ...parsed.data, id: d.id }] : [];
        });
        setState({ id: conversationId, messages });
      },
      () => setState({ id: conversationId, messages: [] }),
    );
  }, [conversationId]);

  return state?.id === conversationId ? state.messages : null;
}

/** Every offer of a conversation by ID, so each offer card reads from one listener. */
export function useOffers(conversationId: string): ReadonlyMap<string, Offer> {
  const [state, setState] = useState<{ id: string; offers: Map<string, Offer> } | null>(null);

  useEffect(() => {
    return onSnapshot(
      collection(getFirestore(), 'conversations', conversationId, 'offers'),
      (snapshot) => {
        const offers = new Map<string, Offer>();
        for (const d of snapshot.docs) {
          const parsed = offerSchema.safeParse(d.data({ serverTimestamps: 'estimate' }));
          if (parsed.success) offers.set(d.id, { ...parsed.data, id: d.id });
        }
        setState({ id: conversationId, offers });
      },
      () => setState({ id: conversationId, offers: new Map() }),
    );
  }, [conversationId]);

  return state?.id === conversationId ? state.offers : EMPTY;
}

const EMPTY: ReadonlyMap<string, Offer> = new Map();
