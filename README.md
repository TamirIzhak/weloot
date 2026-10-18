# WeLoot

Peer-to-peer marketplace for trading and selling physical console games in Israel. Expo (React Native) app + Firebase backend.

- Product spec: [docs/PRD.md](docs/PRD.md)
- Build order: [docs/BACKLOG.md](docs/BACKLOG.md)
- Engineering workflow (branches, commits, PRs): [CLAUDE.md](CLAUDE.md)

## Repository layout

| Path                               | What                                                                 |
| ---------------------------------- | -------------------------------------------------------------------- |
| `app/`                             | Expo app (Expo Router, routes in `app/src/app/`)                     |
| `functions/`                       | Firebase Cloud Functions (TypeScript, bundled with esbuild)          |
| `packages/shared`                  | Types, zod schemas, state machines and utils shared by app/functions |
| `rules-tests/`                     | Firestore + Storage security rules tests (run on the emulators)      |
| `firestore.rules`, `storage.rules` | Security rules (default deny until each collection is added)         |
| `firebase.json`, `.firebaserc`     | Firebase CLI config: emulators, rules, functions deploy              |
| `docs/`                            | PRD, backlog, architecture decision records                          |

## Prerequisites

- Node **22.12+** (`.nvmrc` pins 22.20.0 — `nvm use`)
- **Java 21** for the Firestore/Storage emulators (e.g. `winget install Microsoft.OpenJDK.21`)
- Git, GitHub CLI (`gh`)
- The Firebase CLI is a dev dependency (`npx firebase …`); no global install needed
- Later: EAS CLI and an Android emulator / iOS simulator (#3)

## Setup

```bash
npm install
cp .env.example app/.env   # fill in values; everything in this file is public
```

## Commands (run from repo root)

| Command                              | What                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                  | `tsc --noEmit` in every workspace                                                                    |
| `npm run lint`                       | ESLint in every workspace + Prettier check                                                           |
| `npm test`                           | Jest in every workspace (rules tests start their own emulators)                                      |
| `npm run format`                     | Prettier write                                                                                       |
| `npm run emulators`                  | Build functions, then start auth/firestore/functions/storage emulators (UI on http://127.0.0.1:4000) |
| `npm run start -w @weloot/app`       | Expo dev server                                                                                      |
| `npm run web -w @weloot/app`         | Run the app in a browser                                                                             |
| `npm run build -w @weloot/functions` | Bundle functions to `functions/lib`                                                                  |

Add app dependencies with `npx expo install <pkg>` from `app/` so versions match the Expo SDK.

## Firebase projects

| Alias     | Project ID          | Console name | Use                                                               |
| --------- | ------------------- | ------------ | ----------------------------------------------------------------- |
| `default` | `demo-weloot`       | —            | Emulators only. `demo-` projects never touch real cloud resources |
| `dev`     | `development-1c64a` | Development  | Development                                                       |
| `staging` | `staging-d0c10`     | Staging      | EAS `preview` builds                                              |
| `prod`    | `weloot-c5fb2`      | WeLoot       | Production                                                        |

**Location: `me-west1` (Tel Aviv) for everything** ([ADR 0001](docs/adr/0001-region-me-west1.md)). Firestore and Storage locations can't be changed after creation, so when creating them in a project, always choose `me-west1`. Functions get their region from `setGlobalOptions` in `functions/src/index.ts`.

Setup status (as of 2026-10-18): all three projects exist but have no Firestore database or Storage bucket yet. Firestore can be created on the free Spark plan. A Storage bucket and deployed Cloud Functions need the **Blaze** (pay-as-you-go) plan.

Always name the alias explicitly, e.g. `npx firebase deploy -P dev`. Don't run `npx firebase use <alias>`: it saves that project as this folder's active project, and every later command without `-P`, including a bare `deploy`, would then target it. Check with `npx firebase use` (it should print `demo-weloot`), and reset with `npx firebase use --clear`. Run `npx firebase login` once per machine.

## Secrets

The app bundle is public: only non-secret `EXPO_PUBLIC_*` values go in `app/.env`.

Server credentials live in Google Secret Manager and are declared in [`functions/src/secrets.ts`](functions/src/secrets.ts). A secret only has to be set in a project once a deployed function binds it.

| Secret                                     | Used by                     | Issue |
| ------------------------------------------ | --------------------------- | ----- |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | IGDB catalog sync           | #12   |
| `ALGOLIA_ADMIN_KEY`                        | Algolia index writes        | #13   |
| `UPC_LOOKUP_API_KEY`                       | Barcode lookup fallback     | #14   |
| `TRANZILA_TERMINAL`, `TRANZILA_API_KEY`    | Payments                    | #28   |
| `TRANZILA_NOTIFY_SECRET`                   | Verifying payment callbacks | #28   |
| `DONE_USERNAME`, `DONE_PASSWORD`           | DONE locker API             | #31   |
| `DONE_WEBHOOK_SECRET`                      | Verifying locker webhooks   | #33   |

Non-secret server config (for example `DONE_BASE_URL`) is a `defineString` parameter, set per project in `functions/.env.<projectId>`.

- **Set in a project:** `npx firebase functions:secrets:set TWITCH_CLIENT_ID -P dev`
- **Emulator:** put `NAME=value` lines in `functions/.secret.local` (git-ignored)

## Troubleshooting

- **"Cannot determine backend specification. Timeout after 10000"** when starting the emulators: the first cold start on Windows can exceed the 10 s functions discovery timeout. Re-run, or set `$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"` first.
- **Emulators fail with a Java error:** install Java 21 and open a new terminal so `java` is on `PATH`.

## Notes

- ESLint is pinned to v9: `eslint-plugin-react` (used by `eslint-config-expo`) doesn't support ESLint 10 yet. The app runs `eslint .` instead of `expo lint`, because `expo lint` upgrades ESLint on its own.
