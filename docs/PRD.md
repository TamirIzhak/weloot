# WeLoot — Product Requirements Document (MVP) · v2

> Source of truth for *what* to build. For *how* to work (branching, commits, PRs, checks) see `CLAUDE.md`. For the ordered work list see `docs/BACKLOG.md`.
>
> Anything marked **[OPEN]** is an unresolved business/legal/vendor question. Do not invent an answer: build behind a config value or interface and leave a `TODO(OPEN-x)` that references the question in §14.

---

## 1. Product Overview

| | |
|---|---|
| **Name** | WeLoot |
| **Market** | Israel only (ILS, Hebrew + English, Israeli mobile numbers) |
| **Audience** | Owners of physical console games: PS5, PS4, Nintendo Switch / Switch 2, Xbox Series X\|S, Xbox One |
| **Core loop** | List a physical game (barcode or search + mandatory photos) → get matched (Have/Want) → negotiate a trade, a trade + cash top-up, or a direct sale → exchange asynchronously through DONE smart lockers → cash released from hold only after the receiver collects and the inspection window passes |
| **Revenue (MVP)** | Platform fee on the cash portion of a deal + locker convenience fee per shipment. Amounts are **config, not code** (`config/fees` doc) — see [OPEN-1] |

### 1.1 Out of scope for MVP — do NOT build
Gamification (levels, XP, achievements, daily rewards), AI condition grading, custom admin/support dashboards, in-app ticketing, in-person meetup fulfillment, digital games/codes, accessories/consoles, multi-currency, web client (beyond Expo web used for dev previews).

### 1.2 Success metrics (tracked via Firebase Analytics, §11)
Registration → first listing conversion; offers sent per active user; offer → accepted rate; accepted → completed rate; median time accepted → collected; dispute rate.

---

## 2. Decided Tech Stack

These are decisions, not suggestions. Changing one requires the user's approval.

| Concern | Choice | Notes |
|---|---|---|
| App | **Expo (React Native) SDK — latest stable**, TypeScript strict | Uses a **development build** (`expo-dev-client`), not Expo Go, because native Firebase modules are required |
| Routing | **Expo Router** (file-based, built on React Navigation) | Custom tab bar for hide-on-scroll (§3.4) |
| Styling | **NativeWind** (Tailwind for RN) + a `theme.ts` token file | Use logical utilities only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) for RTL |
| Animation | `react-native-reanimated` | Tab bar, splash, progress bar |
| Client state | **Zustand** for UI/session state; **TanStack Query** for request caching; Firestore `onSnapshot` listeners for realtime data (chat, transaction status) | No Redux |
| Validation | **zod** at every boundary (forms, Cloud Function inputs, third-party responses) | |
| i18n | `i18next` + `react-i18next` + `expo-localization` | §3.5 for RTL mechanics |
| Backend | **Firebase**: Auth, Firestore, Storage, Cloud Functions (2nd gen, Node 22, TypeScript), Cloud Scheduler, FCM, Analytics, Remote Config | Region: **`me-west1` (Tel Aviv)** for Firestore, Storage and Functions in every project (ADR 0001) |
| Firebase SDK | `@react-native-firebase/*` | |
| Search | **Algolia** (game catalog index + listings index), synced from Firestore by Cloud Functions | Firestore alone can't do fuzzy search |
| Camera / barcode | `expo-camera` (`CameraView` with EAN-13/UPC-A) + `expo-image-picker` + `expo-image-manipulator` | |
| Maps | `react-native-maps` | Locker picker |
| Push | FCM via `@react-native-firebase/messaging` | |
| Payments | Tranzila hosted payment page in `react-native-webview` | §5.3 |
| Lockers | DONE Locker2Locker API, **server-side only** | §5.2 |
| Testing | Jest + React Native Testing Library; Firebase Emulator Suite for rules & functions; `@firebase/rules-unit-testing` | |
| CI | GitHub Actions: install → typecheck → lint → test (app + functions) on every PR | |
| Envs | Three Firebase projects: `development-1c64a` (alias `dev`), `staging-d0c10` (`staging`), `weloot-c5fb2` (`prod`); emulators use `demo-weloot`. DONE test env and Tranzila test terminal for dev/staging | |

