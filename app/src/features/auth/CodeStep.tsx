import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { toLocalIL } from '@weloot/shared';

import { Button, Input, Text } from '@/components';
import { isolate } from '@/i18n';

import { authErrorKey } from './errors';
import {
  confirmCode,
  RESEND_COOLDOWN_SECONDS,
  sendCode,
  usePhoneVerification,
} from './phoneVerification';

const CODE_LENGTH = 6;

/** Seconds left before "Resend code" is allowed, ticking once a second. */
function useResendCountdown(sentAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (sentAt === undefined) return 0;
  return Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor((now - sentAt) / 1000));
}

/**
 * Sign-in step 2: the 6-digit SMS code. Submits automatically once all digits are in. Signing in updates the auth
 * state (which moves the sheet on); `onVerified`, if given, is also called.
 * `onChangeNumber` goes back to the phone step.
 */
export function CodeStep({
  onVerified,
  onChangeNumber,
}: {
  onVerified?: (result: { isNewUser: boolean }) => void;
  onChangeNumber: () => void;
}) {
  const { t } = useTranslation();
  const pending = usePhoneVerification((s) => s.pending);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const secondsLeft = useResendCountdown(pending?.sentAt);

  if (!pending) return null;

  const verify = async (value: string) => {
    if (value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(undefined);
    try {
      const result = await confirmCode(value);
      onVerified?.(result);
    } catch (e) {
      setError(t(authErrorKey(e)));
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(undefined);
    try {
      await sendCode(pending.phoneE164);
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setResending(false);
    }
  };

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text variant="title">{t('auth.verify.title')}</Text>
        <Text tone="secondary">
          {t('auth.verify.subtitle', { phone: isolate(toLocalIL(pending.phoneE164)) })}
        </Text>
      </View>
      <Input
        label={t('auth.verify.label')}
        value={code}
        onChangeText={(value) => {
          const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
          setCode(digits);
          setError(undefined);
          if (digits.length === CODE_LENGTH) void verify(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={CODE_LENGTH}
        editable={!verifying}
        error={error}
        testID="code-input"
      />
      <Button
        size="lg"
        fullWidth
        label={t('auth.verify.confirm')}
        loading={verifying}
        disabled={code.length !== CODE_LENGTH}
        onPress={() => void verify(code)}
        testID="confirm-code"
      />
      <View className="flex-row items-center justify-between">
        <Button variant="ghost" label={t('auth.verify.changeNumber')} onPress={onChangeNumber} />
        <Button
          variant="ghost"
          label={
            secondsLeft > 0
              ? t('auth.verify.resendIn', { seconds: isolate(secondsLeft) })
              : t('auth.verify.resend')
          }
          disabled={secondsLeft > 0}
          loading={resending}
          onPress={() => void resend()}
          testID="resend-code"
        />
      </View>
    </View>
  );
}
