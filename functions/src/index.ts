import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';

import { healthPayload } from './health';

// Region per PRD §2. Emulators, rules and secrets are configured in #02.
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

export const health = onRequest((_req, res) => {
  res.json(healthPayload());
});
