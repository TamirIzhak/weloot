import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ReportReason, ReportTarget } from '@weloot/shared';

import { Button, Chip, Input, Text, useToast } from '@/components';

import { ReportError, submitReport } from './reportApi';

/** Reasons that fit each kind of target (the rest, like "the swap didn't happen", belong to deals). */
const REASONS: Record<ReportTarget, readonly ReportReason[]> = {
  listing: ['scam', 'fake_or_damaged', 'offensive', 'spam', 'other'],
  user: ['scam', 'offensive', 'spam', 'no_show', 'other'],
  message: ['offensive', 'scam', 'spam', 'other'],
  deal: ['swap_didnt_happen', 'fake_or_damaged', 'no_show', 'scam', 'other'],
};

const ERROR_KEY: Record<string, string> = {
  rateLimited: 'safety.report.errors.rateLimited',
  notFound: 'safety.report.errors.notFound',
  ownTarget: 'safety.report.errors.ownTarget',
};

/** Report something for review by support (PRD W9): a reason and optional details. */
export function ReportScreen({
  targetType,
  targetId,
  onDone,
}: {
  targetType: ReportTarget;
  targetId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const reasons = REASONS[targetType];

  const send = async () => {
    if (!reason) return;
    setSending(true);
    try {
      await submitReport({
        targetType,
        targetId,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
      });
      toast.show(t('safety.report.sent'), 'success');
      onDone();
    } catch (error) {
      const key = error instanceof ReportError ? ERROR_KEY[error.reason] : undefined;
      toast.show(t(key ?? 'safety.report.errors.failed'), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="gap-5" testID="report-screen">
      <Text tone="secondary">{t('safety.report.intro')}</Text>
      <View className="gap-2">
        <Text variant="label" tone="secondary">
          {t('safety.report.reason')}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {reasons.map((r) => (
            <Chip
              key={r}
              label={t(`safety.report.reasons.${r}`)}
              selected={reason === r}
              onPress={() => setReason(r)}
              testID={`report-reason-${r}`}
            />
          ))}
        </View>
      </View>
      <Input
        label={t('safety.report.details')}
        placeholder={t('safety.report.detailsPlaceholder')}
        value={details}
        onChangeText={setDetails}
        multiline
        maxLength={1000}
        testID="report-details"
      />
      <Button
        label={t('safety.report.send')}
        disabled={!reason}
        loading={sending}
        onPress={() => void send()}
        testID="report-send"
      />
    </View>
  );
}
