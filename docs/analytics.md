# Analytics events

The PRD §11 events, what each one carries, and where it's logged. Parameters are IDs, counts and flags only, never
search text, names, phone numbers, emails or locations. Crash reports and analytics carry the Firebase user ID
(set by `MonitoringBridge`). Development builds don't send crashes to Crashlytics.

| Event | Parameters | Logged in |
|---|---|---|
| `sign_in_prompted` | `reason` (offer, question, message, wantlist, alert, add, inbox, profile, report, phone) | `features/auth/authGate.ts` |
| `user_registered` | `method` (google, facebook, discord, phone) | `features/auth/socialSignIn.ts`, `phoneVerification.ts` |
| `game_listed` | `platform`, `has_photos` (always false at publish; photos come after) | `features/listings/listingsApi.ts` |
| `photo_added` | `slot` | `features/listings/photos.ts` |
| `wantlist_added` | `igdb_game_id`, `platform` | `features/wantlist/wantlistApi.ts` |
| `search_performed` | `has_query`, `filtered`, `results` | `features/search/useListingSearch.ts` |
| `search_no_results` | same as `search_performed` | `features/search/useListingSearch.ts` |
| `alert_created` | `igdb_game_id`, `platform` | `features/alerts/alertsApi.ts` |
| `alert_notified` | `igdb_game_id`, `pushed` (first time a New for you item is shown) | `features/alerts/alertsApi.ts` |
| `alert_opened` | `igdb_game_id` (from New for you) or `listing_id`, `from: push` | `features/alerts/alertsApi.ts`, `features/monitoring/crash.ts` |
| `conversation_started` | `opener` (offer, question) | `features/offers/offersApi.ts` |
| `offer_sent` | `games_from`, `games_to`, `with_cash` | `features/offers/offersApi.ts` |
| `offer_countered` | same as `offer_sent` | `features/offers/offersApi.ts` |
| `offer_accepted` | none | `features/offers/offersApi.ts` |
| `deal_confirmed` | none | `features/offers/offersApi.ts` (`dealAction`) |
| `deal_completed` | none | `features/offers/offersApi.ts` (`dealAction`) |
| `deal_cancelled` | none | `features/offers/offersApi.ts` (`dealAction`) |
| `deal_disputed` | none | `features/offers/offersApi.ts` (`dealAction`) |
| `listing_closed` | `result` (traded, sold) | `features/listings/myListings.ts` |
| `listing_closed_outside` | `result` | `features/listings/myListings.ts` |
| `listing_shared` | `from` (game_page, my_listings, wantlist), `listing_id` | `features/share/share.ts` (only when actually shared) |
| `report_submitted` | `target_type` | `features/safety/reportApi.ts` |
| `phone_verified` (extra) | `mode` (signIn, link) | `features/auth/phoneVerification.ts` |

Funnels from PRD §1.3 that these cover:
- registration → first listing (`user_registered` → `game_listed`)
- zero-result searches and how many become alerts (`search_no_results` → `alert_created`)
- conversations per active user (`conversation_started`)
- offer → accepted → completed (`offer_sent` → `offer_accepted` → `deal_completed`)
- alert → return (`alert_notified` → `alert_opened`)

Deals closed by a scheduler (unconfirmed after 7 days) aren't client events. Count them in Firestore (`conversations` where `deal.status == 'unconfirmed'`).
