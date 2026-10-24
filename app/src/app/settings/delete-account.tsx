import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { Button, Card, Text, useToast } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { deleteMyAccount } from '@/features/profile/deleteAccount';
import { colors } from '@/theme/tokens';

/** What deleting removes, and what stays (anonymized), so the user decides knowingly. */
const DELETED_ITEMS = ['profile', 'private', 'addresses', 'username'] as const;

/** Settings → Delete account (PRD W9, required by the app stores): explanation, confirmation, then deletion. */
export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const auth = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Signed out (e.g. right after deleting): nothing left to do here.
  if (auth.status !== 'signedIn' && !deleting) return <Redirect href="/" />;

  const remove = async () => {
    setDeleting(true);
    setError(undefined);
    try {
      await deleteMyAccount();
      toast.show(t('settings.delete.done'), 'success');
      router.replace('/');
    } catch {
      setError(t('settings.delete.failed'));
      setDeleting(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-6 px-4 py-4"
      testID="delete-account"
    >
      <Stack.Screen options={{ title: t('settings.delete.title') }} />
      <View className="gap-2">
        <Text variant="heading">{t('settings.delete.heading')}</Text>
        <Text tone="secondary">{t('settings.delete.body')}</Text>
      </View>
      <Card className="gap-3 p-4">
        {DELETED_ITEMS.map((item) => (
          <View key={item} className="flex-row items-start gap-3">
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text className="flex-1">{t(`settings.delete.items.${item}`)}</Text>
          </View>
        ))}
        <View className="flex-row items-start gap-3">
          <Ionicons name="eye-off-outline" size={18} color={colors['text-secondary']} />
          <Text className="flex-1" tone="secondary">
            {t('settings.delete.kept')}
          </Text>
        </View>
      </Card>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        onPress={() => setConfirmed((value) => !value)}
        className="flex-row items-start gap-3"
        hitSlop={8}
        testID="confirm-delete"
      >
        <Ionicons
          name={confirmed ? 'checkbox' : 'square-outline'}
          size={24}
          color={confirmed ? colors.danger : colors['text-secondary']}
        />
        <Text className="flex-1">{t('settings.delete.confirm')}</Text>
      </Pressable>
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite" testID="delete-error">
          {error}
        </Text>
      ) : null}
      <Button
        variant="danger"
        size="lg"
        fullWidth
        label={t('settings.delete.button')}
        loading={deleting}
        disabled={!confirmed}
        onPress={() => void remove()}
        testID="delete-account-button"
      />
    </ScrollView>
  );
}
