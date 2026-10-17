# WeLoot

Peer-to-peer marketplace for trading and selling physical console games in Israel. Expo (React Native) app + Firebase backend.

- Product spec: [docs/PRD.md](docs/PRD.md)
- Build order: [docs/BACKLOG.md](docs/BACKLOG.md)
- Engineering workflow (branches, commits, PRs): [CLAUDE.md](CLAUDE.md)

## Repository layout

| Path              | What                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| `app/`            | Expo app (Expo Router, routes in `app/src/app/`)                     |
| `functions/`      | Firebase Cloud Functions (TypeScript, bundled with esbuild)          |
| `packages/shared` | Types, zod schemas, state machines and utils shared by app/functions |
| `docs/`           | PRD, backlog, architecture decision records                          |

## Prerequisites

- Node **22.12+** (`.nvmrc` pins 22.20.0 — `nvm use`)
- Git, GitHub CLI (`gh`)
- Later milestones: Firebase CLI (#02), EAS CLI and an Android emulator / iOS simulator (#03)

## Setup

```bash
npm install
cp .env.example app/.env   # fill in values; everything in this file is public
```

## Commands (run from repo root)

| Command                              | What                                       |
| ------------------------------------ | ------------------------------------------ |
| `npm run typecheck`                  | `tsc --noEmit` in every workspace          |
| `npm run lint`                       | ESLint in every workspace + Prettier check |
| `npm test`                           | Jest in every workspace                    |
| `npm run format`                     | Prettier write                             |
| `npm run start -w @weloot/app`       | Expo dev server                            |
| `npm run web -w @weloot/app`         | Run the app in a browser                   |
| `npm run build -w @weloot/functions` | Bundle functions to `functions/lib`        |

Add app dependencies with `npx expo install <pkg>` from `app/` so versions match the Expo SDK.

## Secrets

The app bundle is public: only non-secret `EXPO_PUBLIC_*` values go in `app/.env`. Server credentials (Twitch/IGDB, DONE, Tranzila, Algolia admin) live in Firebase Secret Manager — set up in #02.

## Notes

- ESLint is pinned to v9: `eslint-plugin-react` (used by `eslint-config-expo`) doesn't support ESLint 10 yet. The app runs `eslint .` instead of `expo lint`, because `expo lint` upgrades ESLint on its own.
