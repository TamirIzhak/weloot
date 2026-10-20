import { createMachine } from './stateMachine';

// State machines from PRD §7 (v3 + owner-controlled closing, 2026-10-20). Functions enforce them; the app uses
// them to decide which actions to show.

// ─── Listing ──────────────────────────────────────────────────────────────────────────────────────────────

export const LISTING_STATUSES = [
  'draft',
  'active',
  'paused',
  'reserved',
  'traded',
  'sold',
  'removed',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const listingMachine = createMachine('listing', LISTING_STATUSES, {
  publish: { from: ['draft'], to: 'active' },
  pause: { from: ['active'], to: 'paused' },
  resume: { from: ['paused'], to: 'active' },
  /** An offer that includes the listing is accepted (system). */
  reserve: { from: ['active'], to: 'reserved' },
  /** The deal holding it is cancelled (system). */
  release: { from: ['reserved'], to: 'active' },
  /** Owner taps "Swapped": closes immediately, whoever it was with (W6). */
  closeTraded: { from: ['active', 'paused', 'reserved'], to: 'traded' },
  /** Owner taps "Sold". */
  closeSold: { from: ['active', 'paused', 'reserved'], to: 'sold' },
  remove: { from: ['draft', 'active', 'paused'], to: 'removed' },
});
export type ListingEvent = (typeof listingMachine.events)[number];

/** Listings visible in search, matches and alerts. */
export function isListingDiscoverable(status: ListingStatus): boolean {
  return status === 'active';
}

// ─── Offer ────────────────────────────────────────────────────────────────────────────────────────────────

export const OFFER_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'superseded',
  'withdrawn',
  'expired',
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/** Pending offers expire after this long without a response (PRD W5; config/limits may override). */
export const OFFER_EXPIRY_HOURS = 72;

export const offerMachine = createMachine('offer', OFFER_STATUSES, {
  accept: { from: ['pending'], to: 'accepted' },
  decline: { from: ['pending'], to: 'declined' },
  /** The recipient sends a counter-offer; the new offer becomes the pending one. */
  counter: { from: ['pending'], to: 'superseded' },
  withdraw: { from: ['pending'], to: 'withdrawn' },
  expire: { from: ['pending'], to: 'expired' },
  /** A listing in the offer was reserved by another deal, closed or removed (system). */
  invalidate: { from: ['pending'], to: 'declined' },
});
export type OfferEvent = (typeof offerMachine.events)[number];

// ─── Deal ─────────────────────────────────────────────────────────────────────────────────────────────────

export const DEAL_STATUSES = [
  'agreed',
  'awaiting_confirmation',
  'completed',
  'cancelled',
  'unconfirmed',
  'disputed',
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

/** Days the second participant has to confirm before the deal becomes `unconfirmed` (PRD W6). */
export const DEAL_CONFIRMATION_DAYS = 7;

export const dealMachine = createMachine('deal', DEAL_STATUSES, {
  firstConfirm: { from: ['agreed'], to: 'awaiting_confirmation' },
  secondConfirm: { from: ['awaiting_confirmation'], to: 'completed' },
  cancel: { from: ['agreed'], to: 'cancelled' },
  expire: { from: ['awaiting_confirmation'], to: 'unconfirmed' },
  dispute: { from: ['awaiting_confirmation'], to: 'disputed' },
  resolveCompleted: { from: ['disputed'], to: 'completed' },
  resolveCancelled: { from: ['disputed'], to: 'cancelled' },
});
export type DealEvent = (typeof dealMachine.events)[number];

/** How a deal came to exist: an accepted offer, or an owner's "Swapped" naming a chat partner (W6). */
export type DealOrigin = 'offer' | 'ownerSwap';

/** Initial deal state: an owner's "Swapped" already counts as the first confirmation. */
export function initialDeal(origin: DealOrigin, ownerUid: string): DealConfirmationState {
  return origin === 'offer'
    ? { status: 'agreed', confirmedBy: [] }
    : { status: 'awaiting_confirmation', confirmedBy: [ownerUid] };
}

export type DealConfirmationState = { status: DealStatus; confirmedBy: readonly string[] };

/** Rejects actions by someone who isn't one of the deal's two participants, or that don't fit the deal state. */
export class DealActionError extends Error {
  readonly reason: 'not_participant' | 'already_confirmed' | 'own_confirmation';

  constructor(reason: DealActionError['reason'], message: string) {
    super(message);
    this.name = 'DealActionError';
    this.reason = reason;
  }
}

function assertParticipant(participants: readonly [string, string], uid: string): void {
  if (!participants.includes(uid)) {
    throw new DealActionError('not_participant', `${uid} is not a participant of this deal`);
  }
}

/**
 * A participant confirms the swap ("Swapped" / "Yes, we swapped"). The first confirmation moves the deal to
 * `awaiting_confirmation`; the second, by the other participant, completes it. Each participant confirms once.
 */
export function applyConfirmation(
  deal: DealConfirmationState,
  participants: readonly [string, string],
  uid: string,
): DealConfirmationState {
  assertParticipant(participants, uid);
  if (deal.confirmedBy.includes(uid)) {
    throw new DealActionError('already_confirmed', `${uid} already confirmed this deal`);
  }
  const event: DealEvent = deal.confirmedBy.length === 0 ? 'firstConfirm' : 'secondConfirm';
  return {
    status: dealMachine.transition(deal.status, event),
    confirmedBy: [...deal.confirmedBy, uid],
  };
}

/**
 * The participant asked to confirm says "It didn't happen". Only the side that hasn't confirmed can dispute,
 * and only while the deal awaits their confirmation.
 */
export function applyDispute(
  deal: DealConfirmationState,
  participants: readonly [string, string],
  uid: string,
): DealConfirmationState {
  assertParticipant(participants, uid);
  if (deal.confirmedBy.includes(uid)) {
    throw new DealActionError(
      'own_confirmation',
      `${uid} confirmed this deal and can't dispute it`,
    );
  }
  return { status: dealMachine.transition(deal.status, 'dispute'), confirmedBy: deal.confirmedBy };
}

/** Only completed deals count toward trade totals and allow ratings (PRD W6, W9). */
export function dealCountsForTrust(status: DealStatus): boolean {
  return status === 'completed';
}
