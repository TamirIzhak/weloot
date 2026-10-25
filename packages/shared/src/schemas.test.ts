import {
  alertSchema,
  conversationSchema,
  dealSchema,
  emailSchema,
  gameSchema,
  listingClosedWithSchema,
  listingInputSchema,
  messageSchema,
  normalizeEmail,
  personNameSchema,
  offerInputSchema,
  ratingSchema,
  timestampSchema,
  usernameSchema,
} from './schemas';
import { platformForIgdbId } from './enums';
import { gameRecordSchema, platformFilter, toGameRecord } from './search';

const ts = { toMillis: () => 1_760_000_000_000 };

const validListing = {
  igdbGameId: 119133,
  platform: 'switch',
  condition: 'like_new',
  hasCase: true,
  isForTrade: true,
  isForSale: false,
};

describe('timestampSchema', () => {
  it('accepts Firestore timestamps from either SDK and rejects plain values', () => {
    expect(timestampSchema.safeParse(ts).success).toBe(true);
    expect(timestampSchema.safeParse(new Date()).success).toBe(false);
    expect(timestampSchema.safeParse(1_760_000_000_000).success).toBe(false);
  });
});

describe('usernameSchema (PRD W1)', () => {
  it.each(['gamer_il', 'Dana99', 'abc', 'A_1'])('accepts %s', (name) => {
    expect(usernameSchema.safeParse(name).success).toBe(true);
  });

  it.each(['ab', 'a'.repeat(21), 'with space', 'emoji🎮', 'dash-name', 'גיימר_1', 'éclair'])(
    'rejects %p',
    (name) => {
      expect(usernameSchema.safeParse(name).success).toBe(false);
    },
  );
});

describe('personNameSchema', () => {
  it.each(['Dana', 'דנה', 'Ben-David', "O'Neil", 'Mary Ann', 'Zoë', 'J.'])('accepts %s', (name) => {
    expect(personNameSchema.safeParse(name).success).toBe(true);
  });

  it.each(['', ' Dana', '-Dana', 'Dana1', 'a'.repeat(41), 'dana@x', '🎮'])('rejects %p', (name) => {
    expect(personNameSchema.safeParse(name).success).toBe(false);
  });
});

describe('emailSchema', () => {
  it('normalizes emails to trimmed lower case', () => {
    expect(normalizeEmail(' Dana@Example.COM ')).toBe('dana@example.com');
  });

  it.each(['dana@example.com', 'a.b+games@mail.co.il'])('accepts %s', (email) => {
    expect(emailSchema.safeParse(email).success).toBe(true);
  });

  it.each(['', 'dana', 'dana@', '@example.com', 'dana @example.com', `${'a'.repeat(250)}@x.io`])(
    'rejects %p',
    (email) => {
      expect(emailSchema.safeParse(email).success).toBe(false);
    },
  );
});

describe('listingInputSchema (PRD W2)', () => {
  it('accepts a trade listing without photos and fills defaults', () => {
    const parsed = listingInputSchema.parse(validListing);
    expect(parsed.photoPaths).toEqual([]);
    expect(parsed.notes).toBe('');
  });

  it('requires trade or sale', () => {
    expect(listingInputSchema.safeParse({ ...validListing, isForTrade: false }).success).toBe(
      false,
    );
  });

  it('requires a whole-shekel price between ₪10 and ₪1,000 for sale listings', () => {
    const sale = { ...validListing, isForSale: true };
    expect(listingInputSchema.safeParse({ ...sale, askingPriceAgorot: 15_000 }).success).toBe(true);
    expect(listingInputSchema.safeParse(sale).success).toBe(false);
    expect(listingInputSchema.safeParse({ ...sale, askingPriceAgorot: 900 }).success).toBe(false);
    expect(listingInputSchema.safeParse({ ...sale, askingPriceAgorot: 100_100 }).success).toBe(
      false,
    );
    expect(listingInputSchema.safeParse({ ...sale, askingPriceAgorot: 15_050 }).success).toBe(
      false,
    );
  });

  it('rejects a price on a trade-only listing', () => {
    expect(
      listingInputSchema.safeParse({ ...validListing, askingPriceAgorot: 5_000 }).success,
    ).toBe(false);
  });

  it('limits photos to 6 and notes to 300 characters', () => {
    expect(
      listingInputSchema.safeParse({ ...validListing, photoPaths: Array(7).fill('p.jpg') }).success,
    ).toBe(false);
    expect(listingInputSchema.safeParse({ ...validListing, notes: 'x'.repeat(301) }).success).toBe(
      false,
    );
  });

  it('rejects unknown platforms and conditions', () => {
    expect(listingInputSchema.safeParse({ ...validListing, platform: 'gamecube' }).success).toBe(
      false,
    );
    expect(listingInputSchema.safeParse({ ...validListing, condition: 'broken' }).success).toBe(
      false,
    );
  });
});

