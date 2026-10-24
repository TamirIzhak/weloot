// Stand-in for `firebase-functions/v2/https` in Jest: the real module loads an ESM-only dependency (jose) that
// Jest can't require. Same shape as the real HttpsError (code, message, details). Use it with:
//   jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

export class HttpsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpsError';
  }
}
