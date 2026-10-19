import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';

import { FIREBASE_REGION } from '@weloot/shared';

import { healthPayload } from './health';

// Region per ADR 0001.
setGlobalOptions({ region: FIREBASE_REGION, maxInstances: 10 });

// Private: callable only with IAM credentials (deploy checks, ops), never from the public internet.
export const health = onRequest({ invoker: 'private' }, (_req, res) => {
  res.json(healthPayload());
});
