import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, SectionList, View } from 'react-native';

import { EmptyState, Text } from '@/components';
import { coverUrl } from '@/features/catalog/igdbImages';
import { useMyConversations, type Conversation } from '@/features/offers/offersApi';
import { usePublicProfile } from '@/features/profile/usePublicProfile';
import { currentLanguage, formatNumber } from '@/i18n';
import { useTabBarInset } from '@/navigation/TabBarVisibility';
import { colors } from '@/theme/tokens';

import { groupConversations, groupOf } from './groups';

/** Inbox (PRD §9-B4, #26): conversations grouped Needs action / Active deals / Chats / Completed, with unread counts. */
export function InboxScreen({ me }: { me: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const bottomInset = useTabBarInset();
  const conversations = useMyConversations(me);

  if (conversations === null) {
    return <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />;
  }
  if (conversations.length === 0) {
    return (
      <EmptyState
        title={t('inbox.emptyTitle')}
        body={t('inbox.emptyBody')}
        primaryAction={{ label: t('inbox.findGames'), onPress: () => router.push('/search') }}
        className="m-4"
        testID="inbox-empty"
      />
    );
  }
  return (
    <SectionList
      sections={groupConversations(conversations, me)}
      keyExtractor={(c) => c.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      renderSectionHeader={({ section }) => (
        <Text
          variant="label"
          tone="secondary"
          className="px-4 pb-1 pt-4"
          testID={`inbox-group-${section.group}`}
        >
          {t(`inbox.groups.${section.group}`)}
        </Text>
      )}
      renderItem={({ item }) => (
        <Row
          conversation={item}
          me={me}
          onPress={() => router.push({ pathname: '/conversations/[id]', params: { id: item.id } })}
        />
      )}
      testID="inbox"
    />
  );
}

function Row({
  conversation,
  me,
  onPress,
}: {
  conversation: Conversation;
  me: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const other = conversation.participants.find((p) => p !== me) ?? '';
  const profile = usePublicProfile(other);
  const name = profile.status === 'ready' ? profile.profile.username : t('chat.someone');
  const unread = conversation.unread[me] ?? 0;
  const group = groupOf(conversation, me);
  const line =
    group === 'needsAction'
      ? t(conversation.pendingOfferTo === me ? 'inbox.line.answerOffer' : 'inbox.line.confirmSwap')
      : conversation.lastMessagePreview || t(`inbox.line.${group}`);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('inbox.rowLabel', {
        name,
        game: conversation.listingTitle ?? t('inbox.aGame'),
        unread: formatNumber(unread, language),
      })}
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-surface"
      testID={`inbox-row-${conversation.id}`}
    >
      <View className="h-14 w-10 overflow-hidden rounded-button bg-surface-raised">
        {conversation.listingCoverImageId ? (
          <Image
            source={coverUrl(conversation.listingCoverImageId, 'cover_small')}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
        ) : null}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className={unread > 0 ? 'font-semibold' : 'font-medium'} numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {conversation.listingTitle ?? t('inbox.aGame')}
        </Text>
        <Text
          variant="caption"
          tone={group === 'needsAction' ? 'accent' : 'muted'}
          numberOfLines={1}
        >
          {line}
        </Text>
      </View>
      {unread > 0 ? (
        <View
          className="min-w-6 items-center rounded-chip bg-primary px-1.5 py-0.5"
          testID={`inbox-unread-${conversation.id}`}
        >
          <Text variant="caption" className="font-semibold text-on-primary">
            {formatNumber(unread, language)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
