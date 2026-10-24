import { getAuth, signOut, type User } from '@react-native-firebase/auth';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Switch, View } from 'react-native';

import type { UserSettings } from '@weloot/shared';

import { Button, Chip, Text, useToast } from '@/components';
import { useAuth, type AuthState } from '@/features/auth/AuthProvider';
import { useRequireAuth } from '@/features/auth/authGate';
import { browsingLocationName, useBrowsingLocation } from '@/features/location/browsingLocation';
import { useSavedLocations } from '@/features/location/savedLocations';
import { legalUrl, supportEmailUrl, supportWhatsAppUrl } from '@/features/profile/links';
import { updateSettings, useUserSettings } from '@/features/profile/settingsApi';
import { SettingsRow, SettingsSection } from '@/features/profile/SettingsRow';
import { currentLanguage, LANGUAGES, setLanguage, type Language } from '@/i18n';
import { colors } from '@/theme/tokens';

/** Radius choices for "games near me" (PRD §9-D); the stored value is any whole km from 1 to 200. */
const RADIUS_OPTIONS_KM = [5, 10, 25, 50, 100] as const;

/**
 * Settings (PRD §9-D). Everyone gets language, browsing location, support, legal and the app version; signed-in
 * users also get their account (sign-in method, phone, saved addresses, sign out), search radius and email offers.
 */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  const signedIn = auth.status === 'signedIn' && auth.profile.status === 'ready';
  const uid = auth.status === 'signedIn' ? auth.user.uid : undefined;
  const settings = useUserSettings(signedIn ? uid : undefined);
  const ready = settings.status === 'ready' ? settings.settings : null;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-6 px-4 py-4"
      testID="settings"
    >
      <Stack.Screen options={{ title: t('settings.title') }} />
      {signedIn && auth.status === 'signedIn' ? <AccountSection auth={auth} /> : null}
      <PreferencesSection uid={signedIn ? uid : undefined} settings={ready} />
      {signedIn && uid && ready ? <EmailSection uid={uid} settings={ready} /> : null}
      <SupportSection uid={uid} />
      <LegalSection />
      <AboutSection />
      {auth.status === 'signedIn' ? <SignOutButton /> : null}
    </ScrollView>
  );
}

const PROVIDER_KEYS: Record<string, string> = {
  'google.com': 'auth.methods.google',
  'facebook.com': 'auth.methods.facebook',
  phone: 'auth.methods.phone',
};

/** How the user signs in: their linked providers (Discord accounts are custom-token users `discord:<id>`). */
function signInMethodKeys(user: User): string[] {
  const keys = user.providerData.flatMap((p) =>
    PROVIDER_KEYS[p.providerId] ? [PROVIDER_KEYS[p.providerId] as string] : [],
  );
  if (user.uid.startsWith('discord:')) keys.unshift('auth.methods.discord');
  return keys;
}

function AccountSection({ auth }: { auth: Extract<AuthState, { status: 'signedIn' }> }) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const requireAuth = useRequireAuth();
  const saved = useSavedLocations(auth.user.uid);
  const username = auth.profile.status === 'ready' ? auth.profile.profile.username : '';

  return (
    <SettingsSection title={t('settings.account.title')} testID="settings-account">
      <SettingsRow
        first
        icon="person-outline"
        label={t('settings.account.username')}
        value={username}
      />
      <SettingsRow
        icon="log-in-outline"
        label={t('settings.account.signInWith')}
        value={signInMethodKeys(auth.user)
          .map((key) => t(key))
          .join(' · ')}
      />
      <SettingsRow
        icon="call-outline"
        label={t('settings.account.phone')}
        value={t(
          auth.phoneVerified ? 'settings.account.phoneVerified' : 'settings.account.phoneVerify',
        )}
        onPress={
          auth.phoneVerified
            ? undefined
            : () =>
                requireAuth('phone', () => toast.show(t('settings.account.phoneDone'), 'success'))
        }
        testID="settings-phone"
      />
      <SettingsRow
        icon="home-outline"
        label={t('settings.account.addresses')}
        value={saved.status === 'ready' ? String(saved.items.length) : undefined}
        onPress={() => router.push('/settings/addresses')}
        testID="settings-addresses"
      />
    </SettingsSection>
  );
}

