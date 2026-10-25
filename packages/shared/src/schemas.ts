import { z } from 'zod';

import {
  ALERT_SOURCES,
  CONDITIONS,
  CONVERSATION_OPENERS,
  LANGUAGES,
  MESSAGE_TYPES,
  PLATFORM_KEYS,
  REPORT_REASONS,
  REPORT_TARGETS,
  type PlatformKey,
} from './enums';
import { DEAL_STATUSES, LISTING_STATUSES, OFFER_STATUSES } from './machines';
import {
  ASKING_PRICE_MAX_AGOROT,
  ASKING_PRICE_MIN_AGOROT,
  CASH_TOP_UP_MAX_AGOROT,
  isWholeShekelAmount,
} from './money';

// Firestore document shapes (PRD §8). Used to validate Cloud Function input/output and documents read from
// Firestore. Fields marked 🔒 in the PRD are written only by Functions; Security Rules enforce that.

/** A Firestore Timestamp from either SDK (admin or client): anything with `toMillis()`. */
export type TimestampLike = { toMillis: () => number };
export const timestampSchema = z.custom<TimestampLike>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis: unknown }).toMillis === 'function',
  { message: 'Expected a Firestore Timestamp' },
);

const id = z.string().min(1).max(128);
const uid = id;
const platform = z.enum(PLATFORM_KEYS as [PlatformKey, ...PlatformKey[]]);
const timestamps = { createdAt: timestampSchema, updatedAt: timestampSchema };

/** A point in Israel with its geohash. Public docs only hold area-level points (`snapToArea`, PRD W2, §12). */
export const geoSchema = z.object({
  lat: z.number().min(29).max(34),
  lng: z.number().min(34).max(36),
  geohash: z.string().min(4).max(12),
});

/** 3–20 English letters, digits or `_` (PRD W1). */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const usernameSchema = z.string().regex(USERNAME_PATTERN);

/** A locality from the shared list (cities.ts): its CBS code, displayed in the reader's language. */
export const cityIdSchema = z.string().regex(/^[1-9][0-9]{0,5}$/);

/** Contact email (PRD W1): stored lower-case in private settings, never shown to other users. */
export const emailSchema = z.email().max(254);

/**
 * A first or last name: letters in any language, with spaces, hyphens, apostrophes or dots inside ("Ben-David",
 * "O'Neil"). Private: shown only to people the user is in a conversation with (PRD W1).
 */
export const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\p{M} '’.-]{0,39}$/u;
export const personNameSchema = z.string().regex(PERSON_NAME_PATTERN);

/** Emails are stored trimmed and lower-case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * `users/{uid}`: the PUBLIC profile, readable by everyone incl. guests (PRD W1, listings show their owner).
 * Holds nothing private: no phone number (it stays in Firebase Auth), no tokens, no settings. 🔒 fields start at 0
 * and only Functions change them.
 */
export const userProfileSchema = z.object({
  username: usernameSchema,
  usernameLower: z.string(),
  ratingAvg: z.number().min(0).max(5),
  ratingCount: z.number().int().min(0),
  completedTrades: z.number().int().min(0),
  deletedAt: timestampSchema.optional(),
  ...timestamps,
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/** `users/{uid}/private/settings`: readable and writable only by the owner (and Functions). */
export const userSettingsSchema = z.object({
  preferredLanguage: z.enum(LANGUAGES),
  tosVersion: z.string().min(1),
  tosAcceptedAt: timestampSchema,
  /** The user confirmed they're 16 or older (OPEN-9 default). */
  ageConfirmed: z.literal(true),
  firstName: personNameSchema,
  lastName: personNameSchema,
  email: emailSchema,
  /** Explicit opt-in to promotional messages (a separate, unticked checkbox). */
  marketingOptIn: z.boolean(),
  /** When the user opted in; absent while they haven't. */
  marketingOptInAt: timestampSchema.optional(),
  fcmTokens: z.array(z.string()).max(10),
  blockedUserIds: z.array(uid).max(500),
  searchRadiusKm: z.number().int().min(1).max(200),
  ...timestamps,
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

/** What the profile-setup step submits (validated in the app; Security Rules enforce the same rules). */
export const profileSetupInputSchema = z.object({
  username: usernameSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  email: emailSchema,
  marketingOptIn: z.boolean(),
  acceptedTerms: z.literal(true),
});
export type ProfileSetupInput = z.infer<typeof profileSetupInputSchema>;

export const usernameDocSchema = z.object({ uid });

const latitude = z.number().min(29).max(34);
const longitude = z.number().min(34).max(36);

/**
 * `users/{uid}/locations/{id}`: a saved address for posting (PRD W2), like Wolt. Owner-only: the exact address
 * and point never leave this doc; listings get an area-level copy (`listingLocationSchema`).
 */
export const savedLocationInputSchema = z.object({
  label: z.string().trim().min(1).max(30),
  address: z.string().trim().min(1).max(200),
  lat: latitude,
  lng: longitude,
  /** CBS code of the locality, when the address could be matched to one. */
  cityId: cityIdSchema.optional(),
  /** What others see on a listing, e.g. "Ramat Gan" (the locality or nearest one). */
  areaName: z.string().trim().min(1).max(60),
});
export type SavedLocationInput = z.infer<typeof savedLocationInputSchema>;
export const savedLocationSchema = savedLocationInputSchema.extend(timestamps);
export type SavedLocation = z.infer<typeof savedLocationSchema>;

/** Most saved addresses per user (enforced in the app; plenty for home, work, family…). */
export const MAX_SAVED_LOCATIONS = 10;

/** A listing's public location (🔒, set by the publish function): area only, never the saved address. */
export const listingLocationSchema = geoSchema.extend({
  areaName: z.string().min(1).max(60),
  cityId: cityIdSchema.optional(),
});
export type ListingLocation = z.infer<typeof listingLocationSchema>;

/**
 * `games/{igdbId}` 🔒: the catalog, synced from IGDB by a Cloud Function (PRD §5.1); readable by everyone.
 * `platforms` holds only the consoles WeLoot supports.
 */
export const gameSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  platforms: z.array(platform).min(1),
  platformIds: z.array(z.number().int()),
  coverImageId: z.string().optional(),
  releaseDate: timestampSchema.optional(),
  genres: z.array(z.string()),
  altNames: z.array(z.string()),
  similarGameIds: z.array(z.number().int()),
  /** IGDB's `updated_at` (Unix seconds), for incremental syncs. */
  igdbUpdatedAt: z.number().int(),
});
export type Game = z.infer<typeof gameSchema>;

export const barcodeSchema = z.object({
  igdbGameId: z.number().int(),
  platform,
  confirmations: z.number().int().min(1),
  trusted: z.boolean(),
});

export const listingClosedWithSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('deal'), userId: uid, conversationId: id }),
  z.object({ kind: z.literal('outside') }),
]);

