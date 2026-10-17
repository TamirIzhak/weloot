/** Integer amount in agorot (1 ILS = 100 agorot). Money is never stored or computed as a float. */
export type Agorot = number;

export const AGOROT_PER_SHEKEL = 100;

/** Converts a whole-shekel amount entered by a user to agorot. Rejects fractions, negatives and non-finite values. */
export function shekelsToAgorot(shekels: number): Agorot {
  if (!Number.isSafeInteger(shekels) || shekels < 0) {
    throw new RangeError(`Invalid shekel amount: ${shekels}`);
  }
  return shekels * AGOROT_PER_SHEKEL;
}

export function isAgorot(value: unknown): value is Agorot {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
