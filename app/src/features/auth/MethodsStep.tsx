import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Text } from '@/components';
import { colors } from '@/theme/tokens';

import { authErrorKey } from './errors';
import {
  isMethodConfigured,
  SignInCancelled,
  signInWithMethod,
  SOCIAL_METHODS,
  type SocialMethod,
} from './socialSignIn';

const ICONS: Record<SocialMethod, 'logo-google' | 'logo-facebook' | 'logo-discord'> = {
  google: 'logo-google',
  facebook: 'logo-facebook',
  discord: 'logo-discord',
};

/**
 * Sign-in step 1 (PRD W1): Google, Facebook, Discord or phone. A social sign-in changes the auth state, which
 * moves the sheet on; `onPhone` goes to the phone step. Methods without their public ID in app/.env are hidden,
 * except in development, where they show as "not set up yet" (docs/OWNER-TODO.md).
 */
export function MethodsStep({ title, onPhone }: { title: string; onPhone: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<SocialMethod | null>(null);
  const [error, setError] = useState<string | undefined>();

  const signIn = async (method: SocialMethod) => {
    setBusy(method);
    setError(undefined);
    try {
      await signInWithMethod(method);
    } catch (e) {
      if (!(e instanceof SignInCancelled)) setError(t(authErrorKey(e)));
    } finally {
      setBusy(null);
    }
  };

  const shown = SOCIAL_METHODS.filter((method) => __DEV__ || isMethodConfigured(method));

  return (
    <View className="gap-6" testID="methods-step">
      <View className="gap-2">
        <Text variant="title">{title}</Text>
        <Text tone="secondary">{t('auth.methods.subtitle')}</Text>
      </View>
      <View className="gap-3">
        {shown.map((method) => {
          const configured = isMethodConfigured(method);
          return (
            <View key={method} className="gap-1">
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                label={t(`auth.methods.${method}`)}
                icon={<Ionicons name={ICONS[method]} size={20} color={colors['text-primary']} />}
                loading={busy === method}
                disabled={!configured || (busy !== null && busy !== method)}
                onPress={() => void signIn(method)}
                testID={`sign-in-${method}`}
              />
              {configured ? null : (
                <Text variant="caption" tone="muted" className="text-center">
                  {t('auth.methods.notSetUp')}
                </Text>
              )}
            </View>
          );
        })}
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          label={t('auth.methods.phone')}
          icon={<Ionicons name="call-outline" size={20} color={colors['text-primary']} />}
          disabled={busy !== null}
          onPress={onPhone}
          testID="sign-in-phone"
        />
      </View>
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite" testID="methods-error">
          {error}
        </Text>
      ) : null}
      <Text variant="caption" tone="muted">
        {t('auth.methods.phoneNote')}
      </Text>
    </View>
  );
}
