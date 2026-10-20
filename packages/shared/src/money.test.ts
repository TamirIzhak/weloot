import {
  ASKING_PRICE_MAX_AGOROT,
  ASKING_PRICE_MIN_AGOROT,
  isAgorot,
  isWholeShekelAmount,
  shekelsToAgorot,
  sumAgorot,
} from './money';

describe('shekelsToAgorot', () => {
  it('converts whole shekels to agorot', () => {
    expect(shekelsToAgorot(0)).toBe(0);
    expect(shekelsToAgorot(200)).toBe(20000);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    'rejects %p',
    (value) => {
      expect(() => shekelsToAgorot(value)).toThrow(RangeError);
    },
  );
});

describe('isAgorot', () => {
  it('accepts non-negative safe integers only', () => {
    expect(isAgorot(100)).toBe(true);
    expect(isAgorot(1.5)).toBe(false);
    expect(isAgorot(-100)).toBe(false);
    expect(isAgorot('100')).toBe(false);
  });
});

describe('isWholeShekelAmount', () => {
  it('accepts whole shekels within the range, inclusive', () => {
    expect(
      isWholeShekelAmount(
        ASKING_PRICE_MIN_AGOROT,
        ASKING_PRICE_MIN_AGOROT,
        ASKING_PRICE_MAX_AGOROT,
      ),
    ).toBe(true);
    expect(
      isWholeShekelAmount(
        ASKING_PRICE_MAX_AGOROT,
        ASKING_PRICE_MIN_AGOROT,
        ASKING_PRICE_MAX_AGOROT,
      ),
    ).toBe(true);
  });

  it.each([999, 100_100, 1_050, -100, 1.5, '1000', undefined])('rejects %p', (value) => {
    expect(isWholeShekelAmount(value, ASKING_PRICE_MIN_AGOROT, ASKING_PRICE_MAX_AGOROT)).toBe(
      false,
    );
  });
});

describe('sumAgorot', () => {
  it('adds exactly', () => {
    expect(sumAgorot(10, 20, 30)).toBe(60);
    expect(sumAgorot()).toBe(0);
  });

  it('rejects invalid amounts and unsafe totals', () => {
    expect(() => sumAgorot(10, -1)).toThrow(RangeError);
    expect(() => sumAgorot(1.5)).toThrow(RangeError);
    expect(() => sumAgorot(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });
});
