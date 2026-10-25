import { z } from 'zod';

import { offerInputSchema, type OfferDoc } from './schemas';

// Conversations, offers and deals (PRD W5, #23): what the app sends to the callables, and the shapes they share.
// Status fields are server-only; every change goes through these functions and the state machines.

const id = z.string().min(1).max(128);

/** One conversation per (listing, interested user) (PRD W5): its ID is derived, so starting twice finds it again. */
export function conversationIdFor(listingId: string, interestedUid: string): string {
  return `${listingId}_${interestedUid}`;
}

export const MESSAGE_TEXT_MAX = 2000;

export const startConversationInputSchema = z.discriminatedUnion('opener', [
  z.object({
    listingId: id,
    opener: z.literal('question'),
    text: z.string().trim().min(1).max(MESSAGE_TEXT_MAX),
  }),
  z.object({ listingId: id, opener: z.literal('offer'), offer: offerInputSchema }),
]);
export type StartConversationInput = z.infer<typeof startConversationInputSchema>;
export type StartConversationResult = { conversationId: string; created: boolean };

export const sendMessageInputSchema = z.object({
  conversationId: id,
  text: z.string().trim().min(1).max(MESSAGE_TEXT_MAX),
});
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

export const sendOfferInputSchema = z.object({ conversationId: id, offer: offerInputSchema });
export type SendOfferInput = z.infer<typeof sendOfferInputSchema>;
export type SendOfferResult = { offerId: string };

export const OFFER_RESPONSES = ['accept', 'decline', 'withdraw'] as const;
export type OfferResponse = (typeof OFFER_RESPONSES)[number];
export const respondToOfferInputSchema = z.object({
  conversationId: id,
  offerId: id,
  action: z.enum(OFFER_RESPONSES),
});
export type RespondToOfferInput = z.infer<typeof respondToOfferInputSchema>;

export const markReadInputSchema = z.object({ conversationId: id });

/** Stable `details.reason` values of the conversation and offer callables. */
export type ConversationError =
  | 'invalidInput'
  | 'listingUnavailable'
  | 'ownListing'
  | 'blocked'
  | 'notFound'
  | 'notParticipant'
  | 'itemNotYours'
  | 'itemNotTheirs'
  | 'notForSale'
  | 'cashPayer'
  | 'offerNotPending'
  | 'notRecipient'
  | 'notSender'
  | 'notLatestOffer'
  | 'offerExpired'
  | 'dealExists';

/**
 * System messages carry an event code, not text, so each participant reads them in their own language (PRD §3.5).
 */
export const SYSTEM_EVENTS = [
  'offer_countered',
  'offer_accepted',
  'offer_declined',
  'offer_withdrawn',
  'offer_expired',
  'offer_invalidated',
] as const;
export type SystemEvent = (typeof SYSTEM_EVENTS)[number];

/** What an offer shows of one game (copied at send time; see `offerSchema.items`). */
export type OfferItem = OfferDoc['items'][string];
