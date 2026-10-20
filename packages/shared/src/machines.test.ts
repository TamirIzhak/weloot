import {
  applyConfirmation,
  applyDispute,
  DEAL_STATUSES,
  dealCountsForTrust,
  DealActionError,
  dealMachine,
  initialDeal,
  isListingDiscoverable,
  LISTING_STATUSES,
  listingMachine,
  OFFER_STATUSES,
  offerMachine,
  type DealStatus,
} from './machines';
import { TransitionError, type StateMachine } from './stateMachine';

/**
 * Checks every (state, event) pair of a machine against the expected table: allowed pairs must lead to the
 * expected state, every other pair must be rejected with a TransitionError. This is full transition coverage.
 */
function expectExactly<S extends string, E extends string>(
  machine: StateMachine<S, E>,
  expected: Partial<Record<S, Partial<Record<E, S>>>>,
) {
  for (const state of machine.states) {
    for (const event of machine.events) {
      const to = expected[state]?.[event];
      if (to) {
        expect({ state, event, allowed: machine.canTransition(state, event) }).toEqual({
          state,
          event,
          allowed: true,
        });
        expect(machine.transition(state, event)).toBe(to);
      } else {
        expect({ state, event, allowed: machine.canTransition(state, event) }).toEqual({
          state,
          event,
          allowed: false,
        });
        expect(() => machine.transition(state, event)).toThrow(TransitionError);
      }
    }
  }
}

describe('listing machine (PRD §7, owner-controlled closing)', () => {
  it('allows exactly the transitions in the table', () => {
    expectExactly(listingMachine, {
      draft: { publish: 'active', remove: 'removed' },
      active: {
        pause: 'paused',
        reserve: 'reserved',
        closeTraded: 'traded',
        closeSold: 'sold',
        remove: 'removed',
      },
      paused: { resume: 'active', closeTraded: 'traded', closeSold: 'sold', remove: 'removed' },
      reserved: { release: 'active', closeTraded: 'traded', closeSold: 'sold' },
    });
  });

  it('lets the owner close a reserved listing without waiting for anyone', () => {
    expect(listingMachine.transition('reserved', 'closeTraded')).toBe('traded');
  });

  it('treats traded, sold and removed as final', () => {
    expect(LISTING_STATUSES.filter(listingMachine.isFinal)).toEqual(['traded', 'sold', 'removed']);
  });

  it('shows only active listings in discovery', () => {
    expect(LISTING_STATUSES.filter(isListingDiscoverable)).toEqual(['active']);
  });

  it('reports a clear error for a forbidden transition', () => {
    expect(() => listingMachine.transition('sold', 'publish')).toThrow(
      'listing: "publish" is not allowed from "sold"',
    );
  });
});

describe('offer machine (PRD §7)', () => {
  it('allows exactly the transitions in the table', () => {
    expectExactly(offerMachine, {
      pending: {
        accept: 'accepted',
        decline: 'declined',
        counter: 'superseded',
        withdraw: 'withdrawn',
        expire: 'expired',
        invalidate: 'declined',
      },
    });
  });

  it('makes every non-pending status final', () => {
    expect(OFFER_STATUSES.filter(offerMachine.isFinal)).toEqual(
      OFFER_STATUSES.filter((s) => s !== 'pending'),
    );
  });
});

describe('deal machine (PRD §7)', () => {
  it('allows exactly the transitions in the table', () => {
    expectExactly(dealMachine, {
      agreed: { firstConfirm: 'awaiting_confirmation', cancel: 'cancelled' },
      awaiting_confirmation: {
        secondConfirm: 'completed',
        expire: 'unconfirmed',
        dispute: 'disputed',
      },
      disputed: { resolveCompleted: 'completed', resolveCancelled: 'cancelled' },
    });
  });

  it('cannot be cancelled once someone confirmed the swap', () => {
    expect(dealMachine.canTransition('awaiting_confirmation', 'cancel')).toBe(false);
  });

  it('treats completed, cancelled and unconfirmed as final', () => {
    expect(DEAL_STATUSES.filter(dealMachine.isFinal)).toEqual([
      'completed',
      'cancelled',
      'unconfirmed',
    ]);
  });

  it('counts only completed deals toward trust', () => {
    expect(DEAL_STATUSES.filter(dealCountsForTrust)).toEqual<DealStatus[]>(['completed']);
  });

  it('lists the events each state allows (for showing buttons)', () => {
    expect(dealMachine.allowedEvents('agreed')).toEqual(['firstConfirm', 'cancel']);
    expect(dealMachine.allowedEvents('completed')).toEqual([]);
  });
});

