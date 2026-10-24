// Geohash encoding for city-level locations (PRD §8: `geo.geohash`, used for "near you" range queries).

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Precision 5 ≈ 4.9 km × 4.9 km: city level, never a precise home location (PRD §12). */
export const CITY_GEOHASH_PRECISION = 5;

/** Standard geohash of a point. Throws for invalid coordinates or precision. */
export function encodeGeohash(
  lat: number,
  lng: number,
  precision = CITY_GEOHASH_PRECISION,
): string {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90)
    throw new RangeError(`Invalid latitude: ${lat}`);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180)
    throw new RangeError(`Invalid longitude: ${lng}`);
  if (!Number.isInteger(precision) || precision < 1 || precision > 12) {
    throw new RangeError(`Invalid geohash precision: ${precision}`);
  }
  let [latMin, latMax, lngMin, lngMax] = [-90, 90, -180, 180];
  let hash = '';
  let bits = 0;
  let value = 0;
  let evenBit = true; // geohash interleaves bits starting with longitude
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        value = value * 2 + 1;
        lngMin = mid;
      } else {
        value *= 2;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        value = value * 2 + 1;
        latMin = mid;
      } else {
        value *= 2;
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    bits += 1;
    if (bits === 5) {
      hash += BASE32.charAt(value);
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

/**
 * Public locations are snapped to a grid of 0.01° (≈1.1 km north–south, ≈0.95 km east–west in Israel), so a listing
 * never reveals the exact address it was posted from (PRD W2, §12).
 */
export const AREA_GRID_DEGREES = 0.01;

const snap = (value: number) => Math.round(value / AREA_GRID_DEGREES) / (1 / AREA_GRID_DEGREES);

/** The area-level point (and its city-level geohash) for a precise location. */
export function snapToArea(
  lat: number,
  lng: number,
): { lat: number; lng: number; geohash: string } {
  const snappedLat = snap(lat);
  const snappedLng = snap(lng);
  return { lat: snappedLat, lng: snappedLng, geohash: encodeGeohash(snappedLat, snappedLng) };
}

const EARTH_RADIUS_KM = 6371;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometers (haversine). */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Search radius for a new user until they change it in Settings (PRD §9-D). */
export const DEFAULT_SEARCH_RADIUS_KM = 25;
