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
