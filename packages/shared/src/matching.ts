import type { PlatformKey } from './enums';
import { distanceKm } from './geo';

// Matching (PRD W3): who has what you want, and who also wants what you have. Pure, so the Cloud Functions that
// keep `matches/{userId}/items/{otherUserId}` up to date and their tests share one definition.

/** A want list item as matching sees it: a game on one console, or on any (`platform` unset). */
export type MatchWant = { igdbGameId: number; platform?: PlatformKey };

/** An active listing as matching sees it. */
export type MatchListing = {
  id: string;
  igdbGameId: number;
  platform: PlatformKey;
  hasPhotos: boolean;
  lat: number;
  lng: number;
};

/** One side's view of a match: what the other user has for me, what I have for them. */
export type MatchResult = {
  theirListingIds: string[];
  myListingIds: string[];
  /** Both sides have something the other wants. */
  perfect: boolean;
  score: number;
  /** Closest pair of listings between the two users, when both have one involved. */
  distanceKm?: number;
};

/** Whether a listing is something a want list item asks for (same game; same console unless "any"). */
export function wantsListing(want: MatchWant, listing: MatchListing): boolean {
  return (
    want.igdbGameId === listing.igdbGameId &&
    (want.platform === undefined || want.platform === listing.platform)
  );
}

function wanted(listings: readonly MatchListing[], wants: readonly MatchWant[]): MatchListing[] {
  return listings.filter((listing) => wants.some((want) => wantsListing(want, listing)));
}

function closest(a: readonly MatchListing[], b: readonly MatchListing[]): number | undefined {
  let best: number | undefined;
  for (const x of a) {
    for (const y of b) {
      const d = distanceKm(x, y);
      if (best === undefined || d < best) best = d;
    }
  }
  return best === undefined ? undefined : Math.round(best * 10) / 10;
}

/**
 * Ranking (PRD W3: more mutual games + shorter distance + photos = higher). A perfect match always outranks a
 * one-way one; counts are capped so one huge collection doesn't drown everything else.
 */
export function matchScore(input: {
  perfect: boolean;
  theirCount: number;
  myCount: number;
  theirPhotos: boolean;
  distanceKm?: number;
}): number {
  const distancePenalty = Math.min(input.distanceKm ?? 0, 50) / 5;
  return (
    (input.perfect ? 100 : 0) +
    10 * Math.min(input.theirCount, 5) +
    5 * Math.min(input.myCount, 5) +
    (input.theirPhotos ? 5 : 0) -
    distancePenalty
  );
}

function sideOf(
  theirs: MatchListing[],
  mine: MatchListing[],
  allMine: readonly MatchListing[],
): MatchResult | null {
  // Only "they have something I want" makes a match for me (one-way); "I have something they want" alone is a
  // match for them.
  if (theirs.length === 0) return null;
  const perfect = mine.length > 0;
  const distance = closest(theirs, perfect ? mine : allMine);
  return {
    theirListingIds: theirs.map((l) => l.id).sort(),
    myListingIds: mine.map((l) => l.id).sort(),
    perfect,
    score: matchScore({
      perfect,
      theirCount: theirs.length,
      myCount: mine.length,
      theirPhotos: theirs.some((l) => l.hasPhotos),
      ...(distance !== undefined ? { distanceKm: distance } : {}),
    }),
    ...(distance !== undefined ? { distanceKm: distance } : {}),
  };
}

/**
 * The match between two users from both sides, from their want lists and **active** listings only (callers pass
 * nothing else). `forA` is what A sees about B (null = no match for A), `forB` the other way round.
 */
export function computeMatch(input: {
  aWants: readonly MatchWant[];
  bWants: readonly MatchWant[];
  aListings: readonly MatchListing[];
  bListings: readonly MatchListing[];
}): { forA: MatchResult | null; forB: MatchResult | null } {
  const bHasForA = wanted(input.bListings, input.aWants);
  const aHasForB = wanted(input.aListings, input.bWants);
  return {
    forA: sideOf(bHasForA, aHasForB, input.aListings),
    forB: sideOf(aHasForB, bHasForA, input.bListings),
  };
}
