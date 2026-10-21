# WeLoot MVP Backlog

Ordered list of issues, mirrored as GitHub Issues with the same numbers. Work top to bottom unless dependencies (`deps`) allow otherwise. Sizes: S (< ½ day), M (1–2 days), L (3+ days; split if possible; needs plan approval).

Milestones bump the app's minor version when complete (see `CLAUDE.md` §2). **v3 (issue #46): lean MVP.** Payments and lockers moved to Phase 2 (bottom of this file). Issue numbers are kept; new MVP issues were added as #47–#50, plus #57 (adaptive listing grid).

Status: ✅ merged · 🔄 in progress

---

## M0 — Foundation (`v0.1.0`)

**✅ #1 chore(repo): monorepo scaffold, tooling and CI** · M

**✅ #2 chore(functions): Firebase projects, emulators and secrets** · M · deps #1

**✅ #43 chore(functions): use me-west1 and map the real Firebase projects** · S · deps #2

**🔄 #3 chore(app): dev build with native Firebase** · M · deps #1
- `expo-dev-client`, `@react-native-firebase/app|auth|firestore|storage|functions|analytics|crashlytics|messaging` with config plugins; EAS profiles `development|preview|production`.
- App connects to emulators in dev.
- AC: development build runs on an Android phone; a test Firestore read works. (iOS deferred: needs a Mac / Apple developer account.)

**#4 feat(ui): design tokens, fonts and base components** · M · deps #1
- NativeWind setup, `src/theme` tokens (PRD §3.1), Rubik font, `Button`, `Text`, `Card`, `Chip` (platform colors), `Badge` ("Real photos"), `Input`, `Skeleton`, `ErrorState`, `EmptyState` (title, text, up to 2 actions), `Toast`, root error boundary.
- AC: a dev-only "kitchen sink" screen renders all components; no raw hex in components.

**#5 feat(i18n): i18next with RTL switching** · M · deps #4
- `en.json`/`he.json`, device-language default, `setLanguage()` that persists, calls `I18nManager.forceRTL` and reloads (`expo-updates`).
- `npm run i18n:check`: key parity + lint rule against JSX string literals; added to CI.
- Bidi helper for numbers/prices; `formatPrice(agorot, locale)`.
- AC: switching language mirrors the kitchen-sink screen after reload; the check fails on a missing key.

**#6 feat(ui): navigation shell with hide-on-scroll tab bar** · M · deps #4, #5
- Expo Router groups `(onboarding)`, `(tabs)`, `(deal)`; 5 placeholder tab screens; custom tab bar with elevated center `+`; `useHideOnScroll()` hook (PRD §3.4).
- AC: bar hides on scroll down past threshold, reappears on any scroll up, stays visible for short content; correct in RTL.

**#7 feat(shared): domain models, state machines and money utils** · M · deps #1
- zod schemas + TS types for all PRD §8 collections; enums; listing, offer and deal state machines (PRD §7) as pure `canTransition/transition` functions; `money` helpers (agorot); phone utils (E.164 ↔ local).
- AC: full unit-test coverage of transitions (valid + invalid).

## M1 — Auth & Profile (`v0.2.0`)

**#8 feat(auth): phone OTP sign-in** · M · deps #3, #6
- Guest-first (PRD W1): the app opens to the tabs for everyone. `Splash` while auth loads. A **sign-in sheet** (modal: phone with +972 prefill and validation, then the 6-digit code with auto-submit, resend timer and error mapping) opens from protected actions with a reason and **continues the action** after sign-in (`useRequireAuth`). The + and Inbox tabs use it for guests; Profile shows a "Join WeLoot" card to guests. EAS keystore SHA-1/SHA-256 registered with the Firebase Android app.
- AC: guests can browse; protected actions open the sheet and continue after sign-in; sign-in works with test phone numbers and the emulator; errors are localized; `sign_in_prompted` per open, `user_registered` once.

**#9 feat(profile): profile setup and username uniqueness** · M · deps #8, #7
- `ProfileSetup` as the last step of the sign-in sheet on a first sign-in: English username (atomic `usernames` guard), full name and email (private), city picker (every CBS locality from data.gov.il with coordinates/geohash), unticked promotions opt-in, 16+ and TOS/Privacy acceptance (current language saved). The pending action continues only after the profile is complete.
- Rules for `users` and `usernames` + tests.
- AC: protected actions don't continue until the profile is complete; duplicate usernames rejected; guests unaffected.

