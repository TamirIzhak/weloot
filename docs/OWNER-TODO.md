# Owner to-do

Things only the owner can do (accounts, developer apps, secrets, console switches, billing). The app builds and runs without them: each feature shows a clear "not configured" state until its item is done. Never paste secrets into chat; set them yourself with the commands below.

All steps are for the **dev** Firebase project (`development-1c64a`) unless noted. Repeat for staging/prod before launch.

## Sign-in (#64)

### 1. Google
1. Firebase console → **Authentication** → **Sign-in method** → **Add new provider** → **Google** → Enable, choose a support email, Save.
2. Tell Claude it's done. Claude then refreshes `google-services.json` in EAS and adds the public web client ID to `app/.env`.

### 2. Facebook
1. [developers.facebook.com](https://developers.facebook.com/apps) → **Create app** → use case **"Authenticate and request data from users with Facebook Login"** → name it "WeLoot".
2. In the app: **App settings → Basic**: copy the **App ID** (public) and **App secret** (secret).
3. Firebase console → **Authentication** → **Sign-in method** → **Facebook** → Enable, paste the App ID and App secret, and copy the **OAuth redirect URI** it shows.
4. Facebook app → **Facebook Login → Settings** → add `fb<APP_ID>://authorize` and the Firebase redirect URI under **Valid OAuth Redirect URIs**.
5. Tell Claude the **App ID** (public). Don't share the secret.

### 3. Discord
1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application** → "WeLoot".
2. **OAuth2** → **Redirects** → add `weloot://auth/discord` → Save. Copy the **Client ID** (public) and **Client Secret** (secret; "Reset Secret" if hidden).
3. Set the secret for deployed functions: `npx firebase functions:secrets:set DISCORD_CLIENT_SECRET -P dev`
4. For the emulator: add `DISCORD_CLIENT_SECRET=<secret>` to `functions/.secret.local` (git-ignored).
5. Tell Claude the **Client ID** (public).

## Catalog and search (#12, #13)

### 4. IGDB (Twitch)
1. [dev.twitch.tv/console](https://dev.twitch.tv/console) (needs a Twitch account with 2FA) → **Register Your Application** → name "WeLoot", OAuth redirect `http://localhost`, category "Application Integration", client type **Confidential**.
2. Copy the **Client ID** and create a **Client Secret**.
3. `npx firebase functions:secrets:set TWITCH_CLIENT_ID -P dev` and `npx firebase functions:secrets:set TWITCH_CLIENT_SECRET -P dev`
4. For the emulator: add both as `NAME=value` lines to `functions/.secret.local`.
5. Before launch: IGDB commercial-use terms (OPEN-5).

### 5. Algolia
1. [algolia.com](https://www.algolia.com) → sign up → create an application (free **Build** plan), region closest to Israel (e.g. Europe).
2. **Settings → API Keys**: copy the **Application ID** and **Search-Only API Key** (both public) and the **Admin API Key** (secret).
3. `npx firebase functions:secrets:set ALGOLIA_ADMIN_KEY -P dev`, plus `ALGOLIA_ADMIN_KEY=...` in `functions/.secret.local`.
4. Tell Claude the Application ID and Search-Only key (both public). They go in `app/.env` and the EAS environments (`EXPO_PUBLIC_ALGOLIA_APP_ID`, `EXPO_PUBLIC_ALGOLIA_SEARCH_KEY`) and, for the functions, `ALGOLIA_APP_ID` in `functions/.env`.
5. The `games` index fills itself as games are written; to fill it right away, run a full catalog sync (README "Game catalog"). The same sync also applies both indexes' settings (`games` and `listings`), so run it once after setting up Algolia even if the catalog is already there. The `listings` index fills as listings are published or changed.

## Firebase project

### 6. Blaze plan for `dev`
Needed to deploy Cloud Functions and create the Storage bucket in the real dev project (the emulators work without it). Firebase console → ⚙️ → **Usage and billing** → **Modify plan** → Blaze. Set a budget alert (e.g. $10).

## Before launch

### 7. Legal texts
Terms of Service and Privacy Policy in Hebrew and English (they must cover name, email, phone, saved addresses and promotional consent). Publish them at public URLs and put those in `app/.env` as `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` (`{lang}` in a URL becomes `en` or `he`); until then Settings shows "Coming soon". Bump `TOS_VERSION` when they change.

### 8. Support contacts
Set `EXPO_PUBLIC_SUPPORT_WHATSAPP` (international format without +) and `EXPO_PUBLIC_SUPPORT_EMAIL` in `app/.env` (and the EAS environments) so Settings → Support works.

### 9. Push notifications on iPhone
Android pushes work with the existing Firebase setup. For iOS: Apple Developer → Keys → create an **APNs** key (download the `.p8`, note the Key ID and Team ID) → Firebase console → Project settings → Cloud Messaging → Apple app configuration → upload it, for each project (dev, staging, prod). Only needed once the iOS app is built.

### 10. Shared links (App Links / Universal Links)
Shared links are `https://<project>.web.app/l/{id}` until a WeLoot domain is chosen (OPEN-12; set `EXPO_PUBLIC_SHARE_DOMAIN` then). For the links to open the app directly instead of the web page:
1. Android: `npx eas-cli@latest credentials -p android` (from `app/`) → copy the **SHA-256 fingerprint** of each build's signing key into `hosting/public/.well-known/assetlinks.json` (and add an entry per package: `com.weloot.app`, `.staging`, `.dev`).
2. iOS (once there's an Apple developer account): replace `TEAMID` in `hosting/public/.well-known/apple-app-site-association` with the Team ID.
3. Deploy Hosting with the functions: `npx firebase deploy --only hosting,functions -P dev` (and staging / prod).
Until then links open the landing page, whose "Open in WeLoot" button still opens the app.
