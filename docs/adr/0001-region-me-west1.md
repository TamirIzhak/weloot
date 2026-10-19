# ADR 0001 — Host Firebase in me-west1 (Tel Aviv)

- **Status:** Accepted (2026-10-18, project owner)
- **Issue:** #43

## Context

WeLoot's users are all in Israel. The PRD originally picked `europe-west1` (Belgium) as the closest region with full feature support. Before any database or bucket was created, we checked the three Firebase projects (`development-1c64a`, `staging-d0c10`, `weloot-c5fb2`). All were blank: Firestore API not enabled, no Storage bucket, no default resource location. Choosing a region now costs nothing.

Google's location docs (checked 2026-10-18) list `me-west1` (Tel Aviv) for:

- Cloud Firestore (regional location)
- Cloud Storage buckets (`*.firebasestorage.app` buckets can use any Cloud Storage location)
- Cloud Run, Tier 1 pricing (Cloud Functions 2nd gen run on Cloud Run)

## Decision

Use `me-west1` for Firestore, Storage and Cloud Functions in **all three** projects, so dev and staging behave like production.

## Consequences

- Lower latency for Israeli users, and personal data (phone numbers, chats, photos) stays in Israel, which helps with the Israeli Privacy Protection Law (PRD §12).
- Firestore and Storage locations are permanent once created. Anyone creating them must pick `me-west1` (README "Firebase projects").
- Storage outside `us-central1`/`us-east1`/`us-west1` doesn't get the Cloud Storage "Always Free" tier; MVP-scale photo storage costs are expected to be small.
- Firestore-triggered functions should stay in `me-west1`, next to the database.
- Not yet verified: whether Cloud Scheduler (used for scheduled functions) offers `me-west1` as its own location. Scheduled functions can still target `me-west1` functions. Re-check when the first scheduled function lands (#12).