describe('listingClosedWithSchema (PRD W6)', () => {
  it('accepts a WeLoot user via a conversation, or outside WeLoot', () => {
    expect(
      listingClosedWithSchema.safeParse({ kind: 'deal', userId: 'u2', conversationId: 'c1' })
        .success,
    ).toBe(true);
    expect(listingClosedWithSchema.safeParse({ kind: 'outside' }).success).toBe(true);
    expect(listingClosedWithSchema.safeParse({ kind: 'deal' }).success).toBe(false);
  });
});

describe('offerInputSchema (PRD W5)', () => {
  it('accepts games with an optional whole-shekel cash top-up and payer', () => {
    expect(
      offerInputSchema.safeParse({ itemsFrom: ['l1'], itemsTo: ['l2'], cashAgorot: 0 }).success,
    ).toBe(true);
    expect(
      offerInputSchema.safeParse({
        itemsFrom: ['l1'],
        itemsTo: ['l2'],
        cashAgorot: 5_000,
        cashPayerId: 'u1',
      }).success,
    ).toBe(true);
  });

  it('allows a cash-only offer', () => {
    expect(
      offerInputSchema.safeParse({
        itemsFrom: [],
        itemsTo: ['l2'],
        cashAgorot: 15_000,
        cashPayerId: 'u1',
      }).success,
    ).toBe(true);
  });

  it('rejects an empty offer, a payer-less top-up, and amounts over ₪2,000 or with agorot', () => {
    expect(offerInputSchema.safeParse({ itemsFrom: [], itemsTo: [], cashAgorot: 0 }).success).toBe(
      false,
    );
    expect(
      offerInputSchema.safeParse({ itemsFrom: ['l1'], itemsTo: [], cashAgorot: 5_000 }).success,
    ).toBe(false);
    expect(
      offerInputSchema.safeParse({
        itemsFrom: ['l1'],
        itemsTo: [],
        cashAgorot: 200_100,
        cashPayerId: 'u1',
      }).success,
    ).toBe(false);
    expect(
      offerInputSchema.safeParse({
        itemsFrom: ['l1'],
        itemsTo: [],
        cashAgorot: 1_050,
        cashPayerId: 'u1',
      }).success,
    ).toBe(false);
  });
});

describe('dealSchema', () => {
  const deal = {
    status: 'agreed',
    itemsOwner: ['l1'],
    itemsOther: ['l2'],
    cashAgorot: 0,
    confirmedBy: [],
    fulfillmentMethod: 'in_person',
    agreedAt: ts,
  };

  it('accepts a deal with no offer (owner swap)', () => {
    expect(
      dealSchema.safeParse({ ...deal, status: 'awaiting_confirmation', confirmedBy: ['u1'] })
        .success,
    ).toBe(true);
  });

  it('rejects duplicate confirmations and payer-less cash', () => {
    expect(dealSchema.safeParse({ ...deal, confirmedBy: ['u1', 'u1'] }).success).toBe(false);
    expect(dealSchema.safeParse({ ...deal, cashAgorot: 5_000 }).success).toBe(false);
  });

  it('only allows in-person fulfillment in the MVP', () => {
    expect(dealSchema.safeParse({ ...deal, fulfillmentMethod: 'locker' }).success).toBe(false);
  });
});

