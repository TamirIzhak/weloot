import { isAgorot, shekelsToAgorot } from './money';

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
