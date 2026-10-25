# QA script

Manual checks for the end-of-MVP QA round. Each merged issue adds its steps here. Run every flow in **Hebrew (RTL)** and **English (LTR)**, on the Android dev build against the emulators (README "Running the app on your phone") unless a step says otherwise.

Get sign-in codes from the Auth emulator: `curl http://127.0.0.1:9099/emulator/v1/projects/demo-weloot/verificationCodes`

## Foundation (#4–#7)
- [ ] The app opens to Home without asking to sign in.
- [ ] Profile → language switch: the app restarts and the whole layout mirrors (tab bar, text, icons); switching back works.
- [ ] Tab bar hides when scrolling down a long list and comes back on any scroll up; it stays visible on short screens.

## Sign-in and profile setup (#8, #9)
- [ ] As a guest, tap **+**: the sign-in sheet opens with "Sign in to list your game". Closing it returns to where you were.
- [ ] Phone sign-in: invalid numbers are explained; a valid code signs in; a wrong code is explained and cleared; "Resend" unlocks after 30 s.
- [ ] First sign-in shows profile setup:
  - [ ] Username: "✓ Available" for a free name, "taken" for a used one, an explanation for Hebrew letters, spaces or symbols.
  - [ ] First and last name: letters in any language; digits are explained after leaving the field.
  - [ ] Email: an invalid address is explained after leaving the field.
  - [ ] The promotions box starts unticked; "Continue" stays disabled until the terms box is ticked.
  - [ ] No yellow autofill highlight on Android (needs the build from 2026-10-24 or later).
- [ ] After Continue, the sheet closes and the original action continues.
- [ ] Close the sheet during profile setup: Profile shows "Finish setting up"; its button reopens setup.
- [ ] Profile shows the username; Sign out returns to guest mode.

