import type { ListingDoc } from './schemas';
import { listingFilters, listingRecordSchema, MAX_EXCLUDED_USERS, toListingRecord } from './search';

const at = (ms: number) => ({ toMillis: () => ms });

const LISTING: ListingDoc = {
  userId: 'u1',
  igdbGameId: 119133,
  platform: 'ps5',
  gameTitle: 'Elden Ring',
  coverImageId: 'co4jni',
  condition: 'like_new',
  hasCase: true,
  notes: 'Exact street must never leak',
  isForTrade: true,
  isForSale: true,
  askingPriceAgorot: 15000,
  photoPaths: ['listings/l1/0.jpg'],
  hasPhotos: true,
  status: 'active',
  location: { lat: 32.08, lng: 34.78, geohash: 'sv8wr', areaName: 'Tel Aviv', cityId: '5000' },
  createdAt: at(1_700_000_000_000),
  updatedAt: at(1_700_000_000_000),
};

describe('toListingRecord', () => {
  it('indexes an active listing at area level with what search filters and ranks on', () => {
    const record = toListingRecord('l1', LISTING);
    expect(record).toEqual({
      objectID: 'l1',
      userId: 'u1',
      igdbGameId: 119133,
      gameTitle: 'Elden Ring',
      platform: 'ps5',
      coverImageId: 'co4jni',
      condition: 'like_new',
      isForTrade: true,
      isForSale: true,
      askingPriceAgorot: 15000,
      hasPhotos: true,
      areaName: 'Tel Aviv',
      cityId: '5000',
      _geoloc: { lat: 32.08, lng: 34.78 },
      createdAtMs: 1_700_000_000_000,
    });
    expect(listingRecordSchema.safeParse(record).success).toBe(true);
  });

  it('keeps every other status out of search', () => {
    for (const status of ['draft', 'paused', 'reserved', 'traded', 'sold', 'removed'] as const) {
      expect(toListingRecord('l1', { ...LISTING, status })).toBeNull();
    }
  });

  it('leaves out optional fields that are not set', () => {
    const record = toListingRecord('l1', {
      ...LISTING,
      coverImageId: undefined,
      askingPriceAgorot: undefined,
      isForSale: false,
      location: { lat: 32, lng: 34.8, geohash: 'sv8', areaName: 'Holon' },
    });
    expect(record).not.toHaveProperty('coverImageId');
    expect(record).not.toHaveProperty('askingPriceAgorot');
    expect(record).not.toHaveProperty('cityId');
  });
});

describe('listingFilters', () => {
  it('is empty with no filters', () => {
    expect(listingFilters({})).toBe('');
  });

  it('combines platform, trade/sale and conditions', () => {
    expect(listingFilters({ platform: 'switch', mode: 'trade', conditions: ['new_sealed'] })).toBe(
      'platform:switch AND isForTrade:true AND condition:new_sealed',
    );
    expect(listingFilters({ mode: 'sale', conditions: ['like_new', 'good'] })).toBe(
      'isForSale:true AND (condition:like_new OR condition:good)',
    );
  });

  it('makes a price range match only listings for sale, open-ended on either side', () => {
    expect(listingFilters({ minPriceAgorot: 5000 })).toBe(
      `isForSale:true AND askingPriceAgorot:5000 TO ${Number.MAX_SAFE_INTEGER}`,
    );
    expect(listingFilters({ mode: 'sale', maxPriceAgorot: 20000 })).toBe(
      'isForSale:true AND askingPriceAgorot:0 TO 20000',
    );
  });

  it('excludes users by quoted ID, capped', () => {
    expect(listingFilters({ excludeUserIds: ['me', 'bad"id'] })).toBe(
      'NOT userId:"me" AND NOT userId:"badid"',
    );
    const many = Array.from({ length: MAX_EXCLUDED_USERS + 5 }, (_, i) => `u${i}`);
    expect(listingFilters({ excludeUserIds: many }).split(' AND ')).toHaveLength(
      MAX_EXCLUDED_USERS,
    );
  });
});
