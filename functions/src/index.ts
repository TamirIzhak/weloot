import { setGlobalOptions } from 'firebase-functions/v2';
import { logger } from 'firebase-functions';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { FIREBASE_REGION } from '@weloot/shared';

import { firestoreAccountStore, handleDeleteAccount } from './account/deleteAccount';
import { adminAuth, adminDb } from './admin';
import { handleDiscordSignIn } from './auth/discordSignIn';
import { syncCatalog, type SyncMode } from './catalog/catalogSync';
import { createIgdbClient } from './catalog/igdbClient';
import { healthPayload } from './health';
import {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
} from './secrets';

// Region per ADR 0001.
setGlobalOptions({ region: FIREBASE_REGION, maxInstances: 10 });

// Private: callable only with IAM credentials (deploy checks, ops), never from the public internet.
export const health = onRequest({ invoker: 'private' }, (_req, res) => {
  res.json(healthPayload());
});

// Sign in with Discord (PRD W1, #64): exchanges the OAuth code for a Firebase custom token.
export const discordSignIn = onCall({ secrets: [DISCORD_CLIENT_SECRET] }, (request) =>
  handleDiscordSignIn(request.data, {
    fetch,
    auth: adminAuth(),
    clientId: DISCORD_CLIENT_ID.value(),
    clientSecret: DISCORD_CLIENT_SECRET.value(),
  }),
);

// Delete account (PRD W9, #11): deletes personal data, frees the username, leaves a tombstone, deletes the Auth user.
export const deleteAccount = onCall((request) =>
  handleDeleteAccount(request.auth, { store: firestoreAccountStore(adminDb()), auth: adminAuth() }),
);

// Catalog sync from IGDB (PRD §5.1, #12): nightly (only what changed) and on demand.
const catalogOptions = {
  secrets: [TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET],
  timeoutSeconds: 540,
  memory: '512MiB' as const,
};

async function runCatalogSync(mode: SyncMode) {
  const clientId = TWITCH_CLIENT_ID.value();
  const clientSecret = TWITCH_CLIENT_SECRET.value();
  if (!clientId || !clientSecret) {
    logger.warn('catalogSync: Twitch credentials are not set (docs/OWNER-TODO.md)');
    return null;
  }
  const db = adminDb();
  return syncCatalog(createIgdbClient({ fetch, db, clientId, clientSecret }), db, mode);
}

export const catalogSyncNightly = onSchedule(
  { ...catalogOptions, schedule: 'every day 03:00', timeZone: 'Asia/Jerusalem' },
  async () => {
    await runCatalogSync('incremental');
  },
);

// Private (IAM only): `?mode=full` re-syncs everything, otherwise only what changed since the last run.
export const catalogSyncNow = onRequest(
  { ...catalogOptions, invoker: 'private' },
  async (req, res) => {
    const result = await runCatalogSync(req.query.mode === 'full' ? 'full' : 'incremental');
    if (!result) {
      res.status(503).json({ error: 'notConfigured' });
      return;
    }
    res.json(result);
  },
);
