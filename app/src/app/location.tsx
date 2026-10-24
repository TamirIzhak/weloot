import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { nearestCity } from '@weloot/shared';

import { Button, Text } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { useBrowsingLocation, type BrowsingLocation } from '@/features/location/browsingLocation';
import { CitySearch } from '@/features/location/CitySearch';
import {
  describePoint,
  getDevicePosition,
  LocationUnavailable,
} from '@/features/location/deviceLocation';
import { SavedLocationList } from '@/features/location/SavedLocationList';
import { useSavedLocations } from '@/features/location/savedLocations';
import { colors } from '@/theme/tokens';

/**
 * Browsing location picker (PRD W1), opened from the "Near: …" chip: the device location, a saved address
 * (signed-in users) or any locality. Stored on the device only, area-level.
 */
export default function BrowsingLocationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const uid = auth.status === 'signedIn' ? auth.user.uid : undefined;
  const saved = useSavedLocations(uid);
  const setLocation = useBrowsingLocation((s) => s.setLocation);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const choose = (location: BrowsingLocation) => {
    setLocation(location);
    router.back();
  };

  const locateDevice = async () => {
    setLocating(true);
    setError(undefined);
    try {
      const point = await getDevicePosition();
      const { city } = await describePoint(point);
      choose({ source: 'device', ...point, cityId: city.id });
    } catch (e) {
      setError(
        t(
          e instanceof LocationUnavailable
            ? 'location.errors.unavailable'
            : 'location.errors.generic',
        ),
      );
    } finally {
      setLocating(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" testID="browsing-location">
      <View className="flex-row justify-end px-4 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth.close')}
          onPress={() => router.back()}
          hitSlop={12}
          testID="close-location"
        >
          <Ionicons name="close" size={28} color={colors['text-secondary']} />
        </Pressable>
      </View>
      <ScrollView contentContainerClassName="gap-6 px-6 pb-10" keyboardShouldPersistTaps="handled">
        <View className="gap-2">
          <Text variant="title">{t('location.browse.title')}</Text>
          <Text tone="secondary">{t('location.browse.subtitle')}</Text>
        </View>

        <View className="gap-2">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            label={t('location.useCurrent')}
            icon={<Ionicons name="navigate-outline" size={20} color={colors['text-primary']} />}
            loading={locating}
            onPress={() => void locateDevice()}
            testID="use-current-location"
          />
          {error ? (
            <Text tone="danger" accessibilityLiveRegion="polite" testID="location-error">
              {error}
            </Text>
          ) : null}
        </View>

        {uid && saved.status === 'ready' && saved.items.length > 0 ? (
          <View className="gap-2">
            <Text variant="label" tone="secondary">
              {t('location.saved.title')}
            </Text>
            <SavedLocationList
              items={saved.items}
              onSelect={(item) =>
                choose({
                  source: 'saved',
                  lat: item.lat,
                  lng: item.lng,
                  cityId: item.cityId ?? nearestCity(item.lat, item.lng).id,
                  label: item.label,
                })
              }
              onEdit={(item) =>
                router.push({ pathname: '/addresses/[id]', params: { id: item.id } })
              }
            />
          </View>
        ) : null}

        <CitySearch
          label={t('location.browse.cityLabel')}
          onSelect={(city) =>
            choose({ source: 'city', lat: city.lat, lng: city.lng, cityId: city.id })
          }
          testID="browse-city"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