**#10 feat(profile): profile tab and settings menu** · M · deps #9
- Profile tab (My Listings, Want List, Alerts placeholders; rating and trade count; guests: "Join WeLoot" card + language, support, legal), Settings sections (PRD §9-D) with language/city/radius editing, Support deep links, Legal links, version.
- AC: support WhatsApp opens with user ID prefilled; language change reloads into the right direction.

**#11 feat(profile): delete account** · S · deps #10
- Callable function: anonymize/delete user data, revoke auth, cancel open offers and deals.
- AC: function and rules tests; user is signed out afterwards.

## M2 — Catalog & Listing (`v0.3.0`)

**#12 feat(catalog): IGDB token and catalog sync** · L · deps #2, #7
- Twitch token cache, rate-limited IGDB client, scheduled + manual sync into `games` for target platforms (PRD §5.1), including similar games.
- AC: sync of the dev project populates games; re-runs are idempotent; tests with mocked IGDB.

**#13 feat(search): Algolia games index** · M · deps #12
- Function that pushes `games` changes to Algolia; client search hook with search-only key; platform filter.
- AC: typo-tolerant search returns expected games in < 300ms on dev.

**#14 feat(listings): barcode scan and game search** · L · deps #13
- `Identify` screen: `expo-camera` EAN-13/UPC-A scanning, `barcodes` lookup, UPC-provider fallback behind an interface (mock in dev, TODO(OPEN-6)), confirm-match UI, mapping write-back; search fallback; platform selection.
- AC: known barcode → instant match; unknown → suggestions → confirm → mapping saved; camera permission denial handled.

**#16 feat(listings): details, publish and Quick-Add-ready flow** · M · deps #14
- Details form (condition, case, notes, trade/sale, asking price) with zod; publish via callable function (server sets `status`, `geo`, denormalized fields); the whole Add flow is reusable as a modal returning the new listing ID (for Quick Add).
- `listings` rules + tests; `game_listed` event.
- AC: invalid combinations rejected client- and server-side; publishing with barcode and no photos takes under ~15 seconds.

**#15 feat(listings): optional photos with upload** · M · deps #16
- Up to 6 photos, camera/gallery, compression, EXIF strip, upload with progress/retry; storage rules + tests; `hasPhotos` set by a function; "Real photos" badge; post-publish nudge when no photos.
- AC: a listing can be published without photos; uploaded images have no GPS metadata.

**#17 feat(listings): my listings management** · S · deps #16
- Profile → My Listings: pause/resume/remove; **"Swapped" / "Sold"** with the "Who with?" picker (accepted-deal counterpart first, recent chats on that listing, "Someone outside WeLoot"), which closes the listing immediately (PRD W6). Closed listings are final; listing again creates a new listing.

## M3 — Discovery & engagement (`v0.4.0`)

**#57 feat(ui): adaptive listing grid with pinch and a layout toggle (1–3 per row)** · M · deps #4, #6, #16
- Shared `ListingGrid` (virtualized) for Search results and Home feeds; density 1, 2 or 3 per row, **default 2**; pinch to change (one step per gesture, animated, keeps scroll position) plus a visible 1/2/3 layout toggle; choice remembered per user; tile content adapts by density (PRD §3.3).
- AC: pinch and toggle both switch densities smoothly; density persists across restarts; every density is screen-reader accessible; smooth at 3 columns with 100+ items on a mid-range Android; correct in RTL.

