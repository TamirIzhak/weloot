import { computeMatch, matchScore, wantsListing, type MatchListing } from './matching';

const TEL_AVIV = { lat: 32.08, lng: 34.78 };
const HAIFA = { lat: 32.79, lng: 34.99 };

const listing = (id: string, igdbGameId: number, overrides: Partial<MatchListing> = {}) => ({
  id,
  igdbGameId,
  platform: 'ps5' as const,
  hasPhotos: false,
  ...TEL_AVIV,
  ...overrides,
});

const ELDEN = 119133;
const ZELDA = 119388;
const FIFA = 252476;

describe('wantsListing', () => {
  it('matches the same game on the wanted console, or on any console', () => {
    expect(wantsListing({ igdbGameId: ELDEN, platform: 'ps5' }, listing('l', ELDEN))).toBe(true);
    expect(wantsListing({ igdbGameId: ELDEN }, listing('l', ELDEN, { platform: 'ps4' }))).toBe(
      true,
    );
    expect(wantsListing({ igdbGameId: ELDEN, platform: 'ps4' }, listing('l', ELDEN))).toBe(false);
    expect(wantsListing({ igdbGameId: ZELDA }, listing('l', ELDEN))).toBe(false);
  });
});

describe('computeMatch', () => {
  it('is nothing when neither has what the other wants', () => {
    expect(
      computeMatch({
        aWants: [{ igdbGameId: ZELDA }],
        bWants: [],
        aListings: [],
        bListings: [listing('b1', ELDEN)],
      }),
    ).toEqual({ forA: null, forB: null });
  });

  it('is one-way when B has what A wants: a match for A only', () => {
    const { forA, forB } = computeMatch({
      aWants: [{ igdbGameId: ELDEN, platform: 'ps5' }],
      bWants: [],
      aListings: [],
      bListings: [listing('b1', ELDEN), listing('b2', FIFA)],
    });
    expect(forA).toMatchObject({ theirListingIds: ['b1'], myListingIds: [], perfect: false });
    // A has no active listing, so there's no place to measure from.
    expect(forA).not.toHaveProperty('distanceKm');
    expect(forB).toBeNull();
  });

  it('is perfect when both have something the other wants (same console), for both', () => {
    const { forA, forB } = computeMatch({
      aWants: [{ igdbGameId: ELDEN, platform: 'ps5' }],
      bWants: [{ igdbGameId: ZELDA }],
      aListings: [listing('a1', ZELDA, { platform: 'switch', ...HAIFA })],
      bListings: [listing('b1', ELDEN)],
    });
    expect(forA).toMatchObject({ theirListingIds: ['b1'], myListingIds: ['a1'], perfect: true });
    expect(forB).toMatchObject({ theirListingIds: ['a1'], myListingIds: ['b1'], perfect: true });
    expect(forA?.distanceKm).toBeGreaterThan(70);
    expect(forA?.distanceKm).toBe(forB?.distanceKm);
  });

  it('is not perfect when the console is wrong', () => {
    const { forA, forB } = computeMatch({
      aWants: [{ igdbGameId: ELDEN, platform: 'ps4' }],
      bWants: [{ igdbGameId: ZELDA }],
      aListings: [listing('a1', ZELDA, { platform: 'switch' })],
      bListings: [listing('b1', ELDEN)],
    });
    expect(forA).toBeNull();
    expect(forB).toMatchObject({ perfect: false, theirListingIds: ['a1'] });
  });

  it('falls back to one-way when the other side’s listing goes (paused, reserved, closed)', () => {
    // Callers pass active listings only: a paused one is simply missing.
    const { forA, forB } = computeMatch({
      aWants: [{ igdbGameId: ELDEN }],
      bWants: [{ igdbGameId: ZELDA }],
      aListings: [],
      bListings: [listing('b1', ELDEN)],
    });
    expect(forA).toMatchObject({ perfect: false });
    expect(forB).toBeNull();
  });

  it('measures a one-way match from the closest listing the viewer has, even an unrelated one', () => {
    const { forA } = computeMatch({
      aWants: [{ igdbGameId: ELDEN }],
      bWants: [],
      aListings: [listing('a1', FIFA, HAIFA), listing('a2', FIFA, TEL_AVIV)],
      bListings: [listing('b1', ELDEN, TEL_AVIV)],
    });
    expect(forA?.distanceKm).toBe(0);
  });

  it('lists every matching listing, sorted', () => {
    const { forA } = computeMatch({
      aWants: [{ igdbGameId: ELDEN }, { igdbGameId: ZELDA }],
      bWants: [],
      aListings: [],
      bListings: [listing('b2', ZELDA), listing('b1', ELDEN), listing('b3', FIFA)],
    });
    expect(forA?.theirListingIds).toEqual(['b1', 'b2']);
  });
});

describe('matchScore', () => {
  const base = { perfect: false, theirCount: 1, myCount: 0, theirPhotos: false };

  it('ranks perfect over any one-way match', () => {
    expect(matchScore({ ...base, perfect: true, myCount: 1, distanceKm: 50 })).toBeGreaterThan(
      matchScore({ ...base, theirCount: 50, theirPhotos: true }),
    );
  });

  it('rewards more games and photos, penalizes distance (capped)', () => {
    expect(matchScore({ ...base, theirCount: 2 })).toBeGreaterThan(matchScore(base));
    expect(matchScore({ ...base, theirPhotos: true })).toBeGreaterThan(matchScore(base));
    expect(matchScore({ ...base, distanceKm: 5 })).toBeGreaterThan(
      matchScore({ ...base, distanceKm: 40 }),
    );
    expect(matchScore({ ...base, distanceKm: 300 })).toBe(matchScore({ ...base, distanceKm: 50 }));
  });
});
