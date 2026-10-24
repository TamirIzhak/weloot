import { defineSecret, defineString } from 'firebase-functions/params';

// Every server credential WeLoot uses, stored in Google Secret Manager (PRD §13).
// A secret only has to exist in a project once a deployed function binds it via `secrets: [...]`.
// Set values with `npx firebase functions:secrets:set <NAME> -P <alias>`; for the emulator, put them in
// functions/.secret.local (git-ignored). Keep this list in sync with the README "Secrets" table.

// Sign in with Discord (#64). The client ID is public, so it's a plain parameter (functions/.env); it stays empty
// until the Discord application exists (docs/OWNER-TODO.md), and the function then answers "notConfigured".
export const DISCORD_CLIENT_ID = defineString('DISCORD_CLIENT_ID', { default: '' });
export const DISCORD_CLIENT_SECRET = defineSecret('DISCORD_CLIENT_SECRET');

// IGDB / Twitch (#12)
export const TWITCH_CLIENT_ID = defineSecret('TWITCH_CLIENT_ID');
export const TWITCH_CLIENT_SECRET = defineSecret('TWITCH_CLIENT_SECRET');

// Algolia admin key, for index writes only (#13). The app uses the public search-only key. The application ID is
// public: a plain parameter (functions/.env), empty until the Algolia app exists (docs/OWNER-TODO.md).
export const ALGOLIA_APP_ID = defineString('ALGOLIA_APP_ID', { default: '' });
export const ALGOLIA_ADMIN_KEY = defineSecret('ALGOLIA_ADMIN_KEY');

// UPC/EAN barcode lookup provider (#14, OPEN-6)
export const UPC_LOOKUP_API_KEY = defineSecret('UPC_LOOKUP_API_KEY');

// Phase 2 (not used in the MVP, PRD Appendix A): Tranzila payments (#28, OPEN-2)
export const TRANZILA_TERMINAL = defineSecret('TRANZILA_TERMINAL');
export const TRANZILA_API_KEY = defineSecret('TRANZILA_API_KEY');
export const TRANZILA_NOTIFY_SECRET = defineSecret('TRANZILA_NOTIFY_SECRET');

// Phase 2: DONE smart lockers (#31, OPEN-7). The base URL is not a credential, so it is a plain parameter
// (set per project in functions/.env.<projectId>), e.g. https://l2l-api-test.cleanbox.co.il/ for dev.
export const DONE_BASE_URL = defineString('DONE_BASE_URL');
export const DONE_USERNAME = defineSecret('DONE_USERNAME');
export const DONE_PASSWORD = defineSecret('DONE_PASSWORD');
export const DONE_WEBHOOK_SECRET = defineSecret('DONE_WEBHOOK_SECRET');