describe('conversationSchema', () => {
  const conversation = {
    listingId: 'l1',
    ownerId: 'u1',
    otherId: 'u2',
    participants: ['u1', 'u2'],
    openedWith: 'question',
    unread: { u1: 0, u2: 1 },
    createdAt: ts,
    updatedAt: ts,
  };

  it('accepts a valid conversation', () => {
    expect(conversationSchema.safeParse(conversation).success).toBe(true);
  });

  it('rejects talking to yourself and mismatched participants', () => {
    expect(
      conversationSchema.safeParse({ ...conversation, otherId: 'u1', participants: ['u1', 'u1'] })
        .success,
    ).toBe(false);
    expect(
      conversationSchema.safeParse({ ...conversation, participants: ['u1', 'u3'] }).success,
    ).toBe(false);
  });
});

describe('messageSchema, alertSchema, ratingSchema', () => {
  it('requires text for text messages and an offer for offer messages', () => {
    expect(messageSchema.safeParse({ senderId: 'u1', type: 'text', createdAt: ts }).success).toBe(
      false,
    );
    expect(messageSchema.safeParse({ senderId: 'u1', type: 'offer', createdAt: ts }).success).toBe(
      false,
    );
    expect(
      messageSchema.safeParse({ senderId: 'system', type: 'safety_tips', createdAt: ts }).success,
    ).toBe(true);
  });

  it('needs a catalog game for an alert (no free-text alerts)', () => {
    const alert = { gameTitle: 'Zelda', radiusKm: 20, source: 'search', createdAt: ts };
    expect(alertSchema.safeParse({ ...alert, query: 'zelda' }).success).toBe(false);
    expect(alertSchema.safeParse({ ...alert, igdbGameId: 119388 }).success).toBe(true);
    expect(alertSchema.safeParse({ ...alert, igdbGameId: 119388, lat: 51, lng: 0 }).success).toBe(
      false,
    );
  });

  it('rates 1–5 whole stars', () => {
    const rating = { raterId: 'u1', rateeId: 'u2', createdAt: ts };
    expect(ratingSchema.safeParse({ ...rating, stars: 5 }).success).toBe(true);
    expect(ratingSchema.safeParse({ ...rating, stars: 0 }).success).toBe(false);
    expect(ratingSchema.safeParse({ ...rating, stars: 4.5 }).success).toBe(false);
  });
});

describe('gameSchema', () => {
  const game = {
    title: 'Elden Ring',
    slug: 'elden-ring',
    platforms: ['ps5'],
    platformIds: [167],
    genres: [],
    altNames: [],
    similarGameIds: [],
    igdbUpdatedAt: 1700000000,
  };

  it('accepts a synced game', () => {
    expect(gameSchema.safeParse(game).success).toBe(true);
  });

  it('needs at least one supported platform', () => {
    expect(gameSchema.safeParse({ ...game, platforms: [] }).success).toBe(false);
    expect(gameSchema.safeParse({ ...game, platforms: ['pc'] }).success).toBe(false);
  });
});

describe('platformForIgdbId', () => {
  it('maps IGDB platform IDs to WeLoot platforms', () => {
    expect(platformForIgdbId(167)).toBe('ps5');
    expect(platformForIgdbId(130)).toBe('switch');
    expect(platformForIgdbId(6)).toBeUndefined();
  });
});

describe('game search records', () => {
  const game = {
    title: 'Elden Ring',
    slug: 'elden-ring',
    platforms: ['ps5' as const],
    platformIds: [167],
    coverImageId: 'co4jni',
    releaseDate: { toMillis: () => Date.UTC(2022, 1, 25) },
    genres: ['RPG'],
    altNames: ['ER'],
    similarGameIds: [1],
    igdbUpdatedAt: 1700000000,
  };

  it('keeps what search needs, with the release year', () => {
    expect(toGameRecord('119133', game)).toEqual({
      objectID: '119133',
      title: 'Elden Ring',
      slug: 'elden-ring',
      platforms: ['ps5'],
      coverImageId: 'co4jni',
      releaseYear: 2022,
      genres: ['RPG'],
      altNames: ['ER'],
    });
    expect(gameRecordSchema.safeParse(toGameRecord('119133', game)).success).toBe(true);
  });

  it('leaves out a missing cover or release date', () => {
    const record = toGameRecord('1', { ...game, coverImageId: undefined, releaseDate: undefined });
    expect(record).not.toHaveProperty('coverImageId');
    expect(record).not.toHaveProperty('releaseYear');
  });

  it('builds a platform filter', () => {
    expect(platformFilter('xbox_series')).toBe('platforms:xbox_series');
  });
});