**#18 feat(search): listings index and search tab** · L · deps #16, #57
- Algolia `listings` index (only `active`, `hasPhotos` boost), filters (platform, trade/sale, condition, price, distance), results in the adaptive grid (#57); recent searches and popular games on an empty query; excludes own and blocked users.

**#19 feat(listings): game detail screen** · M · deps #18
- Cover/photo gallery, owner card with trust signals (rating, trade count, account age), report listing. Offer/question buttons arrive with #24.

**#20 feat(matching): want list** · M · deps #13
- Add/remove from search results and game detail; Profile → Want List; rules + tests; `wantlist_added`.

**#21 feat(matching): match computation** · L · deps #16, #20
- Functions on listing/wantlist writes maintain `matches` (perfect + one-way, score, distance) per PRD W3.
- AC: tests for add/remove/pause/reserve cases; recomputation is incremental, not full-scan.

**#22 feat(home): home feed carousels** · M · deps #21, #18, #57
- Perfect Matches, Has games you want, New near you, Wanted near you (real counts); "See all" opens the full list in the adaptive grid (#57); skeletons; empty states with CTAs to list games or build the want list.

**#48 feat(search): smart empty states and suggestions** · M · deps #18, #20
- Zero-result flow (PRD W4): notify me, add to want list, other platforms, similar listed games, relaxed-filter counts. `search_no_results` event.
- AC: every empty search shows at least one action; suggestions use real listings only.

**#49 feat(alerts): saved searches and "notify me" alerts** · M · deps #48, #21
- `alerts` collection + rules; function on new/reactivated listings → matching alerts → rate-limited push (PRD W8); want-list items act as alerts; Profile → Alerts; "New for you" on Home.
- AC: rate limits enforced (tests); `alert_created`, `alert_notified`, `alert_opened`.

## M4 — Conversations, offers & deals (`v0.5.0`)

**#23 feat(offers): conversations, offers and deal model with rules and functions** · L · deps #7, #16
- `conversations`, `messages`, `offers` per PRD §8; callable functions: start conversation (offer or question), send/counter/withdraw/accept/decline offer; expiry scheduler (72h); listing reservation and auto-decline of conflicting offers; deal creation on accept.
- AC: rules deny all client writes to status fields; only participants can read; state-machine tests for every path.

**#24 feat(offers): offer composer and game-page openers** · L · deps #23, #19
- Game page: "Make an offer" (primary) + "Ask a question" while no conversation exists, then "Open chat". Offer composer: both sides' games, Quick Add (#16), optional cash top-up either way, note; counter prefilled.
- AC: `conversation_started` (opener), `offer_sent`, `offer_countered` events; composer works in RTL.

**#25 feat(chat): conversation screen** · M · deps #23
- Realtime messages, offer cards with Accept/Counter/Decline/Withdraw, system messages, deal header, report message, block user.

**#47 feat(deals): swap confirmation, cancel and safety tips** · M · deps #25, #17
- An owner's "Swapped" (from #17 or the deal header) records their confirmation, creating the deal if there was no accepted offer. The counterpart gets a one-tap "Did you swap X with Y?" (Yes / No) as a push and chat banner.
- Yes → `completed` (trade counts +1, rating prompt); 7 days without an answer → `unconfirmed` (reminders on day 1 and 3); No → `disputed` + report.
- Deal header: Swapped / Cancel deal (reason). A 2-day "Did the swap happen?" reminder after acceptance. Safety tips card on agreement.
- AC: listings close on the owner's action alone; trade counts and ratings only for `completed` (function + rules tests); `listing_closed`, `listing_closed_outside`, `deal_confirmed`, `deal_completed`, `deal_cancelled`, `deal_disputed`.

**#26 feat(inbox): inbox tab** · M · deps #25
- Grouped conversations (Needs action / Active deals / Chats / Completed), unread badges.

**#27 feat(notifications): push notifications** · M · deps #23
- FCM token registration, server-side localized notifications for PRD §10 events, deep links into the right screen, notification preferences.

## M5 — Trust, sharing & launch (`v0.6.0`)

**#36 feat(profile): ratings** · S · deps #47
- Rating prompt after a completed deal; aggregates by function; shown on profiles and owner cards.

**#37 feat(safety): report and block** · M · deps #25
- Report user/listing/message/deal; block user (hidden listings, no conversations); Settings → Blocked users.

**#50 feat(listings): share listings and want list to WhatsApp/Facebook** · M · deps #19
- Native share sheet with localized text and `https://<domain>/l/{id}` links; Firebase Hosting landing page (no personal data); App Links / Universal Links to the game page (PRD W7). TODO(OPEN-12) for the domain.
- AC: `listing_shared`; a shared link opens the right game page in the app.

**#38 chore(security): App Check and function rate limits** · M

**#39 chore(analytics): event audit and Crashlytics** · S
- Verify every PRD §11 event fires once with no PII.

**#40 chore(release): store listings, privacy labels, legal pages, production config** · M — blocked on OPEN-5/9/10/11/12
- Register staging and prod Android apps + EAS file variables; production Firestore in `me-west1`; store listings in Hebrew and English.

---

## Phase 2 — Payments & lockers (post-MVP; PRD Appendix A)

Not scheduled. Revisit once the MVP shows real usage.

**P2 — Payments:** #28 Tranzila provider and checkout · #29 saved cards and payout account · #30 release, refund and payout records
**P2 — Lockers:** #31 DONE client and station cache · #32 locker picker · #33 leg creation and status tracking · #34 locker tracker screen · #35 inspection window and problem reports

Numbers #44, #45, #46 and #51+ are pull requests or this docs change, not backlog items.