## Social sign-in (#64)
Needs `docs/OWNER-TODO.md` items 1–3 and a dev build made after them. Until then, development builds show each unset method as "not set up yet".
- [ ] The sign-in sheet opens on the methods: Google, Facebook, Discord, phone. "Continue with phone" leads to the number; "Other ways to sign in" goes back.
- [ ] **Google:** pick an account → a first sign-in shows profile setup with name and email filled in; the original action continues afterwards.
- [ ] **Facebook:** the browser opens, approve → back in the app (no "Unmatched route" screen) → profile setup prefilled.
- [ ] **Discord:** the browser opens Discord, approve → back in the app → profile setup prefilled with the Discord name (and email when it's verified on Discord).
- [ ] Backing out of any provider screen leaves the sheet as it was, with no error.
- [ ] The same email already used with another method shows "This email already has an account with another sign-in method".
- [ ] Sign out, then sign in again with the same method: no profile setup the second time.

## One-time phone verification (#65)
- [ ] Sign in with Google (or Facebook/Discord) and finish profile setup. Adding to the want list or an alert works without any phone step.
- [ ] Tap **+** (or Make an offer / Ask a question once they exist): the sheet asks "Verify your phone"; after the SMS code the original action continues.
- [ ] Do another trading action: no phone step again (also after closing and reopening the app).
- [ ] Verify with a number that already belongs to another account (e.g. a phone-only account): "This number already belongs to another WeLoot account…".
- [ ] Sign in with phone only: trading actions never ask for the phone again.

## Browsing location and saved addresses (#66)
Needs the dev build with the native modules (#63) for location.
- [ ] Profile setup no longer asks for a city.
- [ ] Home and Search show "Choose your area". Tap it → "Use my current location" → allow → the chip shows "Near: <your city>".
- [ ] Deny location permission → a message suggests choosing a city; searching "חיפה" or "haifa" and tapping it sets "Near: Haifa".
- [ ] Close and reopen the app: the chip keeps the place (also as a guest).
- [ ] Signed in: in the location picker, saved addresses appear under "Your addresses"; picking one shows its name on the chip.
- [ ] Add an address (from the picker or later from the Add flow): "Use my current location" fills the street; "Others will see: <area>" appears; the first address is named Home by default.
- [ ] Type an address with its city → "Find this address" → the area preview appears. A made-up address shows "We couldn't find that address".
- [ ] Edit an address (pencil): change its name, save; delete it.
- [ ] Hebrew and English: all texts translated; the chip and lists mirror in RTL.

## Profile tab and Settings (#10)
- [ ] Guest: Profile shows "Join WeLoot" and a Settings button; Settings has language, browsing location, support, legal and version, but no account section.
- [ ] Signed in: Profile shows the username, "Member since <month year>", "No ratings yet" and 0 completed swaps; My listings, Want list and Alerts open placeholder pages.
- [ ] Settings → Language: tap the other language → the app restarts mirrored (RTL ↔ LTR) and stays that way after reopening.
- [ ] Settings → Account shows the sign-in method (Google/Facebook/Discord/phone). A social account shows Phone "Verify" → the verify sheet → afterwards "Verified ✓".
- [ ] Settings → Saved addresses: lists addresses; tap one to edit; "Add an address" works.
- [ ] Search radius chips change the selection and stay after reopening Settings.
- [ ] News and offers switch: on/off sticks after reopening.
- [ ] Support → WhatsApp opens a chat with support with "My user ID: …" filled in (needs `EXPO_PUBLIC_SUPPORT_WHATSAPP`).
- [ ] Terms and Privacy show "Coming soon" until their URLs are set.
- [ ] Sign out returns to the Profile tab as a guest.

## Delete account (#11)
Needs the functions running (emulators) or deployed (OWNER-TODO 6).
- [ ] Settings → Account → Delete account: the screen lists what's deleted; the button stays disabled until the box is ticked.
- [ ] Delete → back on Home as a guest with "Your account was deleted".
- [ ] Sign in again with the same method → a brand-new account (profile setup again); the old username can be taken.
- [ ] In the Emulator UI (Firestore): `users/<old uid>` shows `deleted_user` with `deletedAt`; its `private/settings` and `locations` are gone.
- [ ] With no connection, Delete shows "Couldn't delete your account…" and nothing changes.

## Game catalog sync (#12)
Needs the Twitch credentials (OWNER-TODO 4).
- [ ] Emulator: trigger `catalogSyncNow?mode=full` (README "Game catalog"); it answers with counts (thousands of games) within a few minutes.
- [ ] Emulator UI → Firestore → `games`: e.g. Elden Ring has title, cover image id, platforms (only PS4/PS5/Xbox), genres and similar game ids; no DLC or bundles appear.
- [ ] Run it again without `mode=full`: it finishes fast with few or no writes.
- [ ] Without the credentials, the trigger answers `notConfigured` (503).

## Game search (#13)
Needs Algolia (OWNER-TODO 5) and a catalog sync (#12).
- [ ] Search tab: typing "zelda" shows Zelda games with covers, years and platform chips within about a second.
- [ ] Typos work: "eldn ring" still finds Elden Ring; Hebrew or Japanese alternative names find the game when IGDB has them.
- [ ] Platform chips filter the results (tap again to clear); "Switch" only shows Switch games.
- [ ] A nonsense query shows "No games found".
- [ ] Without the Algolia keys, the tab says game search isn't set up yet.

## Identify a game: barcode and search (#14)
Needs the dev build with the camera (#63), the functions running, a catalog (#12) and Algolia (#13).
- [ ] Tap **+** (signed in, phone verified): "Which game?" with Scan barcode / Search.
- [ ] First time: the camera permission prompt; deny → "Allow camera" and "Search instead"; deny permanently → "Open settings".
- [ ] Scan a game case: "Looking up the barcode…". An unknown barcode → "We don't know this barcode yet" → Search → pick the game → pick the console → Continue.
- [ ] Scan the same barcode again (any account): "Is this your game?" with that game; "Yes" preselects the console.
- [ ] A game on several consoles needs a console choice before Continue; a single-console game is chosen automatically.
- [ ] Search mode alone works without scanning.
- [ ] Leaving the + tab turns the camera off (no camera indicator).

## Location, details and publish (#16)
Needs the functions running and at least one game in the catalog.
- [ ] After choosing the game and console: "Your listing" shows the game, then "Where you swap from" with the first saved address pre-selected (or "Add an address" if none).
- [ ] Publish stays disabled until a condition is chosen and Trade and/or Sale is on.
- [ ] Sale: a price under ₪10 or over ₪1,000 is explained; letters can't be typed.
- [ ] Publish → "Your game is listed!" with the photo nudge; "List another game" returns to a fresh Identify step.
- [ ] Emulator UI → `listings/<id>`: status `active`, game title, cover, condition, the area (rounded lat/lng, area name) and **no** address text or exact coordinates.
- [ ] Double-tapping Publish creates one listing.
- [ ] Delete account (#11) afterwards: the listing's status becomes `removed`.

## Listing photos (#15)
Needs the new dev build (camera, image picker) and the Storage emulator/bucket.
- [ ] After publishing, "Add photos" opens Photos. A listing can stay without photos ("Done").
- [ ] Take a photo and choose several from the gallery: each shows a progress bar, then the photo; at most 6 (buttons disable at 6).
- [ ] "Real photos" badge appears once a photo is stored; removing all photos removes it (Emulator UI: `hasPhotos`, `photoPaths`).
- [ ] Airplane mode during an upload → the tile shows a retry icon; retry after reconnecting works.
- [ ] Download a stored photo from the Storage emulator and check its metadata: no GPS/EXIF, long edge ≤ 1600 px.
- [ ] Refuse gallery permission → a message explains it.

## My listings (#17)
- [ ] Profile → My listings: every listing with its status badge (Active, Paused, Swapped, Sold, Removed), price/trade and "Real photos" when it has photos. No listings → "List a game".
- [ ] Tap a listing: Photos, Pause, Swapped (trade listings), Sold (sale listings), Remove.
- [ ] Pause → badge Paused and the listing is hidden from others (Emulator UI status); Resume brings it back.
- [ ] Swapped → "Who with?" → "Someone outside WeLoot" → badge Swapped; no actions left on it.
- [ ] Remove asks first, then shows Removed.

## Adaptive listing grid (#57)
Dev build: Home → "Listing grid preview (dev)" (150 sample tiles; development only). Real feeds use it from #18/#22.
- [ ] Starts at 2 per row. The toggle (list / grid / apps icons) switches 1 ↔ 2 ↔ 3.
- [ ] Pinch out → bigger tiles (fewer per row); pinch in → more per row; one step per pinch.
- [ ] After switching, the list stays near the same games (doesn't jump to the top).
- [ ] 1 per row: full card with condition, area and distance; 2: cover, title, platform, price/Trade, "Real photos"; 3: cover with a color strip and price/Trade.
- [ ] Scrolling at 3 per row stays smooth to the end.
- [ ] Close and reopen the app: the chosen density is kept.
- [ ] Hebrew: columns start from the right; TalkBack reads title, console, condition, price/trade and distance on every density.

## Search tab (#18)
Needs Algolia set up (docs/OWNER-TODO.md 5) and a few published listings (ideally from a second account).
- [ ] With nothing typed: recent searches (tap one to search again, × removes it, Clear empties the list), "Popular near you" games with real counts, and "See all listings near you".
- [ ] Typing shows skeleton tiles, then results in the grid (1/2/3 toggle and pinch work); "Results: N" matches.
- [ ] Your own listings never show; neither do listings of a user you blocked (once blocking exists, #38).
- [ ] Filters: console, trade/sale, condition (several), price from/to (only listings for sale), distance (5–100 km or anywhere). The Filters button shows how many are set; Clear filters resets them.
- [ ] Without a browsing location the distance filter asks you to choose one, and tiles show no distance.
- [ ] Distances on tiles look right from the browsing location; nearer listings come first, with real-photo ones first among similar distances.
- [ ] Pause a listing in My listings → it disappears from search within ~10 s; resume → it comes back. Closing (Swapped/Sold) or removing does the same.
- [ ] A new listing shows up in search within ~10 s of publishing; adding photos moves it up.
- [ ] Nothing matches → "No listings match" with Search all of Israel / Clear filters / Choose your location.
- [ ] Scroll a long result list: more results load at the end, with no duplicates.
- [ ] Hebrew: filters, chips and results read right to left; area names show in Hebrew.

## Game page and reporting (#19)
- [ ] Search → tap a result: the game page opens with photos (swipe; "2/3" counter) or the cover, title, console, Real photos badge, Trade/price, condition, case, area with distance, listed date and the owner's notes.
- [ ] Signed out, the page shows everything (nothing hidden for guests).
- [ ] Owner card: username, ★ rating (or "No ratings yet"), completed trades, member since (month and year).
- [ ] Your own listing: "This is your listing" with Manage my listings, and no Report button. Paused listings still open for you, with a Paused badge.
- [ ] Another user pauses or closes a listing while you have it open → "This listing isn't available anymore" → Search for other copies.
- [ ] Report listing as a guest → sign-in sheet ("Sign in to report it"), then the report screen. No phone verification is asked.
- [ ] Report: Send stays disabled until a reason is picked; sending shows "Thanks. We'll look into it." and closes. The report appears in Firestore `reports` (console). Reporting the same listing again updates that report.
- [ ] Hebrew: the page and the report screen read right to left; the username and numbers stay readable.

## Want list (#20)
- [ ] Search results: ♡ on each tile; tap → "Elden Ring is on your want list" and the heart fills; tap again → removed.
- [ ] As a guest, ♡ opens the sign-in sheet ("Sign in to save your want list", no phone step); after signing in the game is added.
- [ ] Game page: "Add to my want list" → "On my want list ✓" (tap again removes). Not shown on your own listing.
- [ ] Profile → Want list: games newest first with their console (or "Any console"), "N of 100 games", ♥ removes one; empty list → Find games.
- [ ] The same game on another console is a separate item; adding the same one twice keeps one.
- [ ] Delete account → the want list is gone too (Firestore console: `wantlist/{uid}`).
- [ ] Hebrew: labels and hearts sit correctly in RTL.

## Matching (#21)
Background only (Home shows matches with #22). Check in the Firestore console (`matches/{uid}/items/{otherUid}`), with two accounts A and B.
- [ ] A wants Elden Ring (PS5); B lists Elden Ring PS5 → within seconds A has a match doc about B (`perfect: false`); B has none.
- [ ] B also wants a game A lists (same console) → both docs say `perfect: true` with both listing IDs.
- [ ] B pauses or closes the listing → A's doc goes (and B's turns one-way or goes).
- [ ] A removes the game from the want list → the docs go.
- [ ] A want list item for "any console" matches a listing on any console; a PS4 want doesn't match a PS5 listing.

## Home feed (#22)
Needs Algolia, and two accounts with listings and want lists for the match carousels.
- [ ] Guest: "New on WeLoot" (or "New near you" with a location) with cards from the last two weeks, plus a "Find your matches / Join WeLoot" card. No match carousels.
- [ ] Signed in with no want list: "Has games you want" invites to "Find games to want" (opens Search). Perfect matches is hidden while there are none.
- [ ] With matches: "Perfect matches" shows mutual ones; "Has games you want" shows the rest. Cards open the game page; ♡ works.
- [ ] Your own listings never appear in New near you.
- [ ] "See all" on each carousel opens the full list in the grid (1/2/3 toggle, pinch); New near you loads more at the end.
- [ ] "Wanted near you": without a location it asks for one; with one, it shows "N near you want <game> (<console>)" for your listed games (count real wanters with an address or listing within your radius, at least 5 km), or a nudge to list games.
- [ ] Pause a listing that's in someone's match → it disappears from their carousels after a refresh.
- [ ] Loading shows card-sized skeletons; Hebrew: carousels scroll from the right; titles and "See all" sit correctly.
