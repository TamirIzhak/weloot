# WeLoot — Product Requirements Document (MVP) · v3

> Source of truth for *what* to build. For *how* to work (branching, commits, PRs, checks) see `CLAUDE.md`. For the ordered work list see `docs/BACKLOG.md`.
>
> Anything marked **[OPEN]** is an unresolved business/legal/vendor question. Do not invent an answer: build behind a config value or interface and leave a `TODO(OPEN-x)` that references the question in §14.
>
> **v3 (2026-10-19, issue #46): lean MVP.** Prove that Israeli gamers want a dedicated swap app before adding money handling. No payments, escrow or lockers: users agree a deal in the app and swap in person, and any cash top-up is paid outside the app. Payments and lockers are **Phase 2** (Appendix A).

---

## 1. Product Overview

| | |
|---|---|
| **Name** | WeLoot |
| **Market** | Israel only (ILS, Hebrew + English, Israeli mobile numbers) |
| **Audience** | Owners of physical console games: PS5, PS4, Nintendo Switch / Switch 2, Xbox Series X\|S, Xbox One |
| **Positioning** | The first app built only for swapping physical games. Today gamers trade in Facebook/WhatsApp groups and general second-hand apps, where games are mixed with everything else and nothing understands "I have X, I want Y". |
| **Core loop** | List a game in seconds (barcode or search) → get matched (Have/Want) or search → make an offer or ask a question → agree the deal in chat (games + optional cash top-up) → meet and swap → both confirm "Trade completed" → rate each other |
| **Revenue (MVP)** | None. Monetization (fees on in-app payments, locker convenience) comes with Phase 2. |

### 1.1 Out of scope for the MVP — do NOT build
- **Phase 2 (designed, deferred):** in-app payments, escrow, payouts (Tranzila); smart-locker delivery (DONE); fees. See Appendix A.
- **Not planned:** gamification (levels, XP, achievements, daily rewards), AI condition grading, custom admin/support dashboards, in-app ticketing, digital games/codes, accessories/consoles, multi-currency, a web client (beyond Expo web used for dev previews), map views.

### 1.2 Engagement principle: real signals only
The app should always feel alive and never leave the user at a dead end, **using only real data**:
- ✅ Instant search with skeletons, real alternatives when nothing matches, "notify me" alerts, real demand and supply counts, new-listing alerts.
- ❌ Never fake listings, users, activity, counts or "searching…" states that pretend work is happening. They destroy trust in a marketplace, can break app store rules and Israeli consumer protection law, and gaming communities are small and talk.

### 1.3 Success metrics (Firebase Analytics, §11)
Registration → first listing; listings per user; searches with zero results (and how many become alerts); conversations started per active user (offer vs question); offer → accepted rate; accepted → completed rate; 7-day and 30-day retention; alert → return rate.

### 1.4 Launch strategy (not code, but shapes priorities)
Launch where liquidity is easiest: one region first (Gush Dan by default) and the most traded consoles (PS5, Switch). Seed real listings with the founding team and gaming-group admins. Every shared listing advertises the app. [OPEN-11]

---

## 2. Decided Tech Stack

These are decisions, not suggestions. Changing one requires the user's approval.

| Concern | Choice | Notes |
|---|---|---|
| App | **Expo (React Native) SDK — latest stable**, TypeScript strict | Uses a **development build** (`expo-dev-client`), not Expo Go, because native Firebase modules are required |
| Routing | **Expo Router** (file-based, built on React Navigation) | Custom tab bar for hide-on-scroll (§3.4) |
| Styling | **NativeWind** (Tailwind for RN) + a `theme.ts` token file | Use logical utilities only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) for RTL |
| Animation | `react-native-reanimated` | Tab bar, splash, skeletons |
| Client state | **Zustand** for UI/session state; **TanStack Query** for request caching; Firestore `onSnapshot` listeners for realtime data (chat, offers, deal status) | No Redux |
| Validation | **zod** at every boundary (forms, Cloud Function inputs, third-party responses) | |
| i18n | `i18next` + `react-i18next` + `expo-localization` | §3.5 for RTL mechanics |
| Backend | **Firebase**: Auth, Firestore, Storage, Cloud Functions (2nd gen, Node 22, TypeScript), Cloud Scheduler, FCM, Analytics, Crashlytics, Remote Config | Region: **`me-west1` (Tel Aviv)** for Firestore, Storage and Functions in every project (ADR 0001) |
| Firebase SDK | `@react-native-firebase/*` | |
| Search | **Algolia** (game catalog index + listings index), synced from Firestore by Cloud Functions | Firestore alone can't do fuzzy search |
| Camera / barcode | `expo-camera` (`CameraView` with EAN-13/UPC-A) + `expo-image-picker` + `expo-image-manipulator` | |
| Push | FCM via `@react-native-firebase/messaging` | |
| Sharing | React Native `Share` + Firebase Hosting landing pages for shared links (§6 W7) | |
| Testing | Jest + React Native Testing Library; Firebase Emulator Suite for rules & functions; `@firebase/rules-unit-testing` | |
| CI | GitHub Actions: install → typecheck → lint → test (app, functions, rules) on every PR | |
| Envs | Three Firebase projects: `development-1c64a` (alias `dev`), `staging-d0c10` (`staging`), `weloot-c5fb2` (`prod`); emulators use `demo-weloot` | |

