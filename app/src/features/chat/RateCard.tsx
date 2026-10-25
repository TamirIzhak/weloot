import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Button, Input, Text, useToast } from '@/components';
import { OfferError, rateUser, useMyRating } from '@/features/offers/offersApi';
import { colors } from '@/theme/tokens';

const STARS = [1, 2, 3, 4, 5] as const;

/** After a completed swap (PRD W9, #36): rate the other trader once, 1–5 stars and an optional comment. */
export function RateCard({
  conversationId,
  me,
  name,
}: {
  conversationId: string;
  me: string;
  name: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const rated = useMyRating(conversationId, me);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  if (rated === 'loading') return null;
  if (rated) {
    return (
      <Text variant="caption" tone="muted" testID="rate-done">
        {t('chat.rate.thanks')}
      </Text>
    );
  }

  const send = async () => {
    setSending(true);
    try {
      await rateUser({
        conversationId,
        stars,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      toast.show(t('chat.rate.thanks'), 'success');
    } catch (error) {
      const already = error instanceof OfferError && error.reason === 'alreadyRated';
      toast.show(
        t(already ? 'chat.rate.thanks' : 'offers.errors.failed'),
        already ? 'success' : 'error',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="gap-2 rounded-card bg-surface-raised p-3" testID="rate-card">
      <Text className="font-medium">{t('chat.rate.title', { name })}</Text>
      <View className="flex-row gap-1" accessibilityRole="radiogroup">
        {STARS.map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ checked: stars === n }}
            accessibilityLabel={t('chat.rate.stars', { count: n })}
            onPress={() => setStars(n)}
            hitSlop={4}
            testID={`rate-star-${n}`}
          >
            <Ionicons
              name={n <= stars ? 'star' : 'star-outline'}
              size={28}
              color={colors.warning}
            />
          </Pressable>
        ))}
      </View>
      <Input
        label={t('chat.rate.comment')}
        value={comment}
        onChangeText={setComment}
        maxLength={500}
        testID="rate-comment"
      />
      <Button
        label={t('chat.rate.send')}
        disabled={stars === 0 || sending}
        loading={sending}
        onPress={() => void send()}
        testID="rate-send"
      />
    </View>
  );
}
