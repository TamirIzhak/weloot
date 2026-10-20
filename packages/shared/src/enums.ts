// Fixed value lists from the PRD, shared by app, functions and rules tests.

/** Consoles WeLoot supports (PRD §1, §5.1), with their IGDB platform IDs and UI family (chip color). */
export const PLATFORMS = {
  ps5: { igdbId: 167, family: 'ps' },
  ps4: { igdbId: 48, family: 'ps' },
  switch: { igdbId: 130, family: 'nintendo' },
  xbox_series: { igdbId: 169, family: 'xbox' },
  xbox_one: { igdbId: 49, family: 'xbox' },
  // Switch 2: add once its IGDB platform ID is verified (PRD §5.1).
} as const;
export type PlatformKey = keyof typeof PLATFORMS;
export const PLATFORM_KEYS = Object.keys(PLATFORMS) as PlatformKey[];
export type PlatformFamily = (typeof PLATFORMS)[PlatformKey]['family'];

/** Listing condition, best to worst (PRD W2). */
export const CONDITIONS = ['new_sealed', 'like_new', 'good', 'acceptable'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LANGUAGES = ['en', 'he'] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

/** How a conversation started (PRD W5). */
export const CONVERSATION_OPENERS = ['offer', 'question'] as const;
export type ConversationOpener = (typeof CONVERSATION_OPENERS)[number];

export const MESSAGE_TYPES = ['text', 'offer', 'system', 'safety_tips'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** Where an alert came from (PRD W8). */
export const ALERT_SOURCES = ['search', 'wantlist'] as const;
export type AlertSource = (typeof ALERT_SOURCES)[number];

/** What a report is about (PRD W9). */
export const REPORT_TARGETS = ['user', 'listing', 'message', 'deal'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = [
  'scam',
  'fake_or_damaged',
  'no_show',
  'offensive',
  'spam',
  'swap_didnt_happen',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Who a closed listing went to (PRD W6). */
export const LISTING_CLOSE_KINDS = ['deal', 'outside'] as const;
export type ListingCloseKind = (typeof LISTING_CLOSE_KINDS)[number];
