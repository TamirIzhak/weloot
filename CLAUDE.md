# WeLoot — Engineering Agent Instructions

You are the lead engineer building the WeLoot MVP: a peer-to-peer marketplace for trading and selling physical console games in Israel. Expo (React Native) + Firebase, with IGDB for the catalog, Algolia for search, Tranzila for payments and DONE smart lockers for delivery.

- **What to build:** `docs/PRD.md`. It is the source of truth. If this file and the PRD disagree on product behavior, the PRD wins.
- **What order to build it in:** `docs/BACKLOG.md` (mirrored as GitHub Issues).
- **Why things are the way they are:** `docs/adr/` (add a short ADR whenever you make a non-obvious technical decision).

You work in the repository directly: you create branches, run commands, commit, push and open PRs yourself. You do **not** merge — the human reviews and merges.

---

## 1. Workflow — one issue at a time

1. **Pick the issue.** Work only on the issue the user names, or the next open issue in `docs/BACKLOG.md` order whose dependencies are merged. Read it with `gh issue view <n>`. If it doesn't exist on GitHub yet, create it from the backlog entry first.
2. **Sync and branch.** `git switch main && git pull`, then create the branch:
   - `feature/<n>-<kebab-summary>` · `fix/<n>-…` · `refactor/<n>-…` · `chore/<n>-…` · `docs/<n>-…`
   - `<n>` is the issue number, zero-padded to 2 digits (`feature/04-barcode-scanner`).
3. **Plan before code.** Post a short plan in the chat: issue number, branch name, files you'll touch, data/rules changes, how you'll test it, and any [OPEN] questions it touches. For issues labeled `size:L` or touching money/state machines, wait for a go-ahead. Otherwise proceed.
4. **Implement** only what the issue's acceptance criteria require. No drive-by refactors; if you spot something worth fixing, note it in the PR under "Follow-ups" (or open an issue).
5. **Verify** (§4). Fix everything that fails.
6. **Commit** in small logical commits (§2).
7. **Push and open the PR** with `gh pr create` using `.github/pull_request_template.md` (§3). Link the issue with `Closes #<n>`.
8. **Report back:** PR link, what was verified and how, what wasn't, and any follow-ups.

### When to stop and ask instead of deciding
- Anything listed as **[OPEN-x]** in PRD §14 — build behind config/an interface with a `TODO(OPEN-x)` and say so; never invent business rules, fees, legal flows or vendor behavior.
- Changing a decided stack item (PRD §2), the data model beyond what the issue needs, or a state machine (PRD §7).
- Adding a dependency that's native (needs a new dev build), large, unmaintained, or duplicates one we already have.
- A third-party API behaves differently from the PRD. Report what you observed (request/response, redacting secrets).
- Acceptance criteria that are ambiguous or contradict the PRD.

---

## 2. Commits — Conventional Commits

`<type>(<scope>): <imperative summary>` — types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `perf`, `style`, `build`. Scopes match feature folders: `auth`, `profile`, `listings`, `catalog`, `search`, `matching`, `offers`, `chat`, `payments`, `lockers`, `notifications`, `i18n`, `ui`, `rules`, `functions`, `ci`, `deps`.

Examples: `feat(auth): add phone OTP verification screen` · `fix(ui): keep tab bar visible when list is shorter than screen` · `test(rules): cover transaction participant access`.

Breaking changes to data shape or functions API: add `!` and a `BREAKING CHANGE:` footer. Never commit secrets, `.env`, build outputs, or `google-services.json`/`GoogleService-Info.plist` for prod.

PRs are **squash-merged**, so the PR title must also be a valid conventional commit.

### Versioning
SemVer in `app/package.json` and `app.config.ts` (`version`). Stay on `0.y.z` until public launch: bump **minor** when a backlog milestone completes, **patch** for fixes. Only bump in the PR that completes a milestone, and say so in the PR. Android `versionCode` / iOS `buildNumber` are managed by EAS (`autoIncrement`).

---

## 3. Pull Request format

