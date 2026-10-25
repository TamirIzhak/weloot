import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';

import { MESSAGE_TEXT_MAX } from '@weloot/shared';

import { Card, cn, EmptyState, Text, useToast } from '@/components';
import {
  markConversationRead,
  OfferError,
  sendMessage,
  useConversation,
  type Conversation,
  type Offer,
} from '@/features/offers/offersApi';
import { usePublicProfile } from '@/features/profile/usePublicProfile';
import { currentLanguage, formatPrice, isolate } from '@/i18n';
import { colors } from '@/theme/tokens';

import { useMessages, useOffers, type Message } from './chatApi';
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
      const blocked = error instanceof OfferError && error.reason === 'blocked';
      toast.show(t(blocked ? 'offers.errors.blocked' : 'offers.errors.failed'), 'error');
    } finally {
      setSending(false);
    }
  };

  const dealOn =
    conversation.deal?.status === 'agreed' || conversation.deal?.status === 'awaiting_confirmation';

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {conversation.deal ? (
        <DealHeader conversation={conversation} offers={offers} me={me} names={names} />
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
            />
          )}
          testID="chat-messages"
        />
      )}
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
}: {
  message: Message;
  me: string;
  offer: Offer | undefined;
  latestOfferId: string | undefined;
  conversationId: string;
  names: { me: string; them: string };
  onCounter: (offer: Offer) => void;
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
    <View
      className={cn(
        'max-w-[80%] rounded-card px-3 py-2',
        mine ? 'self-end bg-primary' : 'self-start bg-surface-raised',
      )}
    >
      <Text className={mine ? 'text-on-primary' : undefined}>{message.text}</Text>
    </View>
  );
}

/** What was agreed (PRD W6): the games each side brings and the cash line. Swapped / Cancel arrive with #47. */
function DealHeader({
  conversation,
  offers,
  me,
  names,
}: {
  conversation: Conversation;
  offers: ReadonlyMap<string, Offer>;
  me: string;
  names: { me: string; them: string };
}) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const deal = conversation.deal;
  if (!deal) return null;
  const offer = deal.offerId ? offers.get(deal.offerId) : undefined;
  const title = (ids: string[]) =>
    ids
      .map((id) => offer?.items[id]?.gameTitle)
      .filter(Boolean)
      .join(', ');
  const mineIds = conversation.ownerId === me ? deal.itemsOwner : deal.itemsOther;
  const theirIds = conversation.ownerId === me ? deal.itemsOther : deal.itemsOwner;
  return (
    <View className="gap-1 border-b border-border bg-surface px-4 py-3" testID="deal-header">
      <Text className="font-medium">{t(`chat.deal.status.${deal.status}`)}</Text>
      {offer ? (
        <Text variant="caption" tone="secondary">
          {t('chat.deal.summary', {
            give: title(mineIds) || t('chat.offer.noGames'),
            get: title(theirIds) || t('chat.offer.noGames'),
          })}
        </Text>
      ) : null}
      {deal.cashAgorot > 0 ? (
        <Text variant="caption" tone="secondary">
          {t('chat.offer.cash', {
            amount: isolate(formatPrice(deal.cashAgorot, language)),
            payer: deal.cashPayerId === me ? names.me : names.them,
          })}
        </Text>
      ) : null}
    </View>
  );
}
