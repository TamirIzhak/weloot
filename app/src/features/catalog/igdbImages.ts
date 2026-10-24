// IGDB image CDN (PRD §3.3): covers by image id. Sizes: https://api-docs.igdb.com/#images

export type CoverSize = 'cover_small' | 'cover_big' | '720p';

/** A cover URL; the `_2x` variants keep covers sharp on high-density screens. */
export function coverUrl(imageId: string, size: CoverSize = 'cover_big'): string {
  return `https://images.igdb.com/igdb/image/upload/t_${size}_2x/${imageId}.jpg`;
}
