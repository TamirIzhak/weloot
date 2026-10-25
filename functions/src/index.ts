import { setGlobalOptions } from 'firebase-functions/v2';
import { logger } from 'firebase-functions';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onObjectDeleted, onObjectFinalized } from 'firebase-functions/v2/storage';
import { getStorage } from 'firebase-admin/storage';
import { algoliasearch } from 'algoliasearch';

import { FIREBASE_REGION } from '@weloot/shared';

import { firestoreAccountStore, handleDeleteAccount } from './account/deleteAccount';
import { adminAuth, adminDb } from './admin';
import { handleConfirmBarcode, handleLookupBarcode, noUpcProvider } from './barcodes/barcodes';
import { handleDiscordSignIn } from './auth/discordSignIn';
import { syncCatalog, type SyncMode } from './catalog/catalogSync';
import { createIgdbClient } from './catalog/igdbClient';
import { healthPayload } from './health';
import { deletePhotosOf, syncListingPhotos, type PhotoDeps } from './listings/listingPhotos';
import { handlePublishListing, removeListingsOf } from './listings/publishListing';
import {
  configureGamesIndex,
  searchGamesIndex,
  syncGameRecord,
  type AlgoliaAdmin,
  type AlgoliaSearcher,
} from './search/gamesIndex';
import {
  ALGOLIA_ADMIN_KEY,
  ALGOLIA_APP_ID,
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
  handleDeleteAccount(request.auth, {
    store: firestoreAccountStore(adminDb()),
    auth: adminAuth(),
    cleanups: [
      removeListingsOf(adminDb()),
      deletePhotosOf(adminDb(), (prefix) => getStorage().bucket().deleteFiles({ prefix })),
    ],
  }),
);

/** The Algolia admin client, or null until the Algolia app is set up (docs/OWNER-TODO.md 5). */
function algoliaAdmin(): (AlgoliaAdmin & AlgoliaSearcher) | null {
  const appId = ALGOLIA_APP_ID.value();
  const adminKey = ALGOLIA_ADMIN_KEY.value();
  if (!appId || !adminKey) return null;
  return algoliasearch(appId, adminKey);
}

// Catalog sync from IGDB (PRD §5.1, #12): nightly (only what changed) and on demand.
const catalogOptions = {
  secrets: [TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, ALGOLIA_ADMIN_KEY],
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
  // Index settings are idempotent; applying them on every run keeps a new Algolia app configured.
  const algolia = algoliaAdmin();
  if (algolia) await configureGamesIndex(algolia);
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

// Algolia `games` index (PRD §5.2, #13): mirrors every `games` change.
export const indexGame = onDocumentWritten(
  { document: 'games/{gameId}', secrets: [ALGOLIA_ADMIN_KEY] },
  async (event) => {
    const algolia = algoliaAdmin();
    if (!algolia) {
      logger.warn('indexGame: Algolia is not set up (docs/OWNER-TODO.md)');
      return;
    }
    await syncGameRecord(
      algolia,
      event.params.gameId,
      event.data?.after.data(),
      event.data?.before.data(),
    );
  },
);

// Barcodes (PRD §5.1, #14): look a scanned code up, and record users' confirmations.
export const lookupBarcode = onCall({ secrets: [ALGOLIA_ADMIN_KEY] }, (request) =>
  handleLookupBarcode(request.auth, request.data, {
    db: adminDb(),
    upc: noUpcProvider, // TODO(OPEN-6): the UPC/EAN provider isn't chosen yet.
    searchGames: async (query) => {
      const algolia = algoliaAdmin();
      return algolia ? searchGamesIndex(algolia, query) : [];
    },
  }),
);

export const confirmBarcode = onCall((request) =>
  handleConfirmBarcode(request.auth, request.data, { db: adminDb() }),
);

// Publish a listing (PRD W2, #16): validated and completed server-side (status, game fields, area-only location).
export const publishListing = onCall((request) =>
  handlePublishListing(request.auth, request.data, { db: adminDb() }),
);

// Listing photos (PRD W2, #15): keep photoPaths/hasPhotos in step with Storage.
const photoDeps = (): PhotoDeps => ({
  db: adminDb(),
  listFiles: async (prefix) => {
    const [files] = await getStorage().bucket().getFiles({ prefix });
    return files.map((file) => file.name);
  },
});
export const onListingPhotoUploaded = onObjectFinalized(async (event) => {
  await syncListingPhotos(photoDeps(), event.data.name);
});
export const onListingPhotoDeleted = onObjectDeleted(async (event) => {
  await syncListingPhotos(photoDeps(), event.data.name);
});
