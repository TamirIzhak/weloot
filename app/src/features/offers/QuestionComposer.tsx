import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MESSAGE_TEXT_MAX } from '@weloot/shared';

import { Button, Input, Text, useToast } from '@/components';

import { registerForPush } from '@/features/notifications/push';

import { OfferError, startConversation } from './offersApi';

/** "Ask a question" on a game page (PRD W5): the first message opens the conversation. */
export function QuestionComposer({ listingId }: { listingId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const { conversationId } = await startConversation({
        listingId,
        opener: 'question',
        text: text.trim(),
      });
      void registerForPush(true);
      router.replace({ pathname: '/conversations/[id]', params: { id: conversationId } });
    } catch (error) {
      const reason = error instanceof OfferError ? error.reason : 'unknown';
      toast.show(
        t(
          reason === 'listingUnavailable'
            ? 'offers.errors.listingUnavailable'
            : reason === 'blocked'
              ? 'offers.errors.blocked'
              : reason === 'rateLimited'
                ? 'offers.errors.rateLimited'
                : 'offers.errors.failed',
        ),
        'error',
      );
      setSending(false);
    }
  };

  return (
    <View className="gap-4" testID="question-composer">
      <Text tone="secondary">{t('offers.question.hint')}</Text>
      <Input
        label={t('offers.question.label')}
        placeholder={t('offers.question.placeholder')}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={MESSAGE_TEXT_MAX}
        autoFocus
        testID="question-text"
      />
      <Button
        label={t('offers.question.send')}
        disabled={text.trim() === '' || sending}
        loading={sending}
        onPress={() => void send()}
        testID="question-send"
      />
    </View>
  );
}
