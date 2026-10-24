import * as Location from 'expo-location';

import { distanceKm, nearestCity, searchCities, type City } from '@weloot/shared';

// Device location and geocoding, all on the device (Android/iOS platform geocoders via expo-location): no address
// is sent to a third-party API by the app.

/** The user declined location permission (or it's turned off): offer choosing a city instead. */
export class LocationUnavailable extends Error {
  constructor() {
    super('Location unavailable');
    this.name = 'LocationUnavailable';
  }
}

export type Point = { lat: number; lng: number };

const inIsrael = (p: Point) => p.lat >= 29 && p.lat <= 34 && p.lng >= 34 && p.lng <= 36;

/** Asks for foreground permission once, then returns the device position. */
export async function getDevicePosition(): Promise<Point> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) throw new LocationUnavailable();
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    // Location services off, or no fix.
    throw new LocationUnavailable();
  }
}

/**
 * The CBS locality of a point: the geocoder's city name when it matches a locality nearby (both languages),
 * otherwise the nearest locality center.
 */
export function localityFor(point: Point, geocodedCity?: string | null): City {
  if (geocodedCity) {
    const candidates = [...searchCities(geocodedCity, 'he'), ...searchCities(geocodedCity, 'en')];
    const match = candidates.find((city) => distanceKm(point, city) < 15);
    if (match) return match;
  }
  return nearestCity(point.lat, point.lng);
}

/** A readable address ("Dizengoff 50, Tel Aviv") and the locality of a point. */
export async function describePoint(point: Point): Promise<{ address: string; city: City }> {
  const places = await Location.reverseGeocodeAsync({
    latitude: point.lat,
    longitude: point.lng,
  }).catch(() => []);
  const place = places[0];
  const city = localityFor(point, place?.city ?? place?.subregion);
  const street = [place?.street, place?.streetNumber].filter(Boolean).join(' ');
  const address = [street, place?.city ?? city.he].filter(Boolean).join(', ');
  return { address, city };
}

/** Finds a typed address in Israel; null when nothing (in Israel) matches. */
export async function findAddress(text: string): Promise<Point | null> {
  const query = /israel|ישראל/i.test(text) ? text : `${text}, Israel`;
  const hits = await Location.geocodeAsync(query).catch(() => []);
  const hit = hits.map((h) => ({ lat: h.latitude, lng: h.longitude })).find(inIsrael);
  return hit ?? null;
}
