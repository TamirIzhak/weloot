import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Badge, Button, ErrorState, Text } from '@/components';
import { colors } from '@/theme/tokens';

import {
  deletePhoto,
  freeSlot,
  MAX_PHOTOS,
  photoPath,
  photoUrl,
  preparePhoto,
  uploadPhoto,
} from './photos';
import { useListing } from './useListing';

type Upload = { fileUri: string; progress: number; failed: boolean; done: boolean };

/**
 * Add or remove a listing's photos (PRD W2 step 4, optional): camera or gallery, up to 6, each resized and
 * re-encoded without EXIF, uploaded with progress and a retry. Listings with photos get the "Real photos" badge.
 */
export function PhotosScreen({ listingId, onDone }: { listingId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const listing = useListing(listingId);
  const [uploads, setUploads] = useState<Record<number, Upload>>({});
  const [error, setError] = useState<string | undefined>();

  const stored = listing.status === 'ready' ? listing.listing.photoPaths : [];
  // A finished upload stays visible until the listing (updated by a function) lists its path.
  const pendingAt = (slot: number) => {
    const entry = uploads[slot];
    return entry && !(entry.done && stored.includes(photoPath(listingId, slot)))
      ? entry
      : undefined;
  };

  if (listing.status === 'loading') return <ActivityIndicator color={colors.primary} />;
  if (listing.status !== 'ready') return <ErrorState title={t('listings.photos.loadFailed')} />;

  const usedPaths = [
    ...new Set([
      ...stored,
      ...Object.keys(uploads).map((slot) => photoPath(listingId, Number(slot))),
    ]),
  ];
  const remaining = MAX_PHOTOS - usedPaths.length;

  const upload = async (slot: number, fileUri: string) => {
    setUploads((u) => ({ ...u, [slot]: { fileUri, progress: 0, failed: false, done: false } }));
    try {
      await uploadPhoto(listingId, slot, fileUri, (progress) =>
        setUploads((u) => (u[slot] ? { ...u, [slot]: { ...u[slot], progress } } : u)),
      );
      setUploads((u) => ({ ...u, [slot]: { fileUri, progress: 1, failed: false, done: true } }));
    } catch {
      setUploads((u) => ({ ...u, [slot]: { fileUri, progress: 0, failed: true, done: false } }));
    }
  };

  const add = async (source: 'camera' | 'library') => {
    setError(undefined);
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(t('listings.photos.permissionDenied'));
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
      allowsMultipleSelection: source === 'library',
      selectionLimit: remaining,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const taken = [...usedPaths];
    for (const asset of result.assets) {
      const slot = freeSlot(taken);
      if (slot === null) break;
      taken.push(photoPath(listingId, slot));
      try {
        const fileUri = await preparePhoto(asset.uri, asset.width, asset.height);
        void upload(slot, fileUri);
      } catch {
        setError(t('listings.photos.prepareFailed'));
      }
    }
  };

  const remove = async (slot: number, path: string) => {
    setUploads((u) => {
      const next = { ...u };
      delete next[slot];
      return next;
    });
    try {
      await deletePhoto(path);
    } catch {
      setError(t('listings.photos.deleteFailed'));
    }
  };

  return (
    <View className="gap-5" testID="photos-screen">
      <View className="gap-2">
        <Text variant="title">{t('listings.photos.title')}</Text>
        <Text tone="secondary">{t('listings.photos.body')}</Text>
        {stored.length > 0 ? <Badge tone="accent" label={t('listings.photos.badge')} /> : null}
      </View>

      <View className="flex-row flex-wrap gap-3">
        {Array.from({ length: MAX_PHOTOS }, (_, slot) => {
          const path = photoPath(listingId, slot);
          const pending = pendingAt(slot);
          if (pending) {
            return (
              <View
                key={slot}
                className="h-28 w-28 overflow-hidden rounded-card bg-surface"
                testID={`photo-uploading-${slot}`}
              >
                <Image
                  source={pending.fileUri}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
                <View className="absolute inset-x-0 bottom-0 h-1.5 bg-surface-raised">
                  <View
                    className="h-full bg-primary"
                    style={{ width: `${Math.round(pending.progress * 100)}%` }}
                  />
                </View>
                {pending.failed ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('listings.photos.retry')}
                    onPress={() => void upload(slot, pending.fileUri)}
                    className="absolute inset-0 items-center justify-center bg-bg/70"
                    testID={`photo-retry-${slot}`}
                  >
                    <Ionicons name="refresh" size={28} color={colors.danger} />
                  </Pressable>
                ) : null}
              </View>
            );
          }
          if (stored.includes(path)) {
            return (
              <View
                key={slot}
                className="h-28 w-28 overflow-hidden rounded-card bg-surface"
                testID={`photo-${slot}`}
              >
                <RemotePhoto path={path} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('listings.photos.remove')}
                  onPress={() => void remove(slot, path)}
                  hitSlop={8}
                  className="absolute end-1 top-1 rounded-full bg-bg/80 p-1"
                  testID={`photo-remove-${slot}`}
                >
                  <Ionicons name="close" size={16} color={colors['text-primary']} />
                </Pressable>
              </View>
            );
          }
          return (
            <View
              key={slot}
              className="h-28 w-28 items-center justify-center rounded-card border border-dashed border-border"
            >
              <Ionicons name="image-outline" size={24} color={colors['text-muted']} />
            </View>
          );
        })}
      </View>

      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite" testID="photos-error">
          {error}
        </Text>
      ) : null}

      <View className="gap-3">
        <Button
          variant="secondary"
          fullWidth
          label={t('listings.photos.camera')}
          icon={<Ionicons name="camera-outline" size={20} color={colors['text-primary']} />}
          disabled={remaining <= 0}
          onPress={() => void add('camera')}
          testID="photos-camera"
        />
        <Button
          variant="secondary"
          fullWidth
          label={t('listings.photos.library')}
          icon={<Ionicons name="images-outline" size={20} color={colors['text-primary']} />}
          disabled={remaining <= 0}
          onPress={() => void add('library')}
          testID="photos-library"
        />
        <Button
          size="lg"
          fullWidth
          label={t('listings.photos.done')}
          onPress={onDone}
          testID="photos-done"
        />
      </View>
    </View>
  );
}

function RemotePhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    photoUrl(path).then(
      (u) => !cancelled && setUrl(u),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url ? (
    <Image source={url} style={{ width: '100%', height: '100%' }} contentFit="cover" />
  ) : (
    <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />
  );
}