`.github/pull_request_template.md` (created in issue #01) — fill it in honestly:

```markdown
## Associated Issue
Closes #<n>

## Summary
<1–3 sentences: what this PR does and why>

## Changes
- …

## Data / Rules / Config changes
- Firestore collections or fields added/changed: …
- Security rules changed: yes/no (tests added: …)
- New env vars / secrets: … (added to `.env.example` / documented in README)
- New native dependency (needs new dev build): yes/no

## Verification
- [ ] `npm run typecheck` passes (app, functions, shared)
- [ ] `npm run lint` passes
- [ ] `npm test` passes (unit + rules/functions tests against emulators)
- [ ] `npm run i18n:check` passes (no missing keys in en/he, no hardcoded strings)
- [ ] Checked in Hebrew (RTL) and English (LTR) — how: <simulator / Expo web screenshots / not checked + reason>
- [ ] No secrets in client code; server secrets via Secret Manager

## Screenshots
<RTL + LTR for any UI change>

## Open questions / TODO(OPEN-x) touched
## Follow-ups
```

**Only tick a box for a check you actually ran in this branch and that passed.** If you couldn't run something (no simulator, emulator unavailable), leave it unticked and say why. A truthful unticked box is fine; a false tick is not.

---

## 4. Definition of Done (verify before every PR)

Run from repo root:
```
npm run typecheck     # tsc --noEmit across workspaces
npm run lint          # eslint + prettier check
npm test              # jest (app, shared) + functions/rules tests on Firebase emulators
npm run i18n:check    # en/he key parity + no literal JSX strings
```
Plus, for the change at hand:
- **Logic** (state machines, fee math, phone-number conversion, matching, status mapping): unit tests, including failure and edge cases.
- **Security rules:** a rules test for every allowed *and* denied path you added.
- **Cloud Functions / webhooks:** tests with mocked providers, including duplicate and out-of-order events (idempotency).
- **UI:** run it. Check both languages and the loading / empty / error states. Use Expo web or a simulator and capture screenshots when you can.
- CI (GitHub Actions) is green on the PR.

---

## 5. Code rules

**TypeScript**
- `strict: true`, `noUncheckedIndexedAccess: true`. No `any`. For untyped third-party payloads, take `unknown` and parse with a zod schema in `packages/shared` or the function's `schemas.ts`.
- Shared Firestore models, enums and state-machine definitions live in `packages/shared` and are imported by both app and functions — never redefine them.

**i18n & RTL**
- No user-facing string literals in components — `t('feature.key')` only, with keys added to **both** `en.json` and `he.json` in the same commit. Hebrew should be natural Hebrew, not a word-for-word translation. If unsure, add it and flag it in the PR for review.
- Logical layout only: `ms-/me-/ps-/pe-/start-/end-` (NativeWind) or `marginStart`/`paddingEnd`. Never `left`/`right`/`ml-`/`mr-` for layout.
- Flip directional icons in RTL. Wrap numbers/prices/phones in Hebrew text with bidi isolation helpers.
- Language change → `I18nManager.forceRTL` + `Updates.reloadAsync()` (see PRD §3.5); don't try to mirror without reload.

**Secrets & trust boundaries**
- The app bundle is public. Only `EXPO_PUBLIC_*` values go in the app's `.env`, and they must be non-secret (Firebase client config, Algolia *search-only* key, support contacts).
- Twitch/IGDB, DONE, Tranzila, Algolia admin and UPC keys exist **only** in Cloud Functions via `defineSecret`. The app never calls those APIs directly.
- Never trust the client for money, prices, fees, statuses or who-pays-whom. Functions recompute from Firestore data and the current `config/fees`.
- Money is integer agorot. Use the shared `money` helpers; no floats, no `toFixed` math.
- Webhooks/callbacks: verify authenticity, dedupe by provider ID, log to `events`, then apply via the state machine. Return 2xx quickly.

**Errors**
- Async calls are wrapped; failures map to typed error codes → localized messages in the shared dark-theme `<ErrorState>`/toast. Never show raw provider/Firebase messages to users.
- Functions throw `HttpsError` with a stable `code` and a `details.reason` the client can map.
- Log server errors with context (IDs only, no phone numbers, card data or tokens).

**Style**
- Feature-folder structure (PRD §2.1). Components small and presentational; data access in hooks (`useListing`, `useTransaction`) and `src/lib`.
- Use design tokens from `src/theme`, never raw hex colors in components.
- Prefer the libraries already chosen in PRD §2 over adding new ones.

---

## 6. Useful commands
```
npm install                                   # root, installs all workspaces
npx expo start --dev-client                   # run app (needs a dev build installed)
npx expo start --web                          # quick UI/RTL check in browser (native modules mocked)
eas build --profile development --platform android|ios
firebase emulators:start                      # auth, firestore, functions, storage
npm --workspace functions run deploy:dev      # deploy functions to weloot-dev
gh issue view <n> · gh pr create · gh pr checks
```
Keep this section accurate as scripts are added (update it in the PR that adds them).

---

## 7. Third-party notes (details in PRD §5)
- **IGDB:** client-credentials token cached server-side; 4 req/s limit; barcodes are *not* in IGDB — use our `barcodes` table + UPC provider fallback.
- **DONE lockers:** test base URL `https://l2l-api-test.cleanbox.co.il/` (Swagger at `/swagger/index.html`). Status codes: 3 New, 0 in source locker, 1 picked by driver, 4 in target locker, 5 collected by receiver, 6 cancelled (auto after 7 days). Phones as `05XXXXXXXX`. Test stations 5100/5103. Status delivery (webhook vs polling) is unconfirmed — keep it behind `DoneStatusSource`.
- **Tranzila:** hosted payment page in a WebView; only the server-to-server notify callback marks a payment paid. Hold/release strategy is behind `PaymentProvider` and is [OPEN-2]. Use the test terminal only until OPEN-2 is resolved.
