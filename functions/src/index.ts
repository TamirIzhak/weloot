import { setGlobalOptions } from 'firebase-functions/v2';
import { logger } from 'firebase-functions';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onObjectDeleted, onObjectFinalized } from 'firebase-functions/v2/storage';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { algoliasearch } from 'algoliasearch';

import { FIREBASE_REGION } from '@weloot/shared';

import { firestoreAccountStore, handleDeleteAccount } from './account/deleteAccount';
import { alertOnListingWrite, type Notifier } from './alerts/alerts';
import { adminAuth, adminDb } from './admin';
import { handleConfirmBarcode, handleLookupBarcode, noUpcProvider } from './barcodes/barcodes';
import { handleDiscordSignIn } from './auth/discordSignIn';
import {
  expireOffers,
  handleMarkRead,
  handleRespondToOffer,
  handleSendMessage,
  handleSendOffer,
  handleStartConversation,
  invalidateOffersFor,
} from './conversations/conversations';
import { handleDealAction, runDealReminders } from './conversations/deals';
import { handleRateUser } from './conversations/ratings';
import { syncCatalog, type SyncMode } from './catalog/catalogSync';
import { createIgdbClient } from './catalog/igdbClient';
import { healthPayload } from './health';
import { deletePhotosOf, syncListingPhotos, type PhotoDeps } from './listings/listingPhotos';
import { handleManageListing } from './listings/manageListing';
import {
  fcmSender,
  handleRegisterPushToken,
  handleUnregisterPushToken,
  notifyForMessage,
} from './notifications/notifications';
import { matchOnListingWrite, matchOnWantWrite } from './matching/matches';
import { handleWantedNearYou } from './matching/wantedNearYou';
import { handlePublishListing, removeListingsOf } from './listings/publishListing';
import { handleSubmitReport } from './reports/submitReport';
import { handleSetBlocked } from './safety/block';
import { languageOf, renderListingPage } from './share/listingPage';
import {
  configureGamesIndex,
  searchGamesIndex,
  syncGameRecord,
  type AlgoliaAdmin,
  type AlgoliaSearcher,
} from './search/gamesIndex';
import { configureListingsIndex, syncListingRecord } from './search/listingsIndex';
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
  if (algolia) await Promise.all([configureGamesIndex(algolia), configureListingsIndex(algolia)]);
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

// Listings search index (PRD §5.2, #18): only active listings; synced from the current doc, so order doesn't matter.
export const indexListing = onDocumentWritten(
  { document: 'listings/{listingId}', secrets: [ALGOLIA_ADMIN_KEY] },
  async (event) => {
    const algolia = algoliaAdmin();
    if (!algolia) {
      logger.warn('indexListing: Algolia is not set up (docs/OWNER-TODO.md)');
      return;
    }
    const { listingId } = event.params;
    const current = await adminDb().collection('listings').doc(listingId).get();
    await syncListingRecord(algolia, listingId, current.data(), event.data?.before.data());
  },
);

// Matches (PRD W3, #21): recomputed for the affected pairs of users on listing and want list changes.
export const matchOnListing = onDocumentWritten('listings/{listingId}', async (event) => {
  await matchOnListingWrite(adminDb(), event.data?.before.data(), event.data?.after.data());
});

export const matchOnWant = onDocumentWritten('wantlist/{uid}/items/{itemId}', async (event) => {
  await matchOnWantWrite(
    adminDb(),
    event.params.uid,
    event.data?.before.data(),
    event.data?.after.data(),
  );
});

// Home "Wanted near you" (PRD W3, #22): counts only, never who.
export const wantedNearYou = onCall((request) =>
  handleWantedNearYou(request.auth, request.data, { db: adminDb() }),
);

