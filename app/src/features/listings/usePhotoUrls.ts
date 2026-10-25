import { useEffect, useState } from 'react';

import { photoUrl } from './photos';

/**
 * Download URLs for a listing's photos, in order (Storage Rules: readable while the listing is active). A photo
 * that can't be loaded is left out rather than failing the whole gallery.
 */
export function usePhotoUrls(paths: readonly string[]): string[] {
  const key = paths.join('|');
  const [result, setResult] = useState<{ key: string; urls: string[] } | null>(null);

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    void Promise.all(key.split('|').map((path) => photoUrl(path).catch(() => null))).then(
      (urls) => {
        if (!cancelled) setResult({ key, urls: urls.filter((url): url is string => url !== null) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return result?.key === key ? result.urls : [];
}
