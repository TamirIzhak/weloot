import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { PLATFORMS } from '@weloot/shared';

import { Button, Card, EmptyState, Text } from '@/components';
import { useAddDraft } from '@/features/listings/addDraft';

/** Add flow, next steps (location, details, publish): built in #16. Shows what was identified so far. */
export default function AddDetails() {
  const { t } = useTranslation();
  const router = useRouter();
  const game = useAddDraft((s) => s.game);
  const platform = useAddDraft((s) => s.platform);
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-4 px-4 py-4"
      testID="add-details"
    >
      <Stack.Screen options={{ title: t('listings.details.title') }} />
      {game && platform ? (
        <Card className="gap-1 p-4">
          <Text variant="subheading">{game.title}</Text>
          <Text tone="secondary">{PLATFORMS[platform].label}</Text>
        </Card>
      ) : null}
      <EmptyState title={t('listings.details.soonTitle')} body={t('listings.details.soonBody')} />
      <Button variant="secondary" label={t('common.back')} onPress={() => router.back()} />
    </ScrollView>
  );
}
