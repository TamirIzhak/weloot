import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { FEED_KINDS, type FeedKind } from '@/features/home/feeds';
import { FeedScreen } from '@/features/home/FeedScreen';

const TITLE_KEY: Record<FeedKind, string> = {
  perfect: 'home.perfect.title',
  wanted: 'home.wanted.title',
  new: 'home.new.title',
};

/** Home → See all (#22). */
export default function Feed() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ kind: string }>();
  const kind: FeedKind = FEED_KINDS.includes(params.kind as FeedKind)
    ? (params.kind as FeedKind)
    : 'new';
  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: t(TITLE_KEY[kind]) }} />
      <FeedScreen kind={kind} />
    </View>
  );
}