function PreferencesSection({ uid, settings }: { uid?: string; settings: UserSettings | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const language = currentLanguage();
  const browsing = useBrowsingLocation((s) => s.location);

  const switchLanguage = async (next: Language) => {
    if (next === language) return;
    try {
      // Saved for notifications in the right language. Not awaited: offline, a Firestore write only resolves once
      // the server has it, but it's already queued locally and syncs after the restart.
      if (uid && settings) {
        updateSettings(uid, { preferredLanguage: next }).catch(() => undefined);
      }
      await setLanguage(next);
    } catch {
      toast.show(t('language.failed'), 'error');
    }
  };

  const changeRadius = (km: number) => {
    if (!uid) return;
    updateSettings(uid, { searchRadiusKm: km }).catch(() =>
      toast.show(t('settings.errors.saveFailed'), 'error'),
    );
  };

  return (
    <SettingsSection title={t('settings.preferences.title')} testID="settings-preferences">
      <SettingsRow
        first
        icon="language-outline"
        label={t('settings.preferences.language')}
        right={
          <View className="flex-row gap-2">
            {LANGUAGES.map((lang) => (
              <Chip
                key={lang}
                label={t(lang === 'he' ? 'language.hebrew' : 'language.english')}
                selected={lang === language}
                onPress={() => void switchLanguage(lang)}
                testID={`language-${lang}`}
              />
            ))}
          </View>
        }
      />
      <SettingsRow
        icon="location-outline"
        label={t('settings.preferences.browsingLocation')}
        value={browsing ? browsingLocationName(browsing, language) : t('location.chip.choose')}
        onPress={() => router.push('/location')}
        testID="settings-browsing-location"
      />
      {uid && settings ? (
        <View className="gap-3 border-t border-border px-4 py-3.5" testID="settings-radius">
          <Text>{t('settings.preferences.radius')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {RADIUS_OPTIONS_KM.map((km) => (
              <Chip
                key={km}
                label={t('common.km', { value: km })}
                selected={settings.searchRadiusKm === km}
                onPress={() => changeRadius(km)}
                testID={`radius-${km}`}
              />
            ))}
          </View>
        </View>
      ) : null}
    </SettingsSection>
  );
}

function EmailSection({ uid, settings }: { uid: string; settings: UserSettings }) {
  const { t } = useTranslation();
  const toast = useToast();
  return (
    <SettingsSection title={t('settings.email.title')}>
      <SettingsRow
        first
        icon="mail-outline"
        label={t('settings.email.offers')}
        value={settings.email}
        right={
          <Switch
            value={settings.marketingOptIn}
            onValueChange={(on) =>
              updateSettings(uid, { marketingOptIn: on }).catch(() =>
                toast.show(t('settings.errors.saveFailed'), 'error'),
              )
            }
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors['text-primary']}
            accessibilityLabel={t('settings.email.offers')}
            testID="email-offers"
          />
        }
      />
    </SettingsSection>
  );
}

function SupportSection({ uid }: { uid?: string }) {
  const { t } = useTranslation();
  const id = uid ?? t('settings.support.guest');
  const whatsapp = supportWhatsAppUrl(t('settings.support.whatsappText', { id }));
  const email = supportEmailUrl(
    t('settings.support.emailSubject'),
    t('settings.support.emailBody', { id }),
  );
  if (!whatsapp && !email) return null;
  return (
    <SettingsSection title={t('settings.support.title')}>
      {whatsapp ? (
        <SettingsRow
          first
          icon="logo-whatsapp"
          label={t('settings.support.whatsapp')}
          onPress={() => void Linking.openURL(whatsapp)}
          testID="support-whatsapp"
        />
      ) : null}
      {email ? (
        <SettingsRow
          first={!whatsapp}
          icon="mail-outline"
          label={t('settings.support.email')}
          onPress={() => void Linking.openURL(email)}
          testID="support-email"
        />
      ) : null}
    </SettingsSection>
  );
}

function LegalSection() {
  const { t } = useTranslation();
  const language = currentLanguage();
  const terms = legalUrl('terms', language);
  const privacy = legalUrl('privacy', language);
  return (
    <SettingsSection title={t('settings.legal.title')}>
      <SettingsRow
        first
        icon="document-text-outline"
        label={t('settings.legal.terms')}
        value={terms ? undefined : t('settings.comingSoon')}
        disabled={!terms}
        onPress={terms ? () => void Linking.openURL(terms) : undefined}
        testID="legal-terms"
      />
      <SettingsRow
        icon="shield-checkmark-outline"
        label={t('settings.legal.privacy')}
        value={privacy ? undefined : t('settings.comingSoon')}
        disabled={!privacy}
        onPress={privacy ? () => void Linking.openURL(privacy) : undefined}
        testID="legal-privacy"
      />
    </SettingsSection>
  );
}

function AboutSection() {
  const { t } = useTranslation();
  return (
    <SettingsSection title={t('settings.about.title')}>
      <SettingsRow
        first
        icon="information-circle-outline"
        label={t('settings.about.version')}
        value={Constants.expoConfig?.version ?? '—'}
        testID="app-version"
      />
    </SettingsSection>
  );
}

function SignOutButton() {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      fullWidth
      label={t('auth.signOut')}
      onPress={() => {
        signOut(getAuth())
          .then(() => router.back())
          .catch(() => toast.show(t('auth.errors.generic'), 'error'));
      }}
      testID="sign-out"
    />
  );
}
