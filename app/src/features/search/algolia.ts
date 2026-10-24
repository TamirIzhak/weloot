import { liteClient, type LiteClient } from 'algoliasearch/lite';

// Algolia search with the public search-only key (PRD §5.2); indexes are written by Cloud Functions only.
// Empty until the Algolia app exists (docs/OWNER-TODO.md 5): search then shows "not set up yet".

const APP_ID = process.env.EXPO_PUBLIC_ALGOLIA_APP_ID ?? '';
const SEARCH_KEY = process.env.EXPO_PUBLIC_ALGOLIA_SEARCH_KEY ?? '';

let client: LiteClient | null = null;

export function isSearchConfigured(): boolean {
  return APP_ID !== '' && SEARCH_KEY !== '';
}

export function searchClient(): LiteClient | null {
  if (!isSearchConfigured()) return null;
  client ??= liteClient(APP_ID, SEARCH_KEY);
  return client;
}
