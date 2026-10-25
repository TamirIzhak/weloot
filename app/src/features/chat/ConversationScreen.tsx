import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';

import { MESSAGE_TEXT_MAX, messageTargetId } from '@weloot/shared';

import { Card, cn, EmptyState, Text, useToast } from '@/components';
import {
  markConversationRead,
  OfferError,
  sendMessage,
  useConversation,
  type Conversation,
  type Offer,
} from '@/features/offers/offersApi';
import { useUserSettings } from '@/features/profile/settingsApi';
import { usePublicProfile } from '@/features/profile/usePublicProfile';
import { setBlocked } from '@/features/safety/blockApi';
import { currentLanguage } from '@/i18n';
import { colors } from '@/theme/tokens';

import { useMessages, useOffers, type Message } from './chatApi';
import { DealPanel } from './DealPanel';
import { OfferCard } from './OfferCard';

/**
 * A conversation (PRD W5, #25): live messages, offer cards with their actions, system messages in the reader's
 * language, the safety tips card and the deal header. Messages and offers go through Cloud Functions.
 */
export function ConversationScreen({ conversationId, me }: { conversationId: string; me: string }) {
  const { t } = useTranslation();
  const conversation = useConversation(conversationId);
  if (conversation === 'loading') {
    return <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />;
  }
  if (!conversation) {
    return (
      <EmptyState
        title={t('chat.notFound')}
        body={t('chat.notFoundBody')}
        className="m-4"
        testID="chat-not-found"
      />
    );
  }
  return <Chat conversation={conversation} me={me} />;
}

