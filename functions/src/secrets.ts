import { defineSecret, defineString } from 'firebase-functions/params';

// Every server credential WeLoot uses, stored in Google Secret Manager (PRD §13).
// A secret only has to exist in a project once a deployed function binds it via `secrets: [...]`.
// Set values with `npx firebase functions:secrets:set <NAME> -P <alias>`; for the emulator, put them in
// functions/.secret.local (git-ignored). Keep this list in sync with the README "Secrets" table.

// IGDB / Twitch (#12)
export const TWITCH_CLIENT_ID = defineSecret('TWITCH_CLIENT_ID');
export const TWITCH_CLIENT_SECRET = defineSecret('TWITCH_CLIENT_SECRET');

// Algolia admin key, for index writes only (#13). The app uses the public search-only key.
export const ALGOLIA_ADMIN_KEY = defineSecret('ALGOLIA_ADMIN_KEY');

// UPC/EAN barcode lookup provider (#14, OPEN-6)
export const UPC_LOOKUP_API_KEY = defineSecret('UPC_LOOKUP_API_KEY');

// Tranzila payments (#28, OPEN-2)
export const TRANZILA_TERMINAL = defineSecret('TRANZILA_TERMINAL');
export const TRANZILA_API_KEY = defineSecret('TRANZILA_API_KEY');
export const TRANZILA_NOTIFY_SECRET = defineSecret('TRANZILA_NOTIFY_SECRET');

// DONE smart lockers (#31, OPEN-7). The base URL is not a credential, so it is a plain parameter
// (set per project in functions/.env.<projectId>), e.g. https://l2l-api-test.cleanbox.co.il/ for dev.
export const DONE_BASE_URL = defineString('DONE_BASE_URL');
export const DONE_USERNAME = defineSecret('DONE_USERNAME');
export const DONE_PASSWORD = defineSecret('DONE_PASSWORD');
export const DONE_WEBHOOK_SECRET = defineSecret('DONE_WEBHOOK_SECRET');
