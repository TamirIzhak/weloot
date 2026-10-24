import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, onRequest } from 'firebase-functions/v2/https';

import { FIREBASE_REGION } from '@weloot/shared';

import { firestoreAccountStore, handleDeleteAccount } from './account/deleteAccount';
import { adminAuth, adminDb } from './admin';
import { handleDiscordSignIn } from './auth/discordSignIn';
import { healthPayload } from './health';
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } from './secrets';

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