/** Fields the owner submits when publishing (validated client- and server-side, PRD W2). */
export const listingInputSchema = z
  .object({
    igdbGameId: z.number().int().positive(),
    platform,
    condition: z.enum(CONDITIONS),
    hasCase: z.boolean(),
    notes: z.string().max(300).default(''),
    isForTrade: z.boolean(),
    isForSale: z.boolean(),
    askingPriceAgorot: z.number().optional(),
    photoPaths: z.array(z.string().min(1)).max(6).default([]),
  })
  .superRefine((listing, ctx) => {
    if (!listing.isForTrade && !listing.isForSale) {
      ctx.addIssue({
        code: 'custom',
        message: 'A listing must be for trade, for sale, or both',
        path: ['isForTrade'],
      });
    }
    if (listing.isForSale) {
      if (
        !isWholeShekelAmount(
          listing.askingPriceAgorot,
          ASKING_PRICE_MIN_AGOROT,
          ASKING_PRICE_MAX_AGOROT,
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Asking price must be whole shekels between ₪10 and ₪1,000',
          path: ['askingPriceAgorot'],
        });
      }
    } else if (listing.askingPriceAgorot !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Only for-sale listings have a price',
        path: ['askingPriceAgorot'],
      });
    }
  });
export type ListingInput = z.infer<typeof listingInputSchema>;

/**
 * What the app sends to `publishListing` (PRD W2). `locationId` is one of the user's saved addresses (only its area
 * is published). `requestId` becomes the listing's ID, so a repeated tap creates one listing. Photos are added
 * after publishing (#15).
 */
export const publishListingInputSchema = z.object({
  listing: listingInputSchema,
  locationId: id,
  requestId: z.string().regex(/^[A-Za-z0-9]{16,40}$/),
});
export type PublishListingInput = z.input<typeof publishListingInputSchema>;
export type PublishListingResult = { listingId: string };

/** Stable `details.reason` values of `publishListing`. */
export type PublishListingError =
  'invalidInput' | 'unknownGame' | 'wrongPlatform' | 'unknownLocation' | 'profileRequired';

export const listingSchema = z.object({
  userId: uid,
  igdbGameId: z.number().int().positive(),
  platform,
  gameTitle: z.string().min(1),
  coverImageId: z.string().optional(),
  condition: z.enum(CONDITIONS),
  hasCase: z.boolean(),
  notes: z.string().max(300),
  isForTrade: z.boolean(),
  isForSale: z.boolean(),
  askingPriceAgorot: z.number().int().optional(),
  photoPaths: z.array(z.string()).max(6),
  hasPhotos: z.boolean(),
  status: z.enum(LISTING_STATUSES),
  location: listingLocationSchema,
  closedWith: listingClosedWithSchema.optional(),
  closedAt: timestampSchema.optional(),
  ...timestamps,
});
export type ListingDoc = z.infer<typeof listingSchema>;

export const wantlistItemSchema = z.object({
  igdbGameId: z.number().int().positive(),
  platform: platform.optional(),
  gameTitle: z.string().min(1),
});

