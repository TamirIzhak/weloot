import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isIsraeliMobile, toE164IL } from '@weloot/shared';

import { Button, Input, Text } from '@/components';
import { isolate } from '@/i18n';

import { authErrorKey } from './errors';
import { sendCode } from './phoneVerification';

/** Sign-in step 1 (PRD W1): Israeli mobiles only, +972 prefilled. Calls `onSent` once the SMS is on its way. */
export function PhoneStep({ title, onSent }: { title: string; onSent: () => void }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const valid = isIsraeliMobile(phone);
  const showInvalid = touched && phone.length > 0 && !valid;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setSending(true);
    setError(undefined);
    try {
      await sendCode(toE164IL(phone));
      onSent();
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text variant="title">{title}</Text>
        <Text tone="secondary">{t('auth.phone.subtitle')}</Text>
      </View>
      <View className="flex-row items-end gap-2">
        <View className="h-12 justify-center rounded-button bg-surface-raised px-4">
          <Text variant="label">{isolate('+972')}</Text>
        </View>
        <Input
          className="flex-1"
          label={t('auth.phone.label')}
          placeholder={t('auth.phone.placeholder')}
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            setError(undefined);
          }}
          onBlur={() => setTouched(true)}
          onSubmitEditing={() => void submit()}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus
          // Long enough for "+972 54-123-4567" (pasted international form), which the validator accepts.
          maxLength={16}
          error={showInvalid ? t('auth.errors.invalidPhone') : error}
          testID="phone-input"
        />
      </View>
      <Button
        size="lg"
        fullWidth
        label={t('auth.phone.sendCode')}
        loading={sending}
        disabled={!valid}
        onPress={() => void submit()}
        testID="send-code"
      />
      <Text variant="caption" tone="muted">
        {t('auth.phone.smsNotice')}
      </Text>
    </View>
  );
}
