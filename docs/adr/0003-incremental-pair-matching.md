# ADR 0003: Incremental matching by user pair

- **Status:** Accepted (2026-10-25)
- **Issue:** #21

## Context

PRD W3 needs `matches/{userId}/items/{otherUserId}` for every user: who has something I want (one-way), and whether they also want something I have (perfect). The match has to stay right as listings change status (active, paused, reserved, closed), as listings get photos, and as want lists change. The issue's acceptance criteria rule out recomputing everything on a schedule ("incremental, not full-scan").

Options:

1. **A nightly batch** over all users. Simple, but matches would be up to a day stale and the cost grows with users², which breaks the acceptance criteria.
2. **Patch the existing match docs from each event** (add or remove one listing ID). Cheap, but it depends on events arriving once and in order. Firestore triggers are at-least-once and unordered, so this drifts.
3. **Recompute only the pairs an event can affect, each from scratch.**
   - A listing change touches its owner and the users who want that game.
   - A want-list change touches that user and the owners of active listings of that game.

## Decision

Option 3, with one pure rule (`computeMatch` in `packages/shared`) and two triggers (`matchOnListing`, `matchOnWant`).

- **Transactions.** Each pair is recomputed inside a Firestore transaction from current data: both want lists, both users' active listings, both block lists, and both match docs. Repeated or out-of-order events therefore converge to the same result.
- **Skipped work.**
  - Listing writes that matching can't see (notes, price, `updatedAt`) are skipped before any query.
  - A recomputation that changes nothing doesn't rewrite the doc.
- **Distance.** It is measured between the two users' listings, which are area-level points. Users have no stored location: the browsing location stays on the device. So a one-way match has a distance only when the viewer has an active listing, and `distanceKm` is optional. The app also measures distance from the browsing location when it displays matches.
- **Want-list lookup.** "Who wants game X" is a collection-group query on `items` with `igdbGameId`. Alerts and matches also use the `items` name, so the results are filtered to the `wantlist` parent. The index is a field override in `firestore.indexes.json`.

## Consequences

- **Fan-out.** One listing write costs one query plus a transaction for each user who wants that game. For a very popular game this grows with its wanters. That's fine at MVP scale; if it becomes a problem, batch by platform or move the fan-out to a task queue.
- **Blocking.** It is honoured at recomputation time. Blocking or unblocking has to trigger a recomputation for that pair (`TODO(#37)`).
- **Account deletion** removes `matches/{uid}`. The other side's docs disappear as the user's listings and want list are deleted, since those deletions trigger recomputation.