export const alertSchema = z
  .object({
    igdbGameId: z.number().int().positive().optional(),
    platform: platform.optional(),
    query: z.string().min(1).max(80).optional(),
    radiusKm: z.number().int().min(1).max(200),
    source: z.enum(ALERT_SOURCES),
    lastNotifiedAt: timestampSchema.optional(),
  })
  .refine((alert) => alert.igdbGameId !== undefined || alert.query !== undefined, {
    message: 'An alert needs a game or a search query',
  });

export const matchSchema = z.object({
  theirListingIds: z.array(id),
  myListingIds: z.array(id),
  perfect: z.boolean(),
  score: z.number(),
  distanceKm: z.number().min(0),
});

/** Who pays a recorded cash top-up, if any (PRD W5). The amount is whole shekels, at most ₪2,000. */
const cashTopUp = {
  cashAgorot: z.number().refine((value) => isWholeShekelAmount(value, 0, CASH_TOP_UP_MAX_AGOROT), {
    message: 'Cash top-up must be whole shekels between ₪0 and ₪2,000',
  }),
  cashPayerId: uid.optional(),
};

export const dealSchema = z
  .object({
    status: z.enum(DEAL_STATUSES),
    offerId: id.optional(),
    itemsOwner: z.array(id),
    itemsOther: z.array(id),
    ...cashTopUp,
    confirmedBy: z.array(uid).max(2),
    awaitingSince: timestampSchema.optional(),
    fulfillmentMethod: z.literal('in_person'),
    agreedAt: timestampSchema,
    completedAt: timestampSchema.optional(),
    cancelReason: z.string().min(1).max(300).optional(),
  })
  .refine((deal) => deal.cashAgorot === 0 || deal.cashPayerId !== undefined, {
    message: 'A cash top-up needs a payer',
    path: ['cashPayerId'],
  })
  .refine((deal) => new Set(deal.confirmedBy).size === deal.confirmedBy.length, {
    message: 'A participant confirms at most once',
    path: ['confirmedBy'],
  });

export const conversationSchema = z
  .object({
    listingId: id,
    ownerId: uid,
    otherId: uid,
    participants: z.tuple([uid, uid]),
    openedWith: z.enum(CONVERSATION_OPENERS),
    lastMessageAt: timestampSchema.optional(),
    lastMessagePreview: z.string().max(140).optional(),
    unread: z.record(z.string(), z.number().int().min(0)),
    currentOfferId: id.optional(),
    deal: dealSchema.optional(),
    ...timestamps,
  })
  .refine((c) => c.ownerId !== c.otherId, {
    message: "You can't start a conversation with yourself",
  })
  .refine((c) => c.participants.includes(c.ownerId) && c.participants.includes(c.otherId), {
    message: 'participants must be the owner and the other user',
  });

export const messageSchema = z
  .object({
    senderId: z.union([uid, z.literal('system')]),
    type: z.enum(MESSAGE_TYPES),
    text: z.string().min(1).max(2000).optional(),
    offerId: id.optional(),
    createdAt: timestampSchema,
  })
  .refine((m) => (m.type === 'text' ? m.text !== undefined : true), {
    message: 'Text messages need text',
  })
  .refine((m) => (m.type === 'offer' ? m.offerId !== undefined : true), {
    message: 'Offer messages need an offerId',
  });

/** What an offer's sender submits (validated in the callable function, PRD W5). */
export const offerInputSchema = z
  .object({
    itemsFrom: z.array(id).max(5),
    itemsTo: z.array(id).max(5),
    ...cashTopUp,
    note: z.string().max(300).optional(),
  })
  .refine((o) => o.itemsFrom.length + o.itemsTo.length > 0 || o.cashAgorot > 0, {
    message: 'An offer needs at least one game or a cash amount',
  })
  .refine((o) => o.cashAgorot === 0 || o.cashPayerId !== undefined, {
    message: 'A cash top-up needs a payer',
    path: ['cashPayerId'],
  });
export type OfferInput = z.infer<typeof offerInputSchema>;

export const offerSchema = z.object({
  fromUid: uid,
  toUid: uid,
  itemsFrom: z.array(id).max(5),
  itemsTo: z.array(id).max(5),
  ...cashTopUp,
  note: z.string().max(300).optional(),
  status: z.enum(OFFER_STATUSES),
  supersedesOfferId: id.optional(),
  expiresAt: timestampSchema,
  ...timestamps,
});

export const ratingSchema = z.object({
  raterId: uid,
  rateeId: uid,
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  createdAt: timestampSchema,
});

export const reportSchema = z.object({
  reporterId: uid,
  targetType: z.enum(REPORT_TARGETS),
  targetId: id,
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(1000).optional(),
  createdAt: timestampSchema,
});

/** `config/app`: public app settings. */
export const appConfigSchema = z.object({
  minAppVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  launchRegions: z.array(z.string()).optional(),
});

/** `config/limits`: tunable limits (PRD W5, W6, W8, §12). */
export const limitsConfigSchema = z.object({
  offerExpiryHours: z.number().int().min(1),
  dealConfirmationDays: z.number().int().min(1),
  alertPushesPerDay: z.number().int().min(0),
  alertCooldownHours: z.number().int().min(0),
  newAccountConversationsPerDay: z.number().int().min(1),
});
