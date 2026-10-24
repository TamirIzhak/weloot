import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip, Input, Text } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { currentLanguage } from '@/i18n';
import { colors } from '@/theme/tokens';

import {
  describePoint,
  findAddress,
  getDevicePosition,
  LocationUnavailable,
} from './deviceLocation';
import { areaNameOf } from './SavedLocationList';
import {
  addSavedLocation,
  deleteSavedLocation,
  SavedLocationError,
  updateSavedLocation,
  useSavedLocations,
  type SavedLocationWithId,
} from './savedLocations';

type Preset = 'home' | 'work' | 'other';
type Found = { lat: number; lng: number; cityId: string; areaName: string };

/**
 * Add or edit a saved address (PRD W2, like Wolt): "Use my current location" or type an address, pick a label, and
 * see the area others will see (never the address itself). Opened as a modal from the location pickers.
 */
export function AddressFormScreen({ id }: { id?: string }) {
  const auth = useAuth();
  const uid = auth.status === 'signedIn' ? auth.user.uid : undefined;
  const saved = useSavedLocations(uid);

  if (!uid) return <Redirect href="/" />;
  if (id && saved.status === 'loading') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }
  const items = saved.status === 'ready' ? saved.items : [];
  const existing = id ? items.find((item) => item.id === id) : undefined;
  if (id && !existing) return <Redirect href="/" />;
  return <AddressForm uid={uid} existing={existing} count={items.length} />;
}

function AddressForm({
  uid,
  existing,
  count,
}: {
  uid: string;
  existing?: SavedLocationWithId;
  count: number;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const language = currentLanguage();
  const presets: Record<Preset, string> = {
    home: t('location.form.home'),
    work: t('location.form.work'),
    other: t('location.form.other'),
  };
  const initialPreset = existing
    ? ((Object.keys(presets) as Preset[]).find((p) => presets[p] === existing.label) ?? 'other')
    : count === 0
      ? 'home'
      : 'other';
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [customLabel, setCustomLabel] = useState(
    existing && initialPreset === 'other' ? existing.label : '',
  );
  const [address, setAddress] = useState(existing?.address ?? '');
  const [found, setFound] = useState<Found | null>(
    existing
      ? {
          lat: existing.lat,
          lng: existing.lng,
          cityId: existing.cityId ?? '',
          areaName: existing.areaName,
        }
      : null,
  );
  const [busy, setBusy] = useState<'locating' | 'finding' | 'saving' | 'deleting' | null>(null);
  const [error, setError] = useState<string | undefined>();

  const label = preset === 'other' ? customLabel.trim() : presets[preset];
  const canSave = found !== null && address.trim() !== '' && label !== '' && busy === null;

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind);
    setError(undefined);
    try {
      await task();
    } catch (e) {
      setError(
        t(
          e instanceof LocationUnavailable
            ? 'location.errors.unavailable'
            : e instanceof SavedLocationError && e.reason === 'tooMany'
              ? 'location.errors.tooMany'
              : 'location.errors.generic',
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const fillFromDevice = () =>
    run('locating', async () => {
      const point = await getDevicePosition();
      const { address: text, city } = await describePoint(point);
      setAddress(text);
      setFound({ ...point, cityId: city.id, areaName: city[language] });
    });

  const find = () =>
    run('finding', async () => {
      const point = await findAddress(address.trim());
      if (!point) {
        setFound(null);
        setError(t('location.errors.notFound'));
        return;
      }
      const { city } = await describePoint(point);
      setFound({ ...point, cityId: city.id, areaName: city[language] });
    });

  const save = () =>
    run('saving', async () => {
      if (!found) return;
      const input = {
        label,
        address: address.trim(),
        lat: found.lat,
        lng: found.lng,
        areaName: found.areaName,
        ...(found.cityId ? { cityId: found.cityId } : {}),
      };
      if (existing) await updateSavedLocation(uid, existing.id, input);
      else await addSavedLocation(uid, input, count);
      router.back();
    });

  const remove = () =>
    run('deleting', async () => {
      if (!existing) return;
      await deleteSavedLocation(uid, existing.id);
      router.back();
    });

  return (
    <SafeAreaView className="flex-1 bg-bg" testID="address-form">
      <View className="flex-row justify-end px-4 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth.close')}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="close" size={28} color={colors['text-secondary']} />
        </Pressable>
      </View>
      <ScrollView contentContainerClassName="gap-6 px-6 pb-10" keyboardShouldPersistTaps="handled">
        <View className="gap-2">
          <Text variant="title">
            {t(existing ? 'location.form.editTitle' : 'location.form.addTitle')}
          </Text>
          <Text tone="secondary">{t('location.form.subtitle')}</Text>
        </View>

        <View className="gap-2">
          <Text variant="label" tone="secondary">
            {t('location.form.labelTitle')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(Object.keys(presets) as Preset[]).map((p) => (
              <Chip
                key={p}
                label={presets[p]}
                selected={preset === p}
                onPress={() => setPreset(p)}
                testID={`label-${p}`}
              />
            ))}
          </View>
          {preset === 'other' ? (
            <Input
              label={t('location.form.customLabel')}
              placeholder={t('location.form.customLabelPlaceholder')}
              value={customLabel}
              onChangeText={setCustomLabel}
              maxLength={30}
              testID="custom-label-input"
            />
          ) : null}
        </View>

        <View className="gap-3">
          <Button
            variant="secondary"
            fullWidth
            label={t('location.useCurrent')}
            icon={<Ionicons name="navigate-outline" size={18} color={colors['text-primary']} />}
            loading={busy === 'locating'}
            disabled={busy !== null && busy !== 'locating'}
            onPress={() => void fillFromDevice()}
            testID="address-use-current"
          />
          <Input
            label={t('location.form.addressLabel')}
            placeholder={t('location.form.addressPlaceholder')}
            value={address}
            onChangeText={(value) => {
              setAddress(value);
              setFound(null);
            }}
            onSubmitEditing={() => void find()}
            returnKeyType="search"
            maxLength={200}
            testID="address-input"
          />
          <Button
            variant="ghost"
            label={t('location.form.find')}
            loading={busy === 'finding'}
            disabled={address.trim() === '' || (busy !== null && busy !== 'finding')}
            onPress={() => void find()}
            testID="find-address"
          />
        </View>

        {found ? (
          <Card className="gap-1 p-4" testID="area-preview">
            <Text variant="label">{t('location.form.preview', { area: areaNameOf(found) })}</Text>
            <Text variant="caption" tone="muted">
              {t('location.form.previewHint')}
            </Text>
          </Card>
        ) : null}

        {error ? (
          <Text tone="danger" accessibilityLiveRegion="polite" testID="address-error">
            {error}
          </Text>
        ) : null}

        <Button
          size="lg"
          fullWidth
          label={t('location.form.save')}
          loading={busy === 'saving'}
          disabled={!canSave}
          onPress={() => void save()}
          testID="save-address"
        />
        {existing ? (
          <Button
            variant="danger"
            fullWidth
            label={t('location.form.delete')}
            loading={busy === 'deleting'}
            disabled={busy !== null && busy !== 'deleting'}
            onPress={() => void remove()}
            testID="delete-address"
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
