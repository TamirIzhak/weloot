# WeLoot MVP Backlog

Ordered list of issues. Create each as a GitHub Issue with the same number, title, labels and acceptance criteria (AC). Work top to bottom unless dependencies (`deps`) allow parallel work. Sizes: S (< ½ day), M (1–2 days), L (3+ days — split if possible; needs plan approval).

Milestones bump the app's minor version when complete (see `CLAUDE.md` §2).

---

## M0 — Foundation (`v0.1.0`)

**#01 chore(repo): monorepo scaffold, tooling and CI** · M
- npm workspaces: `app` (Expo, TypeScript strict, Expo Router), `functions` (Firebase Functions TS), `packages/shared`.
- ESLint + Prettier, `npm run typecheck|lint|test` at root; GitHub Actions running them on PRs.
- `.github/pull_request_template.md` (from `CLAUDE.md` §3), issue templates, `.gitignore`, `.env.example`, README with setup.
- AC: fresh clone → `npm install && npm run typecheck && npm test` passes; CI green on the PR.

**#02 chore(functions): Firebase projects, emulators and secrets** · M · deps #01
- `firebase.json`, `.firebaserc` with `dev`/`staging`/`prod` aliases; emulator config (auth, firestore, functions, storage).
- Default-deny `firestore.rules` and `storage.rules` + rules test harness.
- Secret handling via `defineSecret`; README section listing every secret.
- AC: `firebase emulators:start` works; a sample rules test runs in CI.

**#03 chore(app): dev build with native Firebase** · M · deps #01
- `expo-dev-client`, `@react-native-firebase/app|auth|firestore|storage|functions|analytics|crashlytics|messaging` with config plugins; EAS profiles `development|preview|production`.
- App connects to emulators in dev.
- AC: development build runs on Android emulator and iOS simulator; a test Firestore read works.

**#04 feat(ui): design tokens, fonts and base components** · M · deps #01
- NativeWind setup, `src/theme` tokens (PRD §3.1), Rubik font, `Button`, `Text`, `Card`, `Chip` (platform colors), `Input`, `Skeleton`, `ErrorState`, `EmptyState`, `Toast`, root error boundary.
- AC: a dev-only "kitchen sink" screen renders all components; no raw hex in components.

**#05 feat(i18n): i18next with RTL switching** · M · deps #04
- `en.json`/`he.json`, device-language default, `setLanguage()` that persists, calls `I18nManager.forceRTL` and reloads.
- `npm run i18n:check`: key parity + lint rule against JSX string literals; added to CI.
- Bidi helper for numbers/prices; `formatPrice(agorot, locale)`.
- AC: switching language mirrors the kitchen-sink screen after reload; check fails on a missing key.

**#06 feat(ui): navigation shell with hide-on-scroll tab bar** · M · deps #04, #05
- Expo Router groups `(onboarding)`, `(tabs)`, `(tx)`; 5 placeholder tab screens; custom tab bar with elevated center `+`; `useHideOnScroll()` hook (PRD §3.4).
- AC: bar hides on scroll down past threshold, reappears on any scroll up, stays visible for short content; correct in RTL.

**#07 feat(shared): domain models, state machines and money utils** · M · deps #01
- zod schemas + TS types for all PRD §8 collections; enums; transaction, listing and locker-leg state machines (PRD §7) as pure `canTransition/transition` functions; `money` helpers (agorot); `toIsraeliLocalPhone(e164)`.
- AC: full unit-test coverage of transitions (valid + invalid) and phone conversion.

## M1 — Auth & Profile (`v0.2.0`)

**#08 feat(auth): phone OTP sign-in** · M · deps #03, #06
- `Splash` (auth check, logo animation), `PhoneAuth` (+972 prefill, validation, resend timer, error mapping).
- AC: sign-in works with Firebase test phone numbers; errors are localized; `user_registered` fires once.

**#09 feat(profile): profile setup and username uniqueness** · M · deps #08, #07
- `ProfileSetup`: username (transactional `usernames` guard), city picker (static Israeli city list with coordinates/geohash), language, TOS/Privacy acceptance.
- Rules for `users` and `usernames` + tests.
- AC: can't reach tabs without completed profile; duplicate usernames rejected.

**#10 feat(profile): profile tab and settings menu** · M · deps #09
- Profile tab skeleton (My Listings, Want List placeholders, rating), Settings sections (PRD §9-D) with language/city/radius editing, Support deep links, Legal links, version.
- AC: support WhatsApp opens with user ID prefilled; language change reloads into the right direction.

**#11 feat(profile): delete account** · S · deps #10
- Callable function: anonymize/delete user data, revoke auth; blocked while a transaction is in fulfillment.
- AC: function and rules tests; user is signed out afterwards.

## M2 — Catalog & Listing (`v0.3.0`)

**#12 feat(catalog): IGDB token and catalog sync** · L · deps #02, #07
- Twitch token cache, rate-limited IGDB client, scheduled + manual sync into `games` for target platforms (PRD §5.1).
- AC: sync of the dev project populates games; re-runs are idempotent; tests with mocked IGDB.

**#13 feat(search): Algolia games index** · M · deps #12
- Function that pushes `games` changes to Algolia; client search hook with search-only key; platform filter.
- AC: typo-tolerant search returns expected games in < 300ms on dev.

**#14 feat(listings): barcode scan and assisted search** · L · deps #13
- `Identify` screen: `expo-camera` EAN-13/UPC-A scanning, `barcodes` lookup, UPC-provider fallback behind an interface (mock in dev, TODO(OPEN-6)), confirm-match UI, mapping write-back; assisted search fallback; platform selection.
- AC: known barcode → instant match; unknown → suggestions → confirm → mapping saved; camera permission denial handled.