### 2.1 Repo layout (monorepo, npm workspaces)
```
/app                 Expo app (Expo Router: app/(onboarding), app/(tabs), app/(tx) …)
  /src/components    Reusable UI
  /src/features/*    Feature modules (auth, listings, search, offers, chat, payments, lockers, profile)
  /src/i18n          i18next setup + locales/en.json, locales/he.json
  /src/theme         Design tokens
  /src/lib           firebase, analytics, api clients (call Functions only)
/functions           Cloud Functions (TypeScript)
  /src/igdb  /src/algolia  /src/done  /src/tranzila  /src/transactions  /src/matching  /src/notifications
/packages/shared     Shared TS types + zod schemas (Firestore models, enums, state machine)
/firestore.rules  /storage.rules  /firestore.indexes.json
/docs                PRD.md, BACKLOG.md, adr/ (architecture decision records)
```

---

## 3. UI/UX Design System

### 3.1 Tokens (provisional — designer may replace; always reference tokens, never raw hex in components)
| Token | Value | Use |
|---|---|---|
| `bg` | `#121212` | App background (dark mode only for MVP) |
| `surface` | `#1E1E1E` | Cards, sheets |
| `surfaceRaised` | `#2A2A2A` | Inputs, elevated elements |
| `textPrimary` | `#FFFFFF` | |
| `textSecondary` | `#B3B3B3` | |
| `primary` | `#7C4DFF` ("Loot purple") | Primary CTAs, central `+` button |
| `accent` | `#00E5FF` (neon cyan) | Highlights, match badges, progress |
| `success` / `warning` / `danger` | `#22C55E` / `#F59E0B` / `#EF4444` | Status, errors |
| `psBlue` / `xboxGreen` / `nintendoRed` | `#0070D1` / `#107C10` / `#E60012` | Platform chips & card edge accents only |
| Radius | cards 16, buttons 12, chips 999 | |
| Spacing | 4-pt scale | |

Text contrast must meet WCAG AA (4.5:1) against `bg`/`surface`.

### 3.2 Typography
**Rubik** (Google Fonts, supports Hebrew + Latin) via `expo-font`. Large bold headers (28/22/18), body 16, caption 13. Use one font family for both languages so layouts don't jump on language switch.

### 3.3 Layout
Card-based feeds; game cards are large, rounded, cover-art-first (IGDB `t_cover_big` / `t_720p`), with platform chip, condition, price/“Trade” badge, and distance. Every list has loading skeleton, empty state, and error state (with retry).

### 3.4 Bottom tab bar (hide-on-scroll)
Custom tab bar, 5 destinations, center `+` elevated. Scrolling **down** past a 10px threshold slides it out (translateY, ~200ms); **any** upward scroll brings it back immediately. Always visible when: content is shorter than the screen, scroll is at top, keyboard is closed after input, or a screen opts out. Implemented with a shared Reanimated scroll value exposed by a `useHideOnScroll()` hook that feed screens attach to their `FlatList`/`ScrollView`. Respect safe-area insets.

### 3.5 Localization & RTL (strict)
- Every user-facing string is an i18n key in `en.json` **and** `he.json`. Keys are namespaced by feature (`offers.cashDelta.label`). A CI check fails if a key is missing from either file.
- Default language = device language if Hebrew, else English. User can change it in Profile Setup and Settings.
- **RN mechanics:** layout direction in React Native is set via `I18nManager.forceRTL()` and **only takes effect after an app reload**. On language change: save preference → `I18nManager.allowRTL(true); I18nManager.forceRTL(isHebrew)` → `Updates.reloadAsync()` (expo-updates). Show a short "Applying language…" state. Enable RTL support in the Expo app config (expo-localization plugin `supportsRTL`).
- Use logical styles only (`marginStart`, `paddingEnd`, NativeWind `ms-/me-`). Directional icons (back arrows, chevrons, progress direction) flip in RTL; media controls and logos don't.
- Numbers, prices, phone numbers and game titles inside Hebrew text are wrapped so they render LTR correctly (bidi isolation).
- Game titles come from IGDB in English and stay English in both languages.
- Prices formatted with `Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS' })`.