Phase 2 adds Tranzila (payments) and DONE (lockers); see Appendix A.

### 2.1 Repo layout (monorepo, npm workspaces)
```
/app                 Expo app (Expo Router: src/app/(onboarding), (tabs), (deal) …)
  /src/components    Reusable UI
  /src/features/*    Feature modules (auth, listings, search, alerts, conversations, offers, profile, safety)
  /src/i18n          i18next setup + locales/en.json, locales/he.json
  /src/theme         Design tokens
  /src/lib           firebase, analytics, api clients (call Functions only)
/functions           Cloud Functions (TypeScript)
  /src/igdb  /src/algolia  /src/conversations  /src/matching  /src/alerts  /src/notifications  /src/share
/packages/shared     Shared TS types + zod schemas (Firestore models, enums, state machines)
/rules-tests         Security rules tests (emulators)
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
| `accent` | `#00E5FF` (neon cyan) | Highlights, match badges, "Real photos" badge |
| `success` / `warning` / `danger` | `#22C55E` / `#F59E0B` / `#EF4444` | Status, errors |
| `psBlue` / `xboxGreen` / `nintendoRed` | `#0070D1` / `#107C10` / `#E60012` | Platform chips & card edge accents only |
| Radius | cards 16, buttons 12, chips 999 | |
| Spacing | 4-pt scale | |

Text contrast must meet WCAG AA (4.5:1) against `bg`/`surface`.

### 3.2 Typography
**Rubik** (Google Fonts, supports Hebrew + Latin) via `expo-font`. Large bold headers (28/22/18), body 16, caption 13. One font family for both languages so layouts don't jump on language switch.

### 3.3 Layout
Card-based feeds; game cards are rounded and cover-art-first. A card shows the owner's first photo when the listing has photos (with the **"Real photos"** badge), otherwise the IGDB cover (`t_cover_big` / `t_720p`). Also: platform chip, condition, "Trade" and/or price badge, distance (city level). Every list has a loading skeleton, a helpful empty state (§6 W4) and an error state with retry.

