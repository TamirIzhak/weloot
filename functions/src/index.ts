import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';

import { healthPayload } from './health';

// Region per PRD §2. Emulators, rules and secrets are configured in #02.
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

// Private: callable only with IAM credentials (deploy checks, ops), never from the public internet.
export const health = onRequest({ invoker: 'private' }, (_req, res) => {
  res.json(healthPayload());
});
