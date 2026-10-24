import { CITY_ROWS } from './cities.data';
import { distanceKm, encodeGeohash } from './geo';

// Israeli localities users pick as their location (PRD W1): every locality in the Central Bureau of Statistics
// list, generated from data.gov.il by scripts/build-cities.mjs. Coordinates are the locality's center; they name
// the area of a listing and serve as a browsing location (PRD W1, W2). Ids are the official CBS locality codes,
// which are stable, so listings and saved addresses can store them.

export type City = {
  /** CBS locality code, e.g. "4000" for Haifa. */
  id: string;
  he: string;
  en: string;
  lat: number;
  lng: number;
};

/** Every locality, most residents first. */
export const CITIES: readonly City[] = CITY_ROWS.map(([id, he, en, lat, lng]) => ({
  id,
  he,
  en,
  lat,
  lng,
}));

const BY_ID = new Map(CITIES.map((city) => [city.id, city]));

export function findCity(id: string): City | undefined {
  return BY_ID.get(id);
}

/** The locality closest to a point (to name the area of a GPS location or a typed address). */
export function nearestCity(lat: number, lng: number): City {
  let best = CITIES[0];
  let bestKm = Infinity;
  for (const city of CITIES) {
    const km = distanceKm({ lat, lng }, city);
    if (km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  if (!best) throw new Error('The city list is empty');
  return best;
}

/** A locality's center as a `geo` point (e.g. the browsing location when the user picks a city). */
export function cityGeo(city: City): { lat: number; lng: number; geohash: string } {
  return { lat: city.lat, lng: city.lng, geohash: encodeGeohash(city.lat, city.lng) };
}

/**
 * Folds the spellings people type into one form: case, spaces and punctuation don't matter; in Hebrew "קרית" and
 * "קריית" match; in English, transliteration variants match ("kiryat"/"qiryat", "tikva"/"tiqwa", "beersheva").
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s'"`׳״\-–.,()]/g, '')
    .replace(/יי/g, 'י')
    .replace(/וו/g, 'ו')
    .replace(/q/g, 'k')
    .replace(/w/g, 'v')
    .replace(/(ts|tz)/g, 'z')
    .replace(/([a-z])\1+/g, '$1');
}

const INDEX = CITIES.map((city) => ({
  city,
  names: [normalize(city.he), normalize(city.en)],
  words: [...city.he.split(/[\s\-()]+/), ...city.en.split(/[\s\-()]+/)].map(normalize),
}));

/**
 * Cities matching a search in either language. Names that start with the query come first, then names with a word
 * that starts with it, then any other match; larger places first within each group. An empty query returns every
 * city in the given language's alphabetical order.
 */
export function searchCities(query: string, language: 'en' | 'he'): City[] {
  const q = normalize(query);
  if (q === '') {
    const collator = new Intl.Collator(language);
    return [...CITIES].sort((a, b) => collator.compare(a[language], b[language]));
  }
  const tiers: City[][] = [[], [], []];
  for (const { city, names, words } of INDEX) {
    if (names.some((n) => n.startsWith(q))) tiers[0]?.push(city);
    else if (words.some((w) => w.startsWith(q))) tiers[1]?.push(city);
    else if (names.some((n) => n.includes(q))) tiers[2]?.push(city);
  }
  return tiers.flat();
}
