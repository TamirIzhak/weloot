import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState } from '@/components';
import { isProfileComplete, useAuth } from '@/features/auth/AuthProvider';
import {
  isReadyFor,
  PHONE_REASONS,
  useAuthGate,
  type SignInReason,
} from '@/features/auth/authGate';
import { CodeStep } from '@/features/auth/CodeStep';
import { MethodsStep } from '@/features/auth/MethodsStep';
import { PhoneStep } from '@/features/auth/PhoneStep';
import { usePhoneVerification } from '@/features/auth/phoneVerification';
import { ProfileStep } from '@/features/profile/ProfileStep';
import { colors } from '@/theme/tokens';

/** Sheet title per reason (PRD W1): why we're asking, tied to what the user just tried to do. */
const REASON_TITLE_KEY: Record<SignInReason, string> = {
  offer: 'auth.reasons.offer',
  question: 'auth.reasons.question',
  message: 'auth.reasons.message',
  wantlist: 'auth.reasons.wantlist',
  alert: 'auth.reasons.alert',
  add: 'auth.reasons.add',
  inbox: 'auth.reasons.inbox',
  profile: 'auth.reasons.profile',
};

/**
 * The sign-in sheet (modal). Opened by `useRequireAuth` from a protected action; steps through the sign-in method
 * (Google, Facebook, Discord, or phone → code) → profile setup (first sign-in only), then closes and continues the action. Closing it drops the pending action;
 * a user who closes it during profile setup stays signed in and gets back to setup on their next protected action.
 */
export default function SignInSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const reason = useAuthGate((s) => s.reason);
  const [step, setStep] = useState<'methods' | 'phone' | 'code'>('methods');
  // Trading actions also need a verified phone; anything else is done once the profile is.
  const needsPhone = reason !== null && PHONE_REASONS.has(reason);
  const complete = reason ? isReadyFor(auth, reason) : isProfileComplete(auth);
  // Opened when there was nothing left to do (e.g. a deep link while signed in with a profile).
  const [openedComplete] = useState(complete);
  const finished = useRef(false);

  // Leaving the sheet any way (close, back gesture) without signing in forgets the pending action and code.
  useEffect(
    () => () => {
      useAuthGate.getState().cancel();
      usePhoneVerification.getState().clear();
    },
    [],
  );

  // Signed in with a profile (now, or already when the profile loads): close and continue the action.
  useEffect(() => {
    if (!complete || openedComplete || finished.current) return;
    finished.current = true;
    const action = useAuthGate.getState().take();
    router.back();
    // Continue after the sheet has closed, so the action's own navigation lands on the app, not the modal.
    if (action) setTimeout(action, 0);
  }, [complete, openedComplete, router]);

  if (openedComplete) return <Redirect href="/" />;

  const close = () => router.back();

  return (
    <SafeAreaView className="flex-1 bg-bg" testID="sign-in-sheet">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-row justify-end px-4 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.close')}
            onPress={close}
            hitSlop={12}
            testID="close-sign-in"
          >
            <Ionicons name="close" size={28} color={colors['text-secondary']} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 pb-10"
          keyboardShouldPersistTaps="handled"
        >
          {auth.status === 'signedIn' ? (
            auth.profile.status === 'missing' ? (
              <ProfileStep uid={auth.user.uid} defaults={profileDefaults(auth.user)} />
            ) : auth.profile.status === 'error' ? (
              <ErrorState
                title={t('profile.setup.loadFailed')}
                retryLabel={t('common.tryAgain')}
                onRetry={auth.retryProfile}
                testID="profile-load-error"
              />
            ) : auth.profile.status === 'ready' && needsPhone && !auth.phoneVerified ? (
              // One-time phone verification before the first offer, message or post.
              step === 'code' ? (
                <CodeStep onChangeNumber={() => setStep('phone')} />
              ) : (
                <PhoneStep
                  mode="link"
                  title={t('auth.verifyPhone.title')}
                  onSent={() => setStep('code')}
                />
              )
            ) : (
              // Loading the profile, or closing once it's ready.
              <ActivityIndicator color={colors.primary} testID="profile-loading" />
            )
          ) : step === 'methods' ? (
            <MethodsStep
              title={t(reason ? REASON_TITLE_KEY[reason] : 'auth.methods.title')}
              onPhone={() => setStep('phone')}
            />
          ) : step === 'phone' ? (
            <PhoneStep
              title={t('auth.phone.title')}
              onSent={() => setStep('code')}
              onBack={() => setStep('methods')}
            />
          ) : (
            <CodeStep onChangeNumber={() => setStep('phone')} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Name and email from the sign-in provider (Google, Facebook, Discord), to prefill profile setup. */
function profileDefaults(user: { displayName: string | null; email: string | null }) {
  const [firstName = '', ...rest] = (user.displayName ?? '').trim().split(/\s+/);
  return { firstName, lastName: rest.join(' '), email: user.email ?? '' };
}
