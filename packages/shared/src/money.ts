/** Integer amount in agorot (1 ILS = 100 agorot). Money is never stored or computed as a float. */
export type Agorot = number;

export const AGOROT_PER_SHEKEL = 100;

/** Converts a whole-shekel amount entered by a user to agorot. Rejects fractions, negatives, non-finite values and amounts too large to represent exactly. */
export function shekelsToAgorot(shekels: number): Agorot {
  const agorot = shekels * AGOROT_PER_SHEKEL;
  if (!Number.isSafeInteger(shekels) || shekels < 0 || !Number.isSafeInteger(agorot)) {
    throw new RangeError(`Invalid shekel amount: ${shekels}`);
  }
  return agorot;
}

export function isAgorot(value: unknown): value is Agorot {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Asking price range for For Sale listings: ₪10–₪1,000 (PRD W2). Informational; paid outside the app. */
export const ASKING_PRICE_MIN_AGOROT: Agorot = 10 * AGOROT_PER_SHEKEL;
export const ASKING_PRICE_MAX_AGOROT: Agorot = 1_000 * AGOROT_PER_SHEKEL;

/** Largest cash top-up an offer can record: ₪2,000 (PRD W5). Recorded, not processed, in the MVP. */
export const CASH_TOP_UP_MAX_AGOROT: Agorot = 2_000 * AGOROT_PER_SHEKEL;

/** Whole-shekel amounts only (people type ₪, not agorot), within [min, max]. */
export function isWholeShekelAmount(agorot: unknown, min: Agorot, max: Agorot): agorot is Agorot {
  return isAgorot(agorot) && agorot % AGOROT_PER_SHEKEL === 0 && agorot >= min && agorot <= max;
}

/** Adds agorot amounts exactly; throws if any value isn't valid agorot or the total isn't a safe integer. */
export function sumAgorot(...amounts: Agorot[]): Agorot {
  const total = amounts.reduce((acc, amount) => {
    if (!isAgorot(amount)) throw new RangeError(`Invalid agorot amount: ${amount}`);
    return acc + amount;
  }, 0);
  if (!Number.isSafeInteger(total)) throw new RangeError('Agorot total is too large');
  return total;
}