// Alerts (PRD W8, #49): a listing that becomes active reaches matching alerts and want lists (rate-limited pushes).
const pushSender = () => fcmSender(getMessaging());
const fcmNotifier: Notifier = {
  async send(push) {
    await pushSender().send(push.tokens, {
      title: push.title,
      body: push.body,
      data: { type: 'listing', listingId: push.listingId, source: 'alert' },
    });
  },
};

export const alertOnListing = onDocumentWritten('listings/{listingId}', async (event) => {
  await alertOnListingWrite(
    { db: adminDb(), notifier: fcmNotifier },
    event.params.listingId,
    event.data?.before.data(),
    event.data?.after.data(),
  );
});

// Conversations and offers (PRD W5, #23): clients never write them; every change goes through these.
export const startConversation = onCall((request) =>
  handleStartConversation(request.auth, request.data, { db: adminDb() }),
);
export const sendMessage = onCall((request) =>
  handleSendMessage(request.auth, request.data, { db: adminDb() }),
);
export const sendOffer = onCall((request) =>
  handleSendOffer(request.auth, request.data, { db: adminDb() }),
);
export const respondToOffer = onCall((request) =>
  handleRespondToOffer(request.auth, request.data, { db: adminDb() }),
);
export const markConversationRead = onCall((request) =>
  handleMarkRead(request.auth, request.data, { db: adminDb() }),
);
// Deals (PRD W6, #47): confirm / dispute / cancel, and the reminders and 7-day expiry.
export const dealAction = onCall((request) =>
  handleDealAction(request.auth, request.data, { db: adminDb() }),
);
// Ratings (PRD W9, #36): after a completed deal, once per person.
export const rateUser = onCall((request) =>
  handleRateUser(request.auth, request.data, { db: adminDb() }),
);
export const dealRemindersScheduled = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'Asia/Jerusalem' },
  async () => {
    await runDealReminders(adminDb());
  },
);
export const expireOffersScheduled = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'Asia/Jerusalem' },
  async () => {
    await expireOffers(adminDb());
  },
);
export const invalidateOffersOnListing = onDocumentWritten(
  'listings/{listingId}',
  async (event) => {
    await invalidateOffersFor(
      adminDb(),
      event.params.listingId,
      event.data?.before.data(),
      event.data?.after.data(),
    );
  },
);

// Push notifications (PRD §10, #27): devices register themselves; chat events notify whoever they concern.
export const registerPushToken = onCall((request) =>
  handleRegisterPushToken(request.auth, request.data, { db: adminDb() }),
);
export const unregisterPushToken = onCall((request) =>
  handleUnregisterPushToken(request.auth, request.data, { db: adminDb() }),
);
export const notifyOnMessage = onDocumentCreated(
  'conversations/{conversationId}/messages/{messageId}',
  async (event) => {
    const message = event.data?.data();
    if (!message) return;
    await notifyForMessage(
      { db: adminDb(), sender: pushSender() },
      event.params.conversationId,
      message as Parameters<typeof notifyForMessage>[2],
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

// Owner actions on a listing (PRD W6, #17): pause, resume, remove, Swapped/Sold.
export const manageListing = onCall((request) =>
  handleManageListing(request.auth, request.data, { db: adminDb() }),
);

// Reports (PRD W9, #19, #37): listings, users, messages and deals.
export const submitReport = onCall((request) =>
  handleSubmitReport(request.auth, request.data, { db: adminDb() }),
);

// Blocking (PRD W9, #37).
export const setBlocked = onCall((request) =>
  handleSetBlocked(request.auth, request.data, { db: adminDb() }),
);

// Shared links (PRD W7, #50): Hosting rewrites /l/{listingId} here; public, no personal data.
export const listingPage = onRequest({ invoker: 'public' }, async (req, res) => {
  const listingId = decodeURIComponent(req.path.split('/').filter(Boolean)[1] ?? '');
  const { status, html } = await renderListingPage(
    adminDb(),
    listingId,
    languageOf(req.get('accept-language')),
  );
  res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(status).type('html').send(html);
});
