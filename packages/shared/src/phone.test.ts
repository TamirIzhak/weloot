import { isIsraeliMobile, toE164IL, toLocalIL } from './phone';

describe('Israeli mobile numbers', () => {
  it.each([
    ['0541234567', '+972541234567'],
    ['054-123-4567', '+972541234567'],
    ['054 123 4567', '+972541234567'],
    ['(054) 1234567', '+972541234567'],
    ['+972541234567', '+972541234567'],
    ['+972 54-123-4567', '+972541234567'],
    ['972541234567', '+972541234567'],
  ])('normalizes %s to E.164', (input, e164) => {
    expect(isIsraeliMobile(input)).toBe(true);
    expect(toE164IL(input)).toBe(e164);
    expect(toLocalIL(input)).toBe('0541234567');
  });

  it.each([
    '031234567', // landline
    '05412345', // too short
    '054123456789', // too long
    '+972312345678', // landline in E.164
    '+15551234567', // not Israel
    '',
    'not a phone',
  ])('rejects %p', (input) => {
    expect(isIsraeliMobile(input)).toBe(false);
    expect(() => toE164IL(input)).toThrow(RangeError);
    expect(() => toLocalIL(input)).toThrow(RangeError);
  });
});
