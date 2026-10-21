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
  it('covers every locality with unique, schema-valid ids and Israel-bounded coordinates', () => {
    expect(CITIES.length).toBeGreaterThan(1200);
    const ids = CITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const city of CITIES) {
      expect(cityIdSchema.safeParse(city.id).success).toBe(true);
      expect(geoSchema.safeParse(cityGeo(city)).success).toBe(true);
      expect(city.he.trim()).not.toBe('');
      expect(city.en.trim()).not.toBe('');
    }
  });

  it.each([
    // [CBS code, English name, known city-center latitude, longitude]
    ['3000', 'Jerusalem', 31.78, 35.21],
    ['5000', 'Tel Aviv - Yafo', 32.08, 34.78],
    ['4000', 'Haifa', 32.8, 34.99],
    ['2600', 'Eilat', 29.56, 34.95],
    ['43', 'Metula', 33.28, 35.58],
  ])('places %s (%s) correctly', (id, en, lat, lng) => {
    const city = findCity(id);
    expect(city?.en).toBe(en);
    expect(city?.lat).toBeCloseTo(lat, 1);
    expect(city?.lng).toBeCloseTo(lng, 1);
  });

  it('lists larger places first', () => {
    expect(CITIES[0]?.id).toBe('3000');
  });

  it('returns undefined for an unknown id', () => {
    expect(findCity('999999')).toBeUndefined();
  });
});

describe('searchCities', () => {
  const ids = (query: string, language: 'en' | 'he' = 'en') =>
    searchCities(query, language).map((c) => c.id);

  it('matches English ignoring case, spaces and punctuation', () => {
    expect(ids('raanana')[0]).toBe('8700');
    expect(ids('TEL AVIV')[0]).toBe('5000');
    expect(ids('beersheva')[0]).toBe('9000');
  });

  it('matches transliteration variants', () => {
    expect(ids('kiryat gat')[0]).toBe('2630');
    expect(ids('qiryat gat')[0]).toBe('2630');
    expect(ids('petah tiqwa')[0]).toBe('7900');
  });

  it('matches Hebrew, including the short "קרית" spelling', () => {
    expect(ids('חיפה', 'he')[0]).toBe('4000');
    expect(ids('קרית ים', 'he')[0]).toBe('9600');
  });

  it('ranks names that start with the query, then larger places, first', () => {
    // Many villages start with "באר"; Beer Sheva is the largest.
    expect(ids('באר', 'he')[0]).toBe('9000');
    // "Yam" starts a word in Bat Yam and Kiryat Yam, ahead of names that merely contain it.
    const yam = ids('yam');
    expect(yam.indexOf('6200')).toBeLessThan(yam.indexOf('9600'));
  });

  it('returns every city, alphabetically, for an empty query', () => {
    const en = searchCities('', 'en');
    expect(en).toHaveLength(CITIES.length);
    expect(en[0]?.en.localeCompare(en[1]?.en ?? '', 'en')).toBeLessThanOrEqual(0);
    expect(searchCities('', 'he')[0]?.he.startsWith('א')).toBe(true);
  });

  it('returns nothing for a place that does not exist', () => {
    expect(ids('atlantis')).toEqual([]);
  });
});
