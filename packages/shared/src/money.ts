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