describe('deal confirmations (PRD W6)', () => {
  const PARTICIPANTS = ['owner', 'buyer'] as const;

  it('starts agreed for an accepted offer, awaiting for an owner swap', () => {
    expect(initialDeal('offer', 'owner')).toEqual({ status: 'agreed', confirmedBy: [] });
    expect(initialDeal('ownerSwap', 'owner')).toEqual({
      status: 'awaiting_confirmation',
      confirmedBy: ['owner'],
    });
  });

  it('completes only after both participants confirm, in either order', () => {
    for (const [first, second] of [
      ['owner', 'buyer'],
      ['buyer', 'owner'],
    ] as const) {
      const one = applyConfirmation(initialDeal('offer', 'owner'), PARTICIPANTS, first);
      expect(one).toEqual({ status: 'awaiting_confirmation', confirmedBy: [first] });
      expect(applyConfirmation(one, PARTICIPANTS, second)).toEqual({
        status: 'completed',
        confirmedBy: [first, second],
      });
    }
  });

  it('completes an owner-swap deal with the counterpart’s single tap', () => {
    expect(applyConfirmation(initialDeal('ownerSwap', 'owner'), PARTICIPANTS, 'buyer')).toEqual({
      status: 'completed',
      confirmedBy: ['owner', 'buyer'],
    });
  });

  it('rejects a second confirmation by the same person', () => {
    const one = applyConfirmation(initialDeal('offer', 'owner'), PARTICIPANTS, 'owner');
    expect(() => applyConfirmation(one, PARTICIPANTS, 'owner')).toThrow(DealActionError);
  });

  it('rejects confirmations by non-participants', () => {
    expect(() =>
      applyConfirmation(initialDeal('offer', 'owner'), PARTICIPANTS, 'stranger'),
    ).toThrow(expect.objectContaining({ reason: 'not_participant' }));
  });

  it('rejects confirming a cancelled or unconfirmed deal', () => {
    for (const status of ['cancelled', 'unconfirmed'] as const) {
      expect(() =>
        applyConfirmation({ status, confirmedBy: ['owner'] }, PARTICIPANTS, 'buyer'),
      ).toThrow(TransitionError);
    }
  });

  it('lets only the side asked to confirm say “it didn’t happen”', () => {
    const awaiting = initialDeal('ownerSwap', 'owner');
    expect(applyDispute(awaiting, PARTICIPANTS, 'buyer')).toEqual({
      status: 'disputed',
      confirmedBy: ['owner'],
    });
    expect(() => applyDispute(awaiting, PARTICIPANTS, 'owner')).toThrow(
      expect.objectContaining({ reason: 'own_confirmation' }),
    );
    expect(() => applyDispute(awaiting, PARTICIPANTS, 'stranger')).toThrow(
      expect.objectContaining({ reason: 'not_participant' }),
    );
  });

  it('cannot dispute before anyone confirmed', () => {
    expect(() => applyDispute(initialDeal('offer', 'owner'), PARTICIPANTS, 'buyer')).toThrow(
      TransitionError,
    );
  });
});

describe('untrusted input', () => {
  it('rejects an event name that is not in the table (e.g. from a client request)', () => {
    const unknownEvent = 'teleport' as Parameters<typeof dealMachine.canTransition>[1];
    expect(dealMachine.canTransition('agreed', unknownEvent)).toBe(false);
    expect(() => dealMachine.transition('agreed', unknownEvent)).toThrow(TransitionError);
  });
});