### 3.6 Errors
A shared `<ErrorState>` / toast component in the dark theme. Every async call shows a localized, human message (mapped from typed error codes — never raw API messages) and a retry where it makes sense. A root React error boundary catches render crashes.

---

## 4. Architecture Principles

1. **The client never talks to DONE, Tranzila, IGDB or Algolia admin APIs.** All third-party calls go through Cloud Functions (callable or HTTPS). The client reads Algolia only with a search-only key.
2. **Secrets live in Firebase Secret Manager** (`defineSecret`) — never in the app bundle. Anything in the app's `.env` prefixed `EXPO_PUBLIC_` is **public** (Firebase web config, Algolia search-only key, support phone number). A `.env.example` lists every variable with a comment.
3. **The server owns money and state.** Clients may create offers and messages; only Cloud Functions may change `transactionStatus`, `escrowStatus`, locker orders, payouts, ratings aggregates. Enforced by Firestore Security Rules + rules tests.
4. **Money is integer agorot** (`amountAgorot: number`, 100 = ₪1). Never floats.
5. **All timestamps are Firestore server timestamps.**
6. **Webhooks/callbacks are idempotent** (dedupe on provider event/order id) and verified (shared secret / signature / re-query provider). Every external event is appended to an `events` audit log.
7. **State machines are explicit** (§7) and defined once in `packages/shared`; any transition not in the table is rejected.

---

## 5. External Integrations

