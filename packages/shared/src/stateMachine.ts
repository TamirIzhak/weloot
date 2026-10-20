/** One row of a transition table: the states an event may fire from, and the state it leads to. */
export type Transition<S extends string> = { readonly from: readonly S[]; readonly to: S };

/** Thrown when an event isn't allowed from the current state. Functions map it to `failed-precondition`. */
export class TransitionError extends Error {
  readonly machine: string;
  readonly from: string;
  readonly event: string;

  constructor(machine: string, from: string, event: string) {
    super(`${machine}: "${event}" is not allowed from "${from}"`);
    this.name = 'TransitionError';
    this.machine = machine;
    this.from = from;
    this.event = event;
  }
}

export type StateMachine<S extends string, E extends string> = {
  readonly name: string;
  readonly states: readonly S[];
  readonly events: readonly E[];
  /** True when `event` may fire from `from`. */
  canTransition: (from: S, event: E) => boolean;
  /** The next state, or throws `TransitionError` (PRD §4.6: any transition not in the table is rejected). */
  transition: (from: S, event: E) => S;
  /** Events allowed from a state, e.g. to decide which buttons to show. */
  allowedEvents: (from: S) => E[];
  /** States with no outgoing transitions. */
  isFinal: (state: S) => boolean;
};

/** Builds a machine from an explicit transition table (defined once here, shared by app and functions). */
export function createMachine<S extends string, E extends string>(
  name: string,
  states: readonly S[],
  table: Readonly<Record<E, Transition<S>>>,
): StateMachine<S, E> {
  const events = Object.keys(table) as E[];
  const canTransition = (from: S, event: E) => table[event]?.from.includes(from) ?? false;
  return {
    name,
    states,
    events,
    canTransition,
    transition: (from, event) => {
      if (!canTransition(from, event)) throw new TransitionError(name, from, event);
      return table[event].to;
    },
    allowedEvents: (from) => events.filter((event) => canTransition(from, event)),
    isFinal: (state) => events.every((event) => !canTransition(state, event)),
  };
}
