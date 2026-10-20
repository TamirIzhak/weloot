# ADR 0002 — Derive the app language from the persisted layout direction

- **Status:** Accepted (2026-10-20)
- **Issue:** #5

## Context

WeLoot supports English (LTR) and Hebrew (RTL). React Native applies layout direction only at app startup, so switching language means: set the direction, then restart the JS app (PRD §3.5). We need the chosen language to survive restarts, and to default sensibly before the user has a profile.

Options for remembering the choice:

1. A storage library (AsyncStorage / MMKV): another native module and a second source of truth that can disagree with the actual layout direction.
2. The user's Firestore profile (`users.preferredLanguage`): doesn't exist before sign-in, and needs the network at startup.
3. **React Native's own persisted direction.** `I18nManager.allowRTL`/`forceRTL` are stored natively (SharedPreferences / NSUserDefaults) and survive restarts. `I18nManager.isRTL` is then the truth on every launch.

## Decision

Use option 3: `currentLanguage()` is `I18nManager.isRTL ? 'he' : 'en'`. `setLanguage(lang)` calls `allowRTL(rtl)` + `forceRTL(rtl)`, then restarts (`DevSettings.reload()` in development, `Updates.reloadAsync()` in release builds).

- First launch: with `supportsRTL` (expo-localization plugin), a phone whose system language is Hebrew is RTL, so it starts in Hebrew; any other language starts in English.
- `allowRTL(false)` is required for English: on a Hebrew phone `forceRTL(false)` alone stays RTL.
- Once profiles exist (#9/#10), the profile's `preferredLanguage` is written from this value, and Settings uses `setLanguage`. The device setting stays authoritative for layout.

## Consequences

- No extra native dependency, and layout direction and language can't disagree.
- Only two languages map cleanly to direction. A third language (e.g. Russian, or Arabic as a second RTL language) would need real storage; revisit then.
- Uninstalling the app resets the choice to the device default, which is acceptable.