**Adaptive listing grid (issue #57).** Listing feeds (search results, "New near you", "Has games you want" full lists) use one shared `ListingGrid` with a density of **1, 2 or 3 tiles per row, default 2** (Marketplace style: more games per screen).
- **Pinch** out for bigger tiles (fewer columns), pinch in for more tiles: one step per gesture, animated, keeping the scroll position.
- A **visible layout toggle** (1/2/3 icon button) sits at the top of each feed, because pinch alone is hard to discover and not usable by everyone.
- The choice is **remembered per user**: on the device first, synced to the profile once profiles exist.
- **Tile content adapts to density:**

| Density | Tile shows |
|---|---|
| 1 per row | Full card: cover/photo, title, platform chip, condition, distance, badges, price/"Trade" |
| 2 per row | Cover, title (max 2 lines), platform chip, price or "Trade", "Real photos" badge |
| 3 per row | Cover with a platform color strip and price/"Trade" badge; title read by screen readers |

- Columns fill start → end (mirrors in RTL); works with the hide-on-scroll tab bar (§3.4).
- Horizontal Home carousels keep fixed-size cards; the grid applies to vertical feeds.

### 3.4 Bottom tab bar (hide-on-scroll)
Custom tab bar, 5 destinations, center `+` elevated. Scrolling **down** past a 10px threshold slides it out (translateY, ~200ms); **any** upward scroll brings it back immediately. Always visible when: content is shorter than the screen, scroll is at top, keyboard is closed after input, or a screen opts out. Implemented with a shared Reanimated scroll value exposed by a `useHideOnScroll()` hook that feed screens attach to their `FlatList`/`ScrollView`. Respect safe-area insets.

### 3.5 Localization & RTL (strict)
- Every user-facing string is an i18n key in `en.json` **and** `he.json`. Keys are namespaced by feature (`offers.cash.label`). A CI check fails if a key is missing from either file.
- Default language = device language if Hebrew, else English. User can change it in Profile Setup and Settings.
- **RN mechanics:** layout direction in React Native is set via `I18nManager.forceRTL()` and **only takes effect after an app reload**. On language change: save preference → `I18nManager.allowRTL(true); I18nManager.forceRTL(isHebrew)` → `Updates.reloadAsync()` (expo-updates). Show a short "Applying language…" state. Enable RTL support in the Expo app config (expo-localization plugin `supportsRTL`).
- Use logical styles only (`marginStart`, `paddingEnd`, NativeWind `ms-/me-`). Directional icons (back arrows, chevrons) flip in RTL; media controls and logos don't.
- Numbers, prices, phone numbers and game titles inside Hebrew text are wrapped so they render LTR correctly (bidi isolation).
- Game titles come from IGDB in English and stay English in both languages.
- Prices formatted with `Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS' })`.

### 3.6 Errors
A shared `<ErrorState>` / toast component in the dark theme. Every async call shows a localized, human message (mapped from typed error codes, never raw API messages) and a retry where it makes sense. A root React error boundary catches render crashes.

---

## 4. Architecture Principles

1. **The client never talks to IGDB, Algolia admin or other third-party APIs with secrets.** Those calls go through Cloud Functions. The client reads Algolia only with a search-only key.
2. **Secrets live in Firebase Secret Manager** (`defineSecret`), never in the app bundle. Anything in the app's `.env` prefixed `EXPO_PUBLIC_` is **public**. A `.env.example` lists every variable with a comment.
3. **The server owns state.** Clients may create listings, messages and offer *requests*; only Cloud Functions change offer status, deal status, listing reservation, ratings aggregates, trade counts and match/alert data. Enforced by Firestore Security Rules + rules tests.
4. **Money is integer agorot** (`amountAgorot: number`, 100 = ₪1), even though the MVP only records agreed amounts. Never floats.
5. **All timestamps are Firestore server timestamps.**
6. **State machines are explicit** (§7) and defined once in `packages/shared`; any transition not in the table is rejected.
7. **Built for Phase 2:** keep deal fulfillment behind a `fulfillmentMethod` field (`'in_person'` in the MVP) so payments and lockers can be added without reshaping data.

---

## 5. External Integrations

### 5.1 IGDB (Twitch) — game catalog
- **Auth:** Twitch `client_credentials` → app access token (~60-day expiry). Cache the token in Firestore `system/igdbToken` (server-only) and refresh on 401 or near expiry.
- **Rate limit:** 4 requests/second; queue requests in the sync job.
- **Catalog sync (scheduled function, nightly + on-demand admin trigger):** pull games for the target platforms, main games only (exclude DLC, bundles, mods; use IGDB's game type field). Platform IDs: PS4 `48`, PS5 `167`, Switch `130`, Xbox One `49`, Xbox Series X|S `169`; **verify Switch 2's ID** before adding it. Store `games/{igdbId}` (title, slug, platforms, cover image id, first release date, genres, alternative names, **similar games** for suggestions) and push to the Algolia `games` index.
- **Licensing [OPEN-5]:** IGDB's terms require a separate agreement for commercial use. Confirm before launch.
- **Barcodes:** IGDB does **not** reliably map UPC/EAN barcodes to games. Approach:
  1. Look up `barcodes/{ean}` (our own mapping table).
  2. On miss → call a UPC lookup provider via Cloud Function [OPEN-6] to get a product title → fuzzy-search Algolia `games` → show top results for the user to confirm.
  3. When the user confirms a game for a scanned barcode, write the mapping (`barcodes/{ean}` → `{igdbGameId, platformId, confirmations}`), so the catalog gets better with use. Mappings with ≥2 independent confirmations are auto-trusted.
  4. Always allow falling back to manual search. Free-text titles are **not** allowed.

### 5.2 Algolia
Two indexes, written only by Cloud Functions: `games` (catalog) and `listings` (only `active` listings, with `_geoloc` at city level, platform, condition, trade/sale, price, `hasPhotos`). Ranking boosts `hasPhotos` and recency. The app queries with a search-only key.

---

## 6. MVP Workflows & Acceptance Criteria

### W1 — Guest browsing, sign-in on action & trust
*As a visitor, I browse freely. When I want to do something, I verify my phone in seconds and carry on.*

**Guest first (owner decision, 2026-10-21).** The app opens straight to the tabs; nobody has to sign in to look around.
- **Open to guests:** Home, Search, game pages (cover, photos, owner's username, city and trust signals), and sharing.
- **Needs sign-in:** make an offer, ask a question, add to the want list, "notify me" alerts, add a listing (+), Inbox, and the owner's own profile data.
- **Sign in at the moment of intent, never a locked page.** A protected action opens a **sign-in sheet** (modal) with a reason tied to the action, e.g. *"Sign in to send your offer"*. After verification, the sheet closes and **the original action continues** (the offer composer opens, the game is added to the want list, the Add flow starts…).
- **Tab bar is identical for everyone.**
  - **+ (Add)** and **Inbox** open the sign-in sheet for guests, then continue to the tab.
  - **Profile** is useful for guests too: a **"Join WeLoot"** card plus language, support and terms; signed-in users get their full profile.

**The sign-in sheet**
- Phone OTP via **Firebase Auth SMS** (Israeli mobiles only, `+972` prefilled), then the 6-digit code (auto-submit, 30 s resend). WhatsApp OTP is **not** supported by Firebase Auth; it is a post-MVP option via a custom-token flow [OPEN-4].
- **Profile setup** runs inside the same sheet right after a first sign-in (#9): username (unique, 3–20 chars, Latin/Hebrew/digits/_), city (from a list of Israeli cities → approximate lat/lng + geohash; **never store a precise home location**), language, accept TOS & Privacy (versioned, timestamp stored). The pending action continues only once the profile is complete.
- The guest can close the sheet at any time; nothing is lost and they keep browsing.
- AC: guests can browse Home, Search and game pages; every protected action opens the sheet with its reason and continues after sign-in; `sign_in_prompted` (with `reason`) on every sheet open; `user_registered` once per new user.

### W2 — Add Game (listing) — fast by default
*As a gamer, I list a game in seconds, and can add real photos to get more offers.*
1. **Identify:** barcode scan (§5.1 flow) or search (Algolia `games`, filtered by platform). User must pick the exact platform.
2. **Details:** condition (`new_sealed`, `like_new`, `good`, `acceptable`), includes original case (bool), notes (≤300 chars), availability: For Trade and/or For Sale; asking price (required if For Sale, ₪10–₪1,000, informational — paid outside the app).
3. **Photos (optional):** up to 6, taken in-app or from the gallery. Client compresses to ≤1600px long edge, JPEG ~0.8, and **strips EXIF/GPS**. Uploaded to `listings/{listingId}/{n}.jpg` in Storage (owner-only writes, images only, ≤5MB). Listings with ≥1 photo get the **"Real photos"** badge and a ranking boost. After publishing without photos, show one nudge: "Add a photo of your disc to get more offers".
- **Quick Add:** the whole flow is reusable as a modal that returns the new listing (used from the offer composer, W5).
- AC: can't publish without game + platform + condition + at least one of trade/sale. Publishing takes under ~15 seconds with barcode and no photos. `game_listed` event (with `hasPhotos`). Listing appears in search within ~10s.

### W3 — Want List & Matches
*As a collector, I see people who have what I want and want what I have.*
- Users add games to their Want List from search results, a game page, or an empty search (W4) (game + optional platform).
- **Perfect Match** = user B has an *active* listing for a game on A's want list **and** A has an *active* listing for a game on B's want list (same platform). **One-way match** = B has something A wants. Computed by Cloud Functions on listing/wantlist writes, stored in `matches/{userId}/items/{otherUserId}` with listing IDs and a score (more mutual games + shorter distance + photos = higher).
- Home: carousels **Perfect Matches**, **Has games you want**, **New near you**, plus **"Wanted near you"** (real counts of nearby users who want games the user owns, e.g. "4 people near you want Zelda TOTK"). "See all" on a carousel opens the full list in the adaptive listing grid (§3.3).
- Exclude everywhere: own listings, blocked users, listings not `active`.

### W4 — Search & never a dead end
*As a gamer, I search for a game and always get something useful.*
- Search tab: Algolia `listings`; filters: platform, trade/sale, condition, price range, distance (city-level geo). Results in the adaptive listing grid (§3.3: 1–3 per row, default 2, pinch or layout toggle).
- Instant results with skeletons while loading; recent searches and popular games when the query is empty.
- **When nothing matches**, show in order (all real data):
  1. "No one has it yet" plus **"Notify me when it's listed"** (creates a saved search / alert, W8) and **"Add to my want list"**.
  2. The same game on other platforms, if listed.
  3. Similar games that are listed (IGDB similar games / same genre).
  4. Relaxed filters ("12 results if you widen to 50 km").
- AC: zero-result searches log `search_no_results`; every empty state has at least one action.

### W5 — Conversations & Offers
*As a gamer, I start a deal with a concrete offer, or just ask a question first.*
- **Openers on a game page** (only while the viewer has no conversation with that owner about that listing): primary **"Make an offer"** and secondary **"Ask a question"**. Either one creates the conversation. Once it exists, both are replaced by **"Open chat"**.
- **One conversation per (listing, interested user)**; the listing owner sees it in the Inbox.
- **Free chat:** realtime text messages. System messages for every offer/deal change. A "safety tips" card appears when a deal is agreed (W6).
- **Offer card** (can be sent at any time by either side from the chat's offer button):
  - Games: the listing owner's game(s) on one side, the offerer's game(s) on the other (horizontal picker of their active listings + **Quick Add**, W2).
  - Optional **cash top-up** in either direction (who pays whom, whole ₪, ≤ ₪2,000) and an optional note. For a For Sale listing, a cash-only offer is allowed.
  - Shown in the chat as a card with both sides' covers, the cash line, the note and **Accept / Counter / Decline** for the recipient (the sender can **Withdraw**).
  - **Counter** opens the composer prefilled; sending it supersedes the previous offer. Only the latest pending offer can be accepted.
  - Offers expire after **72h** without response (config).
  - Cash is **recorded, not processed**; the card says "Paid in person or by Bit".
- **Accepting** creates the conversation's **deal** (W6). All listings in it become `reserved` (hidden from search); other pending offers that include those listings are auto-declined with a system message.
- AC: `conversation_started` (with `opener: offer|question`), `offer_sent`, `offer_countered`, `offer_accepted` events; rules prevent anyone but the two participants from reading or writing the conversation.

### W6 — Deal, meetup & closing the swap
*As an owner, I close my listing the moment I've swapped it. As a trader, a confirmed trade builds my reputation.*

Closing a swap has two separate jobs with different rules (owner decision, 2026-10-20):

**1. Listing accuracy: the owner decides alone, immediately.**
- On any own listing (active, paused or reserved) the owner taps **"Swapped"** (or **"Sold"** for a sale) and answers **"Who with?"**:
  - the counterpart of an accepted deal on that listing (suggested first);
  - people they recently chatted with about that listing (last 30 days);
  - **"Someone outside WeLoot"**.
- The listing becomes `traded` / `sold` at once and leaves search and matches. Nothing waits on the other person, so listings never get stuck as reserved.
- "Outside WeLoot" closes the listing without a deal (`closedWith: outside`); it's tracked for analytics (`listing_closed_outside`).

**2. Trust (trade count and ratings): both people must confirm.**
- Choosing a WeLoot user records the owner's confirmation on their deal (it's created if there was no accepted offer yet, e.g. they agreed in chat), and the other person gets a one-tap prompt (push + chat banner): *"Did you swap {game} with {owner}?"* → **Yes / No**.
- **Yes** → deal `completed`: the trade counts for both (`completedTrades` +1) and both are asked to rate each other (W9). Ratings exist **only** for completed deals.
- **No answer within 7 days** (reminders on day 1 and 3) → deal `unconfirmed`: no trade count, no ratings. Listings are unaffected (already closed by their owners).
- **"No, it didn't happen"** → deal `disputed`, a report is opened for support (W9). Support resolves it to `completed` or `cancelled`.
- Either side may confirm first: in a game-for-game swap each owner closes their own listing, and the second owner's "Swapped" doubles as the other confirmation.

**Around the meetup**
- After an offer is accepted the chat header shows the **deal summary** (games, cash, status) and actions **"Swapped"** and **"Cancel deal"**.
- **Safety tips card** (shown once per deal, both languages): meet in a public place, check the disc/cartridge before swapping, prefer Bit over carrying cash, never pay in advance to someone you haven't met, report anything suspicious.
- **Swap reminder:** 2 days after acceptance, if nobody has closed it, both get *"Did the swap happen?"* with Swapped / Not yet / Cancel.
- **Cancel deal** (before anyone confirmed, either side, reason required) → reserved listings back to `active`; repeated cancellations are visible to support.
- AC: a listing closes on its owner's action alone; trade counts and ratings require both confirmations; `listing_closed`, `listing_closed_outside`, `deal_confirmed`, `deal_completed`, `deal_cancelled`, `deal_disputed` events.

### W7 — Share to WhatsApp / Facebook
*As a gamer, I share my listing or want list to my gaming groups.*
- Share button on own listings, any game page, and the want list. Uses the native share sheet with localized text + a link `https://<hosting-domain>/l/{listingId}` (Firebase Hosting [OPEN-12]).
- The landing page shows the game cover, title, platform and condition (no personal data beyond username and city) and buttons "Open in WeLoot" / "Get the app" (store links; before store release: a "coming soon" message).
- In the app, opening the link (Android App Links / iOS Universal Links via Expo Router) goes straight to the game page.
- AC: `listing_shared` event; landing pages never expose phone numbers, exact location or photos of a removed listing.

### W8 — Alerts ("Notify me")
*As a collector, the app tells me when a game I want shows up.*
- Saved searches from W4 and every want-list item act as alerts. A Cloud Function on new/reactivated listings finds matching alerts (game + platform, within the user's radius) and sends a push: "Zelda TOTK (Switch) was just listed in Ramat Gan".
- Rate limits: max 1 push per alert per 6 hours, max 5 alert pushes per user per day; the rest go to an in-app "New for you" list.
- Users manage alerts in Profile → Alerts.
- AC: `alert_created`, `alert_notified`, `alert_opened` events.

### W9 — Ratings, Reporting & Safety (required for App Store/Play approval of user-generated content)
- After a completed deal each party rates the other (1–5 + optional comment). `users.ratingAvg` / `ratingCount` / `completedTrades` updated by a function. Profiles show these plus account age as **trust signals**.
- **Report** a user, listing or message (reason + details); **block** a user (blocked users can't see each other's listings or message each other). Reports land in `reports` for manual review in the console; support contact via WhatsApp/email link.
- Delete account (Settings): required by both stores. Deletes/anonymizes personal data, cancels open offers and deals.

---

## 7. State Machines (implement in `packages/shared`, enforce in Functions)

**Listing** (owner-controlled closing, W6):
```
draft ──publish──▶ active ⇄ paused                    (pause / resume, owner)
active ──reserve──▶ reserved                           (an offer including it is accepted, system)
reserved ──release──▶ active                           (that deal is cancelled, system)
active | paused | reserved ──closeTraded──▶ traded     (owner taps "Swapped")
active | paused | reserved ──closeSold────▶ sold       (owner taps "Sold")
draft | active | paused ──remove──▶ removed            (owner)
```
`traded`, `sold` and `removed` are final; to offer the game again the owner lists it anew.

**Offer** (one pending per conversation):
```
pending ──accept────▶ accepted     (creates the deal)
pending ──decline───▶ declined
pending ──counter───▶ superseded   (new pending offer from the other side)
pending ──withdraw──▶ withdrawn    (by sender)
pending ──72h───────▶ expired
pending ──listing reserved elsewhere / removed──▶ declined (system)
```

**Deal** (at most one active per conversation; `fulfillmentMethod: 'in_person'`). Its status only affects trust (trade counts, ratings); listings are closed by their owners (W6).
```
agreed ──first confirm──▶ awaiting_confirmation ──second confirm──▶ completed
   (a deal created by an owner's "Swapped" without an accepted offer starts in awaiting_confirmation)
agreed ──cancel (reason)──▶ cancelled
awaiting_confirmation ──7 days without the second confirm──▶ unconfirmed
awaiting_confirmation ──"it didn't happen" (the side asked to confirm)──▶ disputed
disputed ──ops resolves──▶ completed | cancelled
```
Each participant confirms at most once. Only `completed` deals increment `completedTrades` and allow ratings.

---

## 8. Data Model (Firestore)

All docs have `createdAt`, `updatedAt` (server timestamps). `🔒` = server-write only.

| Collection | Key fields |
|---|---|
| `users/{uid}` | `phoneE164`, `username`, `usernameLower`, `city`, `geo {lat,lng,geohash}` (city-level), `preferredLanguage ('he'\|'en')`, `ratingAvg🔒`, `ratingCount🔒`, `completedTrades🔒`, `tosVersion`, `tosAcceptedAt`, `fcmTokens[]`, `blockedUserIds[]`, `searchRadiusKm`, `deletedAt` |
| `usernames/{usernameLower}` | `uid` (uniqueness guard, written in a transaction) |
| `games/{igdbId}` 🔒 | `title`, `slug`, `platformIds[]`, `coverImageId`, `releaseDate`, `genres[]`, `altNames[]`, `similarGameIds[]` |
| `barcodes/{ean}` 🔒 | `igdbGameId`, `platformId`, `confirmations`, `trusted` |
| `listings/{id}` | `userId`, `igdbGameId`, `platformId`, denormalized `gameTitle`, `coverImageId`, `condition`, `hasCase`, `notes`, `isForTrade`, `isForSale`, `askingPriceAgorot`, `photoPaths[]`, `hasPhotos🔒`, `status🔒` (after create), `geo` (copied from owner), `closedWith🔒?` (`{kind: 'deal', userId, conversationId}` or `{kind: 'outside'}`), `closedAt🔒?` |
| `wantlist/{uid}/items/{igdbGameId_platformId}` | `igdbGameId`, `platformId`, `gameTitle` |
| `alerts/{uid}/items/{id}` | `igdbGameId`, `platformId?`, `query?`, `radiusKm`, `source ('search'\|'wantlist')`, `lastNotifiedAt🔒` |
| `matches/{uid}/items/{otherUid}` 🔒 | `theirListingIds[]`, `myListingIds[]`, `perfect`, `score`, `distanceKm` |
| `conversations/{id}` | `listingId`, `ownerId`, `otherId`, `participants[2]`, `openedWith ('offer'\|'question')`, `lastMessageAt🔒`, `lastMessagePreview🔒`, `unread {uid: n}🔒`, `currentOfferId🔒`, `deal🔒 {status, offerId? (absent when an owner's "Swapped" created the deal), itemsOwner[], itemsOther[], cashAgorot, cashPayerId, confirmedBy[], awaitingSince?, fulfillmentMethod: 'in_person', agreedAt, completedAt?, cancelReason?}` |
| `conversations/{id}/messages/{id}` | `senderId` (`'system'` for system messages), `type ('text'\|'offer'\|'system'\|'safety_tips')`, `text?`, `offerId?`, `createdAt` |
| `conversations/{id}/offers/{id}` | `fromUid`, `toUid`, `itemsFrom[]`, `itemsTo[]` (listing IDs), `cashAgorot`, `cashPayerId?`, `note?`, `status🔒`, `supersedesOfferId?`, `expiresAt🔒` (clients create via callable function only) |
| `ratings/{dealConversationId_raterId}` | `raterId`, `rateeId`, `stars`, `comment` |
| `reports/{id}` | `reporterId`, `targetType ('user'\|'listing'\|'message'\|'deal')`, `targetId`, `reason`, `details` |
| `config/{doc}` | admin-edited public settings (`config/app`: min app version, launch regions; `config/limits`: offer expiry, alert limits) |
| `system/*` 🔒 | provider tokens; denied to all clients |

Composite indexes live in `firestore.indexes.json`. Security rules are tested for every collection: **guests (unauthenticated) may read `games` and `active` listings** (W1, browsing); users read public profile fields of others and write only their own permitted fields; conversations, messages and offers are readable only by the two participants; blocked users can't open conversations with each other; all 🔒 fields and collections are client-write denied.

---

## 9. Screen Inventory

**A. Start & sign-in:** `Splash` (logo animation while auth state loads) → straight to the tabs. **Sign-in sheet** (modal, opened by protected actions, W1): `Phone` (+972, validation) → `Verify` (6-digit code, resend timer 30s) → `ProfileSetup` on first sign-in (username, city, language, TOS) → closes and continues the action.

**B. Tabs (custom hide-on-scroll bar):**
1. `Home`: Perfect Matches, Has games you want, New near you, Wanted near you, New for you (alerts).
2. `Search`: query + filters, list view, smart empty states (W4).
3. `Add` (center `+`, sign-in required; guests get the sign-in sheet): `Identify (Scan | Search)` → `Details` → `Photos (optional)` → success (share prompt).
4. `Inbox` (sign-in required; guests get the sign-in sheet): conversations grouped as Needs action (offers to answer, confirmations) / Active deals / Chats / Completed; unread badges.
5. `Profile`: My Listings, Want List, Alerts, ratings and trade count, Settings. Guests see a "Join WeLoot" card plus language, support and terms.

**C. Deal stack:** `GameDetail` (cover/photos, owner card with trust signals, Make an offer / Ask a question / Open chat, Share, Report), `OfferComposer` (with Quick Add modal), `Conversation` (chat + offer cards + deal header), `RateUser`, `Report`.

**D. Settings:** Account (username, phone (re-verify), delete account) · Preferences (language, city, search radius) · Notifications (offers, messages, alerts, deal reminders) · Safety (tips, blocked users) · Support (WhatsApp deep link `https://wa.me/<EXPO_PUBLIC_SUPPORT_WHATSAPP>?text=` prefilled with user ID; email fallback via `mailto:`) · Legal (TOS, Privacy: remote URLs, both languages) · App version.

---

## 10. Notifications (FCM)
Push + in-app badge for: new conversation (offer or question), new message (collapsed per conversation), counter-offer, offer accepted/declined/expired, deal confirmation requested, deal reminders, rating request, alert matches (rate-limited, W8). Text localized server-side using the recipient's `preferredLanguage`.

---

## 11. Analytics, Admin, Support
- **Analytics** (`@react-native-firebase/analytics`), events: `sign_in_prompted` (reason), `user_registered`, `game_listed`, `photo_added`, `wantlist_added`, `search_performed`, `search_no_results`, `alert_created`, `alert_notified`, `alert_opened`, `conversation_started`, `offer_sent`, `offer_countered`, `offer_accepted`, `deal_completed`, `deal_cancelled`, `deal_disputed`, `listing_shared`, `listing_closed`, `listing_closed_outside`, `deal_confirmed`, `report_submitted`. No PII in event params (IDs only).
- **Crash reporting:** Firebase Crashlytics.
- **Admin:** Firebase console / Rowy only. No admin screens. Ops tasks (review reports, resolve disputed deals, edit `config/*`, ban users) are done there.
- **Support:** WhatsApp/email deep link only.

---

## 12. Non-Functional Requirements
- **Performance:** cold start < 3s on a mid-range Android; search results < 300ms; feed images via `expo-image` with caching; lists virtualized.
- **Privacy (Israeli Privacy Protection Law incl. Amendment 13):** data minimization, city-level location only, EXIF stripped, privacy policy in Hebrew, account deletion. Users' phone numbers are never shown to other users; people may share contact details in chat themselves.
- **Accessibility:** labels on all touchables, dynamic type up to 1.3×, contrast AA, RTL screen reader order.
- **Security & abuse:** App Check (Play Integrity / App Attest) on Functions and Firestore; rate-limit callable functions (offers, conversations, barcode lookups, reports) per user; new accounts limited to N new conversations per day (config).
- **Platforms:** iOS 15+ and Android 8+ (verify against the chosen Expo SDK's minimums).

---

## 13. Environments & Configuration
- `.env.example` (app, public only): `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_ALGOLIA_APP_ID`, `EXPO_PUBLIC_ALGOLIA_SEARCH_KEY`, `EXPO_PUBLIC_SUPPORT_WHATSAPP`, `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_ENV`, `EXPO_PUBLIC_USE_EMULATORS` (dev only).
- Functions secrets (Secret Manager), MVP: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `ALGOLIA_ADMIN_KEY`, `UPC_LOOKUP_API_KEY`. Phase 2: Tranzila and DONE credentials (already declared in `functions/src/secrets.ts`, unbound).
- EAS Build profiles: `development`, `preview` (staging), `production`, one app ID and Firebase project each (README).

---

## 14. Open Questions (owner: product/business — the agent must not decide these)

| ID | Question | Default until answered |
|---|---|---|
| OPEN-4 | Is WhatsApp OTP a must-have for launch, or is SMS OK? | SMS via Firebase |
| OPEN-5 | IGDB commercial-use agreement signed? | Proceed in dev |
| OPEN-6 | Which UPC/EAN lookup provider (cost, Israeli barcode coverage)? | Interface + mock |
| OPEN-8 | Policy for fraud in in-person deals (fake/damaged games, no-shows, repeated cancellations): warnings, bans? | Manual review of reports; no automatic bans |
| OPEN-9 | Minimum age / ID requirements? | 16+ checkbox in TOS |
| OPEN-10 | Branding assets (logo, final colors, app icon, splash)? | Placeholder tokens §3.1 |
| OPEN-11 | Launch region(s) and consoles to focus on? Seeding plan (who lists first)? | Gush Dan; all five platforms supported, PS5 and Switch featured |
| OPEN-12 | Domain for shared links (`weloot.co.il`?) and store listing timing? | Firebase Hosting default domain of the prod project |

Phase 2 questions (payments, fees, invoicing, DONE details) are in Appendix A.

---

## Appendix A — Phase 2: in-app payments and smart lockers (deferred)

Kept so Phase 2 can start from the research already done. **Do not build in the MVP.** GitHub issues #28–#35 hold the work, in the "P2" milestones.

### A.1 Goals
Let users pay a cash top-up or buy a game inside the app with protection (funds held until the buyer has the game), and swap without meeting via DONE smart lockers. Revenue: a platform fee on in-app payments and a locker convenience fee.

### A.2 DONE Smart Lockers (Locker2Locker API)
Documented in `Done-l2l-API-24042024.docx`. Swagger: `https://l2l-api-test.cleanbox.co.il/swagger/index.html` (test). The Word doc is incomplete; read the Swagger first.
- **Auth:** `POST /api/Login` `{ userName, password }` → `{ token, result }`; JWT ≈ 24h, cache server-side.
- **Endpoints:** `GET /api/Station` (cache; show `isAlive && isAvailableToEveryOne && emptyLockers > 0`), `POST /api/Station/location?lat=&lng=` (nearest, `distance` unit unconfirmed), `POST /api/Order` (one leg: `externalOrderNumber`, `toStationNumber`, from/to names and 10-digit Israeli mobiles; HTTP 200 with `status:false` is a failure), `POST /api/Order/return/{externalOrderNumber}`.
- **Status codes:** 3 New (awaiting drop-off), 0 in source locker, 1 picked by driver, 4 in target locker, 5 collected by receiver, 6 cancelled (New orders auto-cancel after 7 days).
- **Unknowns:** webhook vs polling, drop-off/pick-up code delivery, sender station selection, `externalOrderNumber` limits, production pricing. Design: `DoneStatusSource` interface (webhook + poller) feeding one idempotent `applyLegStatus`.
- One order per direction: a trade has two legs, a sale one. Drop-off deadline 72h; inspection window 24h after collection; failure paths (no-show, one-sided drop-off, problem report) refund or return.

### A.3 Payments — Tranzila
- Tranzila is a card gateway; it doesn't hold funds or pay out to sellers. Holding buyers' money for sellers **may require a license** under Israeli payment-services regulation: legal review first.
- Hosted payment page in a WebView; card data never touches WeLoot. Only the server-to-server notify callback (verified, idempotent) marks a payment paid.
- `PaymentProvider` interface: `capture_then_payout` (capture at acceptance, hold in a ledger, manual/batch payouts, refunds via API) or `preauth` (J5; likely too short for locker round trips).
- Saved cards via Tranzila tokens only; seller bank details server-only.
- Data (Phase 2): `payments`, `payouts`, `payoutAccounts`, `lockerLegs`, `lockerStations`, `events`; deal gains `fulfillmentMethod: 'locker'` and an escrow status (`none | pending | held | released | refunded | disputed`).

### A.4 Phase 2 open questions
| ID | Question |
|---|---|
| OPEN-1 | Platform fee % (on in-app payments) and locker fee per leg (₪)? Who pays the locker fee? DONE's per-shipment cost? |
| OPEN-2 | Legal structure for holding buyer funds (license, a licensed payment facilitator/marketplace provider, or capture-and-manual-payout)? Tranzila terminal type, J5 availability, refund API access. |
| OPEN-3 | Who issues receipts/tax invoices for WeLoot fees (VAT 18%)? Invoicing provider? |
| OPEN-7 | DONE: webhook or status polling? Sender drop-off station selectable? How users get drop-off/pick-up codes? `externalOrderNumber` limits? Production credentials and pricing? |