**#15 feat(listings): photo proof capture and upload** · M · deps #14
- 2–6 photos, camera/gallery, compression, EXIF strip, upload with progress/retry; storage rules + tests.
- AC: can't continue with < 2 photos; uploaded images have no GPS metadata.

**#16 feat(listings): details, publish and Quick-Add-ready flow** · M · deps #15
- Details form (condition, case, notes, trade/sale, price) with zod; publish via callable function (server sets `status`, `geo`, denormalized fields); the whole Add flow is reusable as a modal returning the new listing ID (for Quick Add).
- `listings` rules + tests; `game_listed` event.
- AC: invalid combinations rejected client- and server-side.

**#17 feat(listings): my listings management** · S · deps #16
- Profile → My Listings: pause/resume/remove; reserved listings locked.

## M3 — Discovery (`v0.4.0`)

**#18 feat(search): listings index and search tab** · L · deps #16
- Algolia `listings` index (only `active`), filters (platform, trade/sale, condition, price, distance), list view, map view with city-level pins; excludes own and blocked users.

**#19 feat(listings): game detail screen** · M · deps #18
- Cover art, photo gallery, owner card with trust signals, Make Offer / Buy CTAs, report listing.

**#20 feat(matching): want list** · M · deps #13
- Add/remove from search results and game detail; Profile → Want List; rules + tests; `wantlist_added`.

**#21 feat(matching): match computation** · L · deps #16, #20
- Functions on listing/wantlist writes maintain `matches` (perfect + one-way, score, distance) per PRD W3.
- AC: tests for add/remove/pause/reserve cases; recomputation is incremental, not full-scan.

**#22 feat(home): home feed carousels** · M · deps #21, #18
- Perfect Matches, Has-what-you-want, New near you; skeletons, empty states with CTA to add listings / want list.

## M4 — Offers & Chat (`v0.5.0`)

**#23 feat(offers): transaction model, rules and offer functions** · L · deps #07, #16
- Callable functions: create offer, counter, accept, decline, cancel; expiry scheduler (48h); listing reservation and auto-cancel of conflicting offers; fee calculation from `config/fees` (TODO(OPEN-1)).
- AC: rules deny all client writes to status fields; state-machine tests for every path.

**#24 feat(offers): offer creation screen with Quick Add** · L · deps #23, #16
- Inventory selector, Quick Add modal (reuses #16 flow), cash delta (who pays), fee summary; `offer_sent`.

**#25 feat(chat): transaction chat** · M · deps #23
- Realtime messages, sticky status header with actions, system messages, phone/link warning, report message, block user.

**#26 feat(inbox): inbox tab** · M · deps #25
- Grouped transactions, unread badges, locker status chips.

**#27 feat(notifications): push notifications** · M · deps #23
- FCM token registration, server-side localized notifications for PRD §10 events, deep links into the right screen, notification preferences.

## M5 — Payments (`v0.6.0`) — blocked on OPEN-2 for production

**#28 feat(payments): Tranzila provider and checkout** · L · deps #23
- `PaymentProvider` interface; Tranzila `capture_then_payout` implementation (test terminal); function generating the hosted-page URL; `TranzilaCheckoutModal` WebView; notify-callback function (verified, idempotent); `awaiting_payment` timeout.
- AC: payment success/failure/duplicate-callback tests; the WebView redirect alone never marks paid.

**#29 feat(payments): saved cards and payout account** · M · deps #28
- Tokenized cards in Settings; payout bank account via callable function into server-only `payoutAccounts`.

**#30 feat(payments): release, refund and payout records** · M · deps #28, #33
- Release on `completed`, refund on `failed`/`refunded`, `payouts` records for manual payment; ops-console flow documented in README.

## M6 — Lockers (`v0.7.0`)

**#31 feat(lockers): DONE client and station cache** · M · deps #02, #07
- Token cache, typed client with zod-parsed responses, station sync every 6h, nearest-stations callable.
- AC: works against the DONE test env; `status:false` responses mapped to typed errors.

**#32 feat(lockers): locker picker** · M · deps #31, #23
- Map + list of nearby available stations; selection stored on the transaction.

**#33 feat(lockers): leg creation and status tracking** · L · deps #31, #32, #28
- Create legs on `awaiting_dropoff`; `DoneStatusSource` (webhook + poller, TODO(OPEN-7)); `applyLegStatus` mapping codes 3/0/1/4/5/6; deadlines and reminders; transaction transitions; failure handling (PRD W5).
- AC: tests for every code, duplicates, out-of-order events, deadline expiry, one-sided failure.

**#34 feat(lockers): locker tracker screen** · M · deps #33
- Station map + navigation link, code/QR or "check SMS" fallback, realtime progress bar (RTL-aware).

**#35 feat(lockers): inspection window and problem reports** · M · deps #33
- Confirm received / Report a problem; auto-confirm after window; `disputed` path; support link with transaction ID.

## M7 — Trust & Launch Readiness (`v0.8.0`)

**#36 feat(profile): ratings** · S · deps #35
**#37 feat(safety): report and block** · M · deps #25 (if not fully covered in #19/#25)
**#38 chore(security): App Check and function rate limits** · M
**#39 chore(analytics): event audit and Crashlytics** · S
**#40 chore(release): store listings, privacy labels, legal pages, production config** · M — blocked on OPEN-1/2/3/5/7/10
