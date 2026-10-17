import { healthPayload } from './health';

describe('healthPayload', () => {
  it('reports the service as healthy', () => {
    expect(healthPayload()).toEqual({ service: 'weloot-functions', ok: true });
  });
});