### 5.1 IGDB (Twitch) — game catalog
- **Auth:** Twitch `client_credentials` → app access token (~60-day expiry). Cache the token in Firestore `system/igdbToken` (server-only) and refresh on 401 or near expiry.
- **Rate limit:** 4 requests/second; queue requests in the sync job.
- **Catalog sync (scheduled function, nightly + on-demand admin trigger):** pull games for the target platforms, main games only (exclude DLC, bundles, mods — use IGDB's game type field). Platform IDs: PS4 `48`, PS5 `167`, Switch `130`, Xbox One `49`, Xbox Series X|S `169`; **verify Switch 2's ID** before adding it. Store `games/{igdbId}` (title, slug, platforms, cover image id, first release date, genres, alternative names) and push to the Algolia `games` index.
- **Licensing [OPEN-5]:** IGDB's terms require a separate agreement for commercial use. Confirm before launch.
- **Barcodes:** IGDB does **not** reliably map UPC/EAN barcodes to games. MVP approach:
  1. Look up `barcodes/{ean}` (our own mapping table).
  2. On miss → call a UPC lookup provider via Cloud Function [OPEN-6] to get a product title → fuzzy-search Algolia `games` → show top results for the user to confirm.
  3. When the user confirms a game for a scanned barcode, write the mapping (`barcodes/{ean}` → `{igdbGameId, platformId, confirmations}`), so the catalog gets better with use. Mappings with ≥2 independent confirmations are auto-trusted.
  4. Always allow falling back to manual Assisted Search. Free-text titles are **not** allowed.

### 5.2 DONE Smart Lockers (Locker2Locker API)
Documented in `Done-l2l-API-24042024.docx`. Swagger: `https://l2l-api-test.cleanbox.co.il/swagger/index.html` (test). **Read the Swagger before implementing — the Word doc is incomplete.**

**Auth:** `POST /api/Login` `{ userName, password }` → `{ token, result }`. JWT lifetime observed ≈ 24h. Cache server-side (Firestore `system/doneToken`), refresh on 401 or 1h before `exp`.

**Endpoints we use:**
| Endpoint | Use |
|---|---|
| `GET /api/Station` | Full station list → cached in `lockerStations/{stationNumber}` (refresh every 6h). Show only `isAlive && isAvailableToEveryOne && emptyLockers > 0`. Use `name_en`/`address_en`/`city_en` when English and present, else Hebrew fields. |
| `POST /api/Station/location?lat=&lng=` | Nearest stations with `distance` (unit unconfirmed — treat as km, verify). Used by the locker picker. |
| `POST /api/Order` | Create one shipment leg. Body: `externalOrderNumber` (ours, unique), `toStationNumber`, `fromCustomerFirstName/LastName`, `toCustomerFirstName/LastName`, `fromMobilePhone`, `toMobilePhone`. Response `{ status, message, packageNumber, orderNumber }`. HTTP 200 with `status:false` is a failure. |
| `POST /api/Order/return/{externalOrderNumber}` | After a leg was picked up, create a reversed order (used for disputes/returns). |

**Order status codes (correct table — the v1 PRD was incomplete):**
| Code | DONE name | Meaning | WeLoot leg state |
|---|---|---|---|
| 3 | New | Order created, sender hasn't dropped off | `awaiting_dropoff` |
| 0 | WaitingForPickup | Package in the **source** locker | `deposited` |
| 1 | Picked by Driver | Courier collected it | `in_transit` |
| 4 | In Locker | Package in the **target** locker | `ready_for_pickup` |
| 5 | Is Picked | Receiver collected it | `collected` |
| 6 | Canceled | Cancelled (New orders auto-cancel after **7 days**) | `cancelled` |

**Constraints & gotchas:**
- Phones must be 10-digit Israeli mobiles (`05XXXXXXXX`). Firebase Auth gives E.164 (`+9725XXXXXXXX`) → convert in one shared util with tests.
- `externalOrderNumber` = `{transactionId}-{A|B}` (one per leg). Max length/charset [OPEN-7].
- The create-order request has **no `fromStationNumber`**: confirm whether the sender can drop off at any station [OPEN-7].
- **Status delivery mechanism is undocumented** [OPEN-7]: no webhook or GET-order endpoint appears in the doc. Build `DoneStatusSource` as an interface with two implementations: (a) an HTTPS webhook receiver, (b) a scheduled poller (every 5 min for legs not in a terminal state). Ship whichever DONE supports; both feed the same idempotent `applyLegStatus(legId, code)` function.
- **Drop-off / pick-up codes are undocumented** [OPEN-7]: DONE may SMS codes directly to `fromMobilePhone`/`toMobilePhone`, or return them in an API. The `LockerTrackerScreen` shows the code/QR if we have it; otherwise it shows "Check the SMS from DONE" with the station address and navigation link.
- Test stations: `5100`, `5103`.

### 5.3 Payments — Tranzila
**Reality check:** Tranzila is a card-processing gateway. It does not run a marketplace escrow or pay out to third-party sellers on its own. "Hold, then release to the seller" has to be built by WeLoot, and holding buyers' money for sellers may require a license under Israeli payment-services regulation **[OPEN-2 — legal review required before real money flows]**.

**MVP design (build this; it works with any of the options in OPEN-2):**
- Payment UI: Tranzila hosted page/iframe inside `react-native-webview` (`TranzilaCheckoutModal`). Card data never touches our app or servers (keeps PCI scope minimal). The URL is generated by a Cloud Function (amount, currency ILS, our `paymentId`, notify URL, success/fail URLs).
- Confirmation: Tranzila's server-to-server notify callback hits a Cloud Function. The function verifies the transaction (signature/secret and/or re-query) and is idempotent on `paymentId`. **The WebView redirect alone never marks a payment as paid.**
- Hold strategy behind a `PaymentProvider` interface, chosen by config [OPEN-2]:
  - `capture_then_payout` (default): capture at acceptance into WeLoot's merchant account, record a `held` ledger entry, release → create a `payout` record for the seller (paid by bank transfer — manual/batch in MVP from the Firebase console/Rowy), refund via Tranzila refund API.
  - `preauth` (J5): authorize at acceptance, capture at release. Only viable if the hold window always fits inside the issuer's authorization validity — likely too short for a locker round trip; verify.
- Saved cards: Tranzila tokenization only (store token + last4 + expiry + brand). Never store card numbers.
- Seller bank details for payouts: collected in Settings, stored in a server-only `payoutAccounts/{userId}` doc (not readable by other users; consider encryption at rest) [OPEN-2].
- VAT/invoicing for WeLoot's fees (receipts/tax invoices) [OPEN-3].

---

## 6. MVP Workflows & Acceptance Criteria

### W1 — Trust & Onboarding
*As a gamer, I verify my phone so I know I trade with real people.*
- Phone OTP via **Firebase Auth SMS** (Israeli numbers only, `+972` prefilled). WhatsApp OTP is **not** supported by Firebase Auth; it is a post-MVP option via a custom-token flow [OPEN-4].
- Profile setup: username (unique, 3–20 chars, latin/hebrew/digits/_), city (from a list of Israeli cities → stored with approximate lat/lng + geohash; **never store precise home location**), language, accept TOS & Privacy (versioned, timestamp stored).
- AC: a user without completed profile can't reach the tabs; analytics `user_registered` fires once.

### W2 — Add Game (listing)
*As a seller, I scan or search a game and add real photos so buyers trust my copy.*
1. **Identify:** barcode scan (§5.1 flow) or Assisted Search (Algolia `games`, filtered by platform). User must pick the exact platform.
2. **Photo proof (mandatory):** min 2, max 6 photos — at least one of the disc/cartridge and one of the case. Taken in-app (camera) or from gallery. Client compresses to ≤1600px long edge, JPEG ~0.8, and **strips EXIF/GPS**. Uploaded to `listings/{listingId}/{n}.jpg` in Storage. Storage rules: owner-only writes, images only, ≤5MB.
3. **Details:** condition (`new_sealed`, `like_new`, `good`, `acceptable`), includes original case (bool), notes (≤300 chars), availability: For Trade and/or For Sale; price (required if For Sale, ₪10–₪1,000).
- AC: can't publish without game + platform + ≥2 photos + condition + at least one of trade/sale. `game_listed` analytics event. Listing appears in search within ~10s.

### W3 — Want List & Discovery
*As a collector, I see people who have what I want and want what I have.*
- Users add games to their Want List from search results or a game page (game + optional platform).
- **Perfect Match** = user B has an *active* listing for a game on A's want list **and** A has an *active* listing for a game on B's want list (same platform). Computed by Cloud Functions triggered on listing/wantlist writes, stored in `matches/{userId}/items/{otherUserId}` with the matching listing IDs and a score (more mutual games + shorter distance = higher).
- Home: carousels **Perfect Matches**, **Has games you want** (one-way matches), **New near you** (active listings within the user's radius, newest first).
- Search tab: Algolia `listings` index; filters — platform, trade/sale, condition, price range, distance (Algolia geo search on the listing owner's approximate location). List view and map view (map pins on city-level coordinates, never exact).
- Exclude: own listings, blocked users, listings not `active`.

### W4 — Offers, Quick Add, Negotiation
*As a trader, I add one more game to my offer without leaving the screen. As a buyer, I can add a cash delta by card.*
- **Offer types:** (a) items-for-items, (b) items + cash from either side, (c) cash-only purchase of a For-Sale listing (at listing price or a counter).
- `OfferCreationScreen`: target listing(s) on top; horizontal scroll of my active listings to select; **Quick Add** button opens the W2 flow inline as a modal stack and returns the new listing pre-selected; cash delta input (who pays whom, ₪ integer); summary showing fees (locker fee per side, platform fee on the cash portion) and totals.
- Counter-offers create a new revision on the same transaction (offer history is kept). Either party can accept the *latest* revision only.
- Offers expire after **48h** without response (config).
- Listings in an accepted transaction become `reserved` and leave search; other pending offers that include them are auto-cancelled with a notice.
- `TransactionChatScreen`: realtime messages (text only in MVP), sticky header with the current state, counter/accept/decline actions, system messages for every state change. Sending phone numbers/links in chat shows a warning (anti-off-platform nudge).
- AC: accepting with a cash component opens payment for the payer before the trade becomes `awaiting_dropoff`; `offer_sent`, `offer_accepted` events.

### W5 — Locker Fulfillment
*As a busy professional, I drop my game at a locker on my own time.*
- After acceptance (and payment, if cash is involved), each side picks the locker **where they want to receive**; their counterparty's leg is shipped there. Map + list of nearby stations (§5.2).
- One DONE order per direction: trade → two legs; cash-only sale → one leg (seller → buyer).
- **Drop-off deadline:** 72h after legs are created (config; must be < DONE's 7-day auto-cancel). Reminder push at 24h and 6h before.
- `LockerTrackerScreen` per leg: station map + navigate link, drop-off/pick-up instructions & code (§5.2), and a progress bar `Waiting for drop-off → Deposited → In transit → Ready for pickup → Collected`, updated in realtime from Firestore.
- **Inspection window:** after a leg reaches `collected`, the receiver has **24h** (config) to tap "Report a problem"; otherwise it auto-confirms. A cash hold is released only when every leg the payer is receiving is confirmed.
- **Failure paths:**
  - Neither side dropped off by deadline → cancel all legs, refund any held cash, listings back to `active`.
  - One side dropped off, the other didn't → cancel the missing leg; the deposited package is returned to its owner (return order / DONE support) [OPEN-8]; the defaulting user gets a strike; held cash is refunded to the party that performed.
  - Problem reported → transaction `disputed`, cash stays held, support notified (WhatsApp/email link with transaction ID). Resolution is manual in the Firebase console in MVP.
- **Known risk [OPEN-8]:** in a pure item-for-item trade nothing is held, so A can deposit while B ships a fake. Mitigations for MVP: show trust signals (completed trades, rating, account age), strike system, and require photo proof; consider a small refundable card hold for both sides post-MVP.

### W6 — Ratings & Safety (required for App Store/Play approval of user-generated content)
- After completion each party rates the other (1–5 + optional comment). `users.ratingAvg` / `ratingCount` updated by a function.
- Report user / listing / message; block user (blocked users can't see or message each other). Reports land in `reports` for manual review in the console.
- Delete account (Settings): required by both stores. Deletes/anonymizes personal data, cancels open offers; blocked if a transaction is in fulfillment.

---

## 7. State Machines (implement in `packages/shared`, enforce in Functions)

**Listing:** `draft → active ⇄ paused`; `active → reserved` (on acceptance); `reserved → active` (transaction cancelled) | `traded`/`sold` (completed); any non-reserved → `removed`.

**Transaction (`transactionStatus`):**
```
pending ──counter──▶ pending (new revision)
pending ──decline──▶ declined          (terminal)
pending ──expire───▶ expired           (terminal)
pending ──cancel───▶ cancelled         (terminal, by proposer)
pending ──accept───▶ awaiting_payment  (if cash) ──paid──▶ awaiting_dropoff
                 └─▶ awaiting_dropoff  (if no cash)
awaiting_payment ──payment failed/timeout 30m──▶ cancelled
awaiting_dropoff ──all legs deposited──▶ in_fulfillment
awaiting_dropoff / in_fulfillment ──deadline missed──▶ failed (refunds/returns run)
in_fulfillment ──all legs collected──▶ inspection
inspection ──all confirmed / window passed──▶ completed (cash released)
inspection ──problem reported──▶ disputed ──resolved by ops──▶ completed | refunded
```

**Escrow (`escrowStatus`):** `none | pending | held | released | refunded | disputed`.

**Locker leg:** `awaiting_dropoff(3) → deposited(0) → in_transit(1) → ready_for_pickup(4) → collected(5)`; `cancelled(6)` from any non-collected state. Out-of-order or duplicate status events are ignored (log only).

---

## 8. Data Model (Firestore)

All docs have `createdAt`, `updatedAt` (server timestamps). `🔒` = server-write only.

| Collection | Key fields |
|---|---|
| `users/{uid}` | `phoneE164`, `username`, `usernameLower`, `city`, `geo {lat,lng,geohash}` (city-level), `preferredLanguage ('he'\|'en')`, `ratingAvg🔒`, `ratingCount🔒`, `completedTrades🔒`, `strikes🔒`, `paymentMethodLinked🔒`, `payoutLinked🔒`, `tosVersion`, `tosAcceptedAt`, `fcmTokens[]`, `blockedUserIds[]`, `deletedAt` |
| `usernames/{usernameLower}` | `uid` (uniqueness guard, written in a transaction) |
| `games/{igdbId}` 🔒 | `title`, `slug`, `platformIds[]`, `coverImageId`, `releaseDate`, `genres[]`, `altNames[]` |
| `barcodes/{ean}` 🔒 | `igdbGameId`, `platformId`, `confirmations`, `trusted` |
| `listings/{id}` | `userId`, `igdbGameId`, `platformId`, denormalized `gameTitle`, `coverImageId`, `condition`, `hasCase`, `notes`, `isForTrade`, `isForSale`, `priceAgorot`, `photoPaths[]`, `status`🔒 (after create), `geo` (copied from owner) |
| `wantlist/{uid}/items/{igdbGameId_platformId}` | `igdbGameId`, `platformId`, `gameTitle` |
| `matches/{uid}/items/{otherUid}` 🔒 | `theirListingIds[]`, `myListingIds[]`, `perfect`, `score`, `distanceKm` |
| `transactions/{id}` | `participants[uidA, uidB]`, `proposerId`, `currentRevision`, `revisions[]` (each: `itemsA[]`, `itemsB[]`, `cashDeltaAgorot`, `cashPayerId`, `fees`, `createdBy`, `createdAt`), `transactionStatus`🔒, `escrowStatus`🔒, `fulfillmentMethod: 'locker'`, `legIds[]`🔒, `deadlines`🔒, `paymentId`🔒 |
| `transactions/{id}/messages/{id}` | `senderId` (`'system'` for system messages), `text`, `type`, `createdAt` |
| `lockerLegs/{id}` 🔒 | `transactionId`, `fromUid`, `toUid`, `externalOrderNumber`, `doneOrderNumber`, `packageNumber`, `toStationNumber`, `status`, `doneStatusCode`, `codes?`, `history[]`, `confirmedAt?`, `problemReportedAt?` |
| `lockerStations/{stationNumber}` 🔒 | cached DONE station fields + `geohash` |
| `payments/{id}` 🔒 | `transactionId`, `payerId`, `amountAgorot`, `feesAgorot`, `provider`, `providerRef`, `status`, `history[]` |
| `payouts/{id}` 🔒 | `userId`, `transactionId`, `amountAgorot`, `status ('pending'\|'paid')`, `paidAt` |
| `payoutAccounts/{uid}` 🔒 | bank details (owner write via callable function only; never client-readable by others) |
| `ratings/{transactionId_raterId}` | `raterId`, `rateeId`, `stars`, `comment` |
| `reports/{id}` | `reporterId`, `targetType`, `targetId`, `reason`, `details` |
| `events/{id}` 🔒 | audit log of every external callback and state transition |
| `config/fees`, `config/limits` | admin-edited values (fees, deadlines, windows) |
| `system/*` 🔒 | provider tokens — denied to all clients |

Composite indexes live in `firestore.indexes.json`. Security rules are tested in CI for every collection: users can read public profile fields of others, write only their own permitted fields; transaction/messages readable only by participants; all 🔒 fields/collections client-write denied.

---

## 9. Screen Inventory

**A. Onboarding (stack):** `Splash` (logo animation, auth check) → `PhoneAuth` (phone → OTP, resend timer 30s) → `ProfileSetup` (username, city, language, TOS).

**B. Tabs (custom hide-on-scroll bar):**
1. `Home` — Perfect Matches, Has-what-you-want, New near you.
2. `Search` — query + filters, list/map toggle.
3. `Add` (center `+`) — `Identify (Scan | Search)` → `PhotoProof` → `Details` → success.
4. `Inbox` — transactions grouped: Needs action / Active / Completed; unread badges; locker status chips.
5. `Profile` — My Listings, Want List, ratings, Settings.

**C. Transaction stack:** `GameDetail` (cover art, photos gallery, owner card with trust signals, Make Offer / Buy), `OfferCreation` (with Quick Add modal), `TransactionChat`, `TranzilaCheckoutModal`, `LockerPicker`, `LockerTracker`, `RateUser`, `ReportProblem`.

**D. Settings:** Account (username, phone (re-verify), delete account) · Preferences (language, city, search radius) · Payments (saved cards, payout bank account) · Notifications (offers, messages, locker updates) · Support (WhatsApp deep link `https://wa.me/<EXPO_PUBLIC_SUPPORT_WHATSAPP>?text=` prefilled with user ID; email fallback via `mailto:`) · Legal (TOS, Privacy — remote URLs, both languages) · App version.

---

## 10. Notifications (FCM)
Push + in-app inbox badge for: new offer, counter-offer, offer accepted/declined/expired, new chat message (collapsed per transaction), payment succeeded/failed, leg status changes, drop-off deadline reminders, inspection window ending, rating request. Text localized server-side using the recipient's `preferredLanguage`.

---

## 11. Analytics, Admin, Support
- **Analytics** (`@react-native-firebase/analytics`), events: `user_registered`, `game_listed`, `wantlist_added`, `offer_sent`, `offer_accepted`, `payment_completed`, `locker_dropoff`, `transaction_completed`, `transaction_failed`, `dispute_opened`. No PII in event params (IDs only).
- **Crash reporting:** Firebase Crashlytics.
- **Admin:** Firebase console / Rowy only. No admin screens. Ops tasks (resolve disputes, mark payouts paid, edit `config/*`) are done there; functions react to those writes where needed (e.g., `payouts.status → paid` notifies the seller).
- **Support:** WhatsApp/email deep link only.

---

## 12. Non-Functional Requirements
- **Performance:** cold start < 3s on a mid-range Android; feed images via `expo-image` with caching; lists virtualized.
- **Privacy (Israeli Privacy Protection Law incl. Amendment 13):** data minimization, city-level location only, EXIF stripped, privacy policy in Hebrew, account deletion, server-only storage of payout details. Counterparty's phone number is shared only with DONE, never shown in-app.
- **Accessibility:** labels on all touchables, dynamic type up to 1.3×, contrast AA, RTL screen reader order.
- **Security:** App Check (Play Integrity / App Attest) on Functions and Firestore; rate-limit callable functions (offers, messages, barcode lookups) per user.
- **Platforms:** iOS 15+ and Android 8+ (verify against the chosen Expo SDK's minimums).

---

## 13. Environments & Configuration
- `.env.example` (app, public only): `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_ALGOLIA_APP_ID`, `EXPO_PUBLIC_ALGOLIA_SEARCH_KEY`, `EXPO_PUBLIC_SUPPORT_WHATSAPP`, `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_ENV`.
- Functions secrets (Secret Manager): `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `DONE_USERNAME`, `DONE_PASSWORD`, `DONE_BASE_URL`, `TRANZILA_TERMINAL`, `TRANZILA_API_KEY`/secret, `TRANZILA_NOTIFY_SECRET`, `ALGOLIA_ADMIN_KEY`, `UPC_LOOKUP_API_KEY`, `DONE_WEBHOOK_SECRET` (if webhooks exist).
- EAS Build profiles: `development`, `preview` (staging), `production`.

---

## 14. Open Questions (owner: product/business — the agent must not decide these)

| ID | Question | Default until answered |
|---|---|---|
| OPEN-1 | Platform fee % (on cash portion) and locker fee per leg (₪)? Who pays the locker fee in a trade — each sender? Is DONE's per-shipment cost known? | `config/fees`: platform 8%, locker ₪15 per leg paid by the sender (placeholders) |
| OPEN-2 | Legal structure for holding buyer funds (license, a licensed payment facilitator/marketplace provider, or capture-and-manual-payout)? Tranzila terminal type, J5 availability, refund API access. | `capture_then_payout` in test mode only |
| OPEN-3 | Who issues receipts/tax invoices for WeLoot fees (VAT 18%)? Invoicing provider? | Not built |
| OPEN-4 | Is WhatsApp OTP a must-have for launch, or is SMS OK? | SMS via Firebase |
| OPEN-5 | IGDB commercial-use agreement signed? | Proceed in dev |
| OPEN-6 | Which UPC/EAN lookup provider (cost, Israeli barcode coverage)? | Interface + mock |
| OPEN-7 | DONE: webhook or status polling endpoint? Sender drop-off station selectable? How do users get drop-off/pick-up codes? `externalOrderNumber` format limits? Production credentials & pricing? | Both status sources behind interface; "check SMS" UI |
| OPEN-8 | Policy for one-sided trade failures and fake/damaged items in cash-free trades (returns, strikes, bans, deposits)? | Strikes + manual handling |
| OPEN-9 | Minimum age / ID requirements? | 16+ checkbox in TOS |
| OPEN-10 | Branding assets (logo, final colors, app icon, splash)? | Placeholder tokens §3.1 |
