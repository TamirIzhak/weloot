import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isIsraeliMobile, toE164IL } from '@weloot/shared';

import { Button, Input, Text } from '@/components';
import { authErrorKey } from '@/features/auth/errors';
import { sendCode } from '@/features/auth/phoneVerification';
import { isolate } from '@/i18n';

/** Phone sign-in, step 1 (PRD W1): Israeli mobiles only, +972 prefilled. */
export default function PhoneScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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
      router.push('/verify');
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-1 justify-center gap-6 px-6">
          <View className="gap-2">
            <Text variant="title">{t('auth.phone.title')}</Text>
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
              maxLength={13}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
