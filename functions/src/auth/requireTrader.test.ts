import type { CallableRequest } from 'firebase-functions/v2/https';

import { requireTrader } from './requireTrader';

jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const authWith = (token: Record<string, unknown>) =>
  ({ uid: 'u1', token, rawToken: 'raw' }) as unknown as CallableRequest['auth'];

describe('requireTrader', () => {
  it('returns the uid when the token has a verified phone', () => {
    expect(requireTrader(authWith({ phone_number: '+972541234567' }))).toBe('u1');
  });

  it('asks guests to sign in', () => {
    expect(() => requireTrader(undefined)).toThrow(
      expect.objectContaining({ code: 'unauthenticated', details: { reason: 'signInRequired' } }),
    );
  });

  it.each([
    ['no phone claim', {}],
    ['an empty phone claim', { phone_number: '' }],
  ])('asks a social account with %s to verify its phone', (_, token) => {
    expect(() => requireTrader(authWith(token))).toThrow(
      expect.objectContaining({ code: 'permission-denied', details: { reason: 'phoneRequired' } }),
    );
  });
});
