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