function Chat({ conversation, me }: { conversation: Conversation; me: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const them = conversation.participants.find((p) => p !== me) ?? '';
  const profile = usePublicProfile(them);
  const theirName = profile.status === 'ready' ? profile.profile.username : t('chat.someone');
  const names = { me: t('chat.you'), them: theirName };
  const messages = useMessages(conversation.id);
  const offers = useOffers(conversation.id);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const unread = conversation.unread[me] ?? 0;
  const mySettings = useUserSettings(me);
  const blockedByMe = mySettings.status === 'ready' ? mySettings.settings.blockedUserIds : [];

  // Reading the chat clears my unread count (and again when new messages arrive while it's open).
  useEffect(() => {
    if (unread > 0)
      markConversationRead({ conversationId: conversation.id }).catch(() => undefined);
  }, [conversation.id, unread]);

  const openComposer = (counter?: Offer) =>
    router.push({
      pathname: '/offer/[listingId]',
      params: {
        listingId: conversation.listingId,
        conversationId: conversation.id,
        ...(counter ? { counter: counter.id } : {}),
      },
    });

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await sendMessage({ conversationId: conversation.id, text: body });
      setText('');
    } catch (error) {
      const reason = error instanceof OfferError ? error.reason : 'unknown';
      const key =
        reason === 'blocked'
          ? 'offers.errors.blocked'
          : reason === 'rateLimited'
            ? 'offers.errors.rateLimited'
            : 'offers.errors.failed';
      toast.show(t(key), 'error');
    } finally {
      setSending(false);
    }
  };

  const dealOn =
    conversation.deal?.status === 'agreed' || conversation.deal?.status === 'awaiting_confirmation';
  const iBlocked = blockedByMe.includes(them);

  const report = (targetType: 'user' | 'message', targetId: string) =>
    router.push({ pathname: '/report', params: { targetType, targetId } });
  const toggleBlock = () =>
    setBlocked(them, !iBlocked).then(
      () =>
        toast.show(
          t(iBlocked ? 'safety.block.unblocked' : 'safety.block.blocked', { name: theirName }),
          'success',
        ),
      () => toast.show(t('offers.errors.failed'), 'error'),
    );
  const openMenu = () =>
    Alert.alert(theirName, undefined, [
      { text: t('safety.report.user'), onPress: () => report('user', them) },
      {
        text: t(iBlocked ? 'safety.block.unblock' : 'safety.block.block'),
        style: iBlocked ? 'default' : 'destructive',
        onPress: () => {
          if (iBlocked) {
            void toggleBlock();
            return;
          }
          Alert.alert(
            t('safety.block.confirmTitle', { name: theirName }),
            t('safety.block.confirmBody'),
            [
              { text: t('safety.block.cancel'), style: 'cancel' },
              {
                text: t('safety.block.block'),
                style: 'destructive',
                onPress: () => void toggleBlock(),
              },
            ],
          );
        },
      },
      { text: t('safety.block.cancel'), style: 'cancel' },
    ]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View className="flex-row items-center justify-between border-b border-border px-4 py-2">
        <Text className="font-medium" numberOfLines={1}>
          {theirName}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.more')}
          onPress={openMenu}
          hitSlop={8}
          testID="chat-menu"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors['text-secondary']} />
        </Pressable>
      </View>
      {conversation.deal ? (
        <DealPanel conversation={conversation} offers={offers} me={me} names={names} />
      ) : null}
      {messages === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerClassName="gap-2 px-4 py-3"
          renderItem={({ item }) => (
            <MessageRow
              message={item}
              me={me}
              offer={item.offerId ? offers.get(item.offerId) : undefined}
              latestOfferId={conversation.currentOfferId}
              conversationId={conversation.id}
              names={names}
              onCounter={openComposer}
              onReport={(messageId) =>
                report('message', messageTargetId(conversation.id, messageId))
              }
            />
          )}
          testID="chat-messages"
        />
      )}
      {iBlocked ? (
        <View
          className="flex-row items-center gap-3 border-t border-border bg-surface px-4 py-3"
          testID="chat-blocked"
        >
          <Text tone="secondary" className="flex-1">
            {t('safety.block.youBlocked', { name: theirName })}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void toggleBlock()}
            testID="chat-unblock"
          >
            <Text tone="accent" className="font-medium">
              {t('safety.block.unblock')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-end gap-2 border-t border-border bg-surface px-3 py-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.makeOffer')}
            onPress={() => openComposer()}
            disabled={dealOn}
            hitSlop={6}
            className={cn(
              'h-10 w-10 items-center justify-center rounded-chip bg-surface-raised',
              dealOn && 'opacity-40',
            )}
            testID="chat-offer"
          >
            <Ionicons name="swap-horizontal" size={20} color={colors.accent} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={colors['text-muted']}
            selectionColor={colors.primary}
            multiline
            maxLength={MESSAGE_TEXT_MAX}
            accessibilityLabel={t('chat.placeholder')}
            className="max-h-32 min-h-10 flex-1 rounded-button bg-surface-raised px-3 py-2 font-sans text-[16px] text-text-primary"
            testID="chat-input"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
            onPress={() => void send()}
            disabled={sending || text.trim() === ''}
            hitSlop={6}
            className={cn(
              'h-10 w-10 items-center justify-center rounded-chip bg-primary',
              (sending || text.trim() === '') && 'opacity-40',
            )}
            testID="chat-send"
          >
            {/* The send arrow points the reading direction. */}
            <Ionicons
              name="send"
              size={18}
              color={colors['text-primary']}
              style={{ transform: [{ scaleX: currentLanguage() === 'he' ? -1 : 1 }] }}
            />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** The safety tips card (PRD W6), shown once when a deal is agreed. */
const SAFETY_TIPS = ['public', 'check', 'bit', 'prepay', 'report'] as const;

function MessageRow({
  message,
  me,
  offer,
  latestOfferId,
  conversationId,
  names,
  onCounter,
  onReport,
}: {
  message: Message;
  me: string;
  offer: Offer | undefined;
  latestOfferId: string | undefined;
  conversationId: string;
  names: { me: string; them: string };
  onCounter: (offer: Offer) => void;
  onReport: (messageId: string) => void;
}) {
  const { t } = useTranslation();
  if (message.type === 'offer') {
    return offer ? (
      <OfferCard
        offer={offer}
        me={me}
        latest={offer.id === latestOfferId}
        conversationId={conversationId}
        names={names}
        onCounter={onCounter}
      />
    ) : null;
  }
  if (message.type === 'safety_tips') {
    return (
      <Card className="gap-1.5 border border-accent/40 p-3" testID="safety-tips">
        <Text className="font-medium">{t('chat.safety.title')}</Text>
        {SAFETY_TIPS.map((tip) => (
          <Text key={tip} variant="caption" tone="secondary">
            {t(`chat.safety.${tip}`)}
          </Text>
        ))}
      </Card>
    );
  }
  if (message.type === 'system') {
    const key = message.event ? `chat.system.${message.event}` : 'chat.system.unknown';
    return (
      <Text
        variant="caption"
        tone="muted"
        className="self-center px-6 py-1 text-center"
        testID={`system-${message.event}`}
      >
        {t(key, { defaultValue: t('chat.system.unknown') })}
      </Text>
    );
  }
  const mine = message.senderId === me;
  return (
    <Pressable
      // Long-press someone else's message to report it (PRD W9).
      onLongPress={
        mine
          ? undefined
          : () =>
              Alert.alert(t('safety.report.messageTitle'), message.text, [
                { text: t('safety.block.cancel'), style: 'cancel' },
                {
                  text: t('safety.report.message'),
                  style: 'destructive',
                  onPress: () => onReport(message.id),
                },
              ])
      }
      accessibilityHint={mine ? undefined : t('safety.report.messageHint')}
      className={cn(
        'max-w-[80%] rounded-card px-3 py-2',
        mine ? 'self-end bg-primary' : 'self-start bg-surface-raised',
      )}
      testID={`message-${message.id}`}
    >
      <Text className={mine ? 'text-on-primary' : undefined}>{message.text}</Text>
    </Pressable>
  );
}
