import { CITIES, cityGeo, findCity, searchCities } from './cities';
import { CITY_GEOHASH_PRECISION, encodeGeohash } from './geo';
import { cityIdSchema, geoSchema } from './schemas';

describe('encodeGeohash', () => {
  it('matches known geohashes', () => {
    // Reference values from the original geohash specification and common implementations.
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(encodeGeohash(42.6, -5.6, 5)).toBe('ezs42');
  });

  it('uses city-level precision by default', () => {
    expect(encodeGeohash(32.085, 34.782)).toHaveLength(CITY_GEOHASH_PRECISION);
  });

  it.each([
    [91, 0, 5],
    [0, 181, 5],
    [Number.NaN, 0, 5],
    [0, 0, 0],
    [0, 0, 13],
    [0, 0, 2.5],
  ])('rejects invalid input (%p, %p, %p)', (lat, lng, precision) => {
    expect(() => encodeGeohash(lat, lng, precision)).toThrow(RangeError);
  });
});

describe('CITIES', () => {
  it('has unique, schema-valid ids and Israel-bounded coordinates', () => {
    const ids = CITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const city of CITIES) {
      expect(cityIdSchema.safeParse(city.id).success).toBe(true);
      expect(geoSchema.safeParse(cityGeo(city)).success).toBe(true);
      expect(city.he.trim()).not.toBe('');
      expect(city.en.trim()).not.toBe('');
    }
  });

  it('finds a city by id', () => {
    expect(findCity('haifa')?.en).toBe('Haifa');
    expect(findCity('atlantis')).toBeUndefined();
  });
});

describe('searchCities', () => {
  it('matches English ignoring case and punctuation', () => {
    expect(searchCities('raanana', 'en').map((c) => c.id)).toEqual(['raanana']);
    expect(searchCities('TEL AVIV', 'en').map((c) => c.id)).toContain('tel-aviv');
  });

  it('matches Hebrew, including the short "קרית" spelling', () => {
    expect(searchCities('חיפה', 'he').map((c) => c.id)).toEqual(['haifa']);
    expect(searchCities('קרית ים', 'he').map((c) => c.id)).toEqual(['kiryat-yam']);
  });

  it('returns every city, alphabetically, for an empty query', () => {
    const en = searchCities('', 'en');
    expect(en).toHaveLength(CITIES.length);
    expect(en[0]?.en).toBe('Acre');
    expect(searchCities('', 'he')[0]?.he.startsWith('א')).toBe(true);
  });
});
