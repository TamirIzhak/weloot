import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView } from 'react-native';

import { MAX_SAVED_LOCATIONS } from '@weloot/shared';

import { Button, EmptyState, ErrorState } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { SavedLocationList } from '@/features/location/SavedLocationList';
import { useSavedLocations } from '@/features/location/savedLocations';
import { colors } from '@/theme/tokens';

/** Settings → Saved addresses (PRD W2, §9-D): the owner's addresses for posting; edit, delete or add one. */
export default function SavedAddressesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const uid = auth.status === 'signedIn' ? auth.user.uid : undefined;
  const saved = useSavedLocations(uid);

  if (!uid) return <Redirect href="/" />;
  const edit = (id: string) => router.push({ pathname: '/addresses/[id]', params: { id } });

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="gap-4 px-4 py-4">
      <Stack.Screen options={{ title: t('settings.account.addresses') }} />
      {saved.status === 'loading' ? <ActivityIndicator color={colors.primary} /> : null}
      {saved.status === 'error' ? <ErrorState title={t('location.errors.loadFailed')} /> : null}
      {saved.status === 'ready' && saved.items.length === 0 ? (
        <EmptyState title={t('settings.addresses.emptyTitle')} body={t('location.picker.empty')} />
      ) : null}
      {saved.status === 'ready' && saved.items.length > 0 ? (
        <SavedLocationList
          items={saved.items}
          onSelect={(item) => edit(item.id)}
          onEdit={(item) => edit(item.id)}
        />
      ) : null}
      {saved.status === 'ready' && saved.items.length < MAX_SAVED_LOCATIONS ? (
        <Button
          variant="secondary"
          fullWidth
          label={t('location.picker.add')}
          icon={<Ionicons name="add" size={20} color={colors['text-primary']} />}
          onPress={() => router.push('/addresses/new')}
          testID="add-address"
        />
      ) : null}
    </ScrollView>
  );
}
