import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { emailSchema, normalizeEmail, personNameSchema } from '@weloot/shared';

import { Button, Input, Text } from '@/components';
import { currentLanguage } from '@/i18n';
import { colors } from '@/theme/tokens';

import { createProfile, ProfileSetupError } from './profileApi';
import { useUsernameCheck, type UsernameCheck } from './useUsernameCheck';

const USERNAME_MESSAGE_KEY: Record<UsernameCheck, string | null> = {
  empty: 'profile.setup.usernameHint',
  invalid: 'profile.setup.usernameInvalid',
  checking: 'profile.setup.usernameChecking',
  available: 'profile.setup.usernameAvailable',
  taken: 'profile.setup.usernameTaken',
  unknown: null,
};

/**
 * Sign-in step 3, on a first sign-in (PRD W1): username, full name, email, an optional opt-in to promotions and the
 * 16+/Terms confirmation. Saves the profile; the sheet then continues the pending action (it watches the profile,
 * so this step has no `onDone`). No location here: an address is asked only when posting (PRD W2). The language
 * isn't asked either: the app's current language is saved, and Settings can change it.
 */
export function ProfileStep({
  uid,
  defaults,
}: {
  uid: string;
  /** Prefill from the sign-in provider (name and email); the user can change them. */
  defaults?: { firstName: string; lastName: string; email: string };
}) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState(defaults?.firstName ?? '');
  const [lastName, setLastName] = useState(defaults?.lastName ?? '');
  const [namesTouched, setNamesTouched] = useState({ first: false, last: false });
  const [email, setEmail] = useState(defaults?.email ?? '');
  const [emailTouched, setEmailTouched] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [takenOnSubmit, setTakenOnSubmit] = useState<string | null>(null);

  const liveCheck = useUsernameCheck(username);
  const check: UsernameCheck = takenOnSubmit === username ? 'taken' : liveCheck;
  const usernameMessage = USERNAME_MESSAGE_KEY[check];
  const usernameIsError = check === 'invalid' || check === 'taken';

  const firstNameValid = personNameSchema.safeParse(firstName.trim()).success;
  const lastNameValid = personNameSchema.safeParse(lastName.trim()).success;
  const emailValid = emailSchema.safeParse(normalizeEmail(email)).success;
  const showEmailError = emailTouched && email.trim() !== '' && !emailValid;
  const canSubmit =
    (check === 'available' || check === 'unknown') &&
    firstNameValid &&
    lastNameValid &&
    emailValid &&
    accepted &&
    !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(undefined);
    try {
      await createProfile(uid, { username, firstName, lastName, email, marketingOptIn }, language);
    } catch (e) {
      if (e instanceof ProfileSetupError && e.reason === 'usernameTaken')
        setTakenOnSubmit(username);
      else setError(t('profile.setup.saveFailed'));
      setSaving(false);
    }
  };

  return (
    <View className="gap-6" testID="profile-step">
      <View className="gap-2">
        <Text variant="title">{t('profile.setup.title')}</Text>
        <Text tone="secondary">{t('profile.setup.subtitle')}</Text>
      </View>

      <Input
        label={t('profile.setup.usernameLabel')}
        placeholder={t('profile.setup.usernamePlaceholder')}
        value={username}
        onChangeText={(value) => {
          setUsername(value.trim());
          setError(undefined);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        textContentType="username"
        maxLength={20}
        error={usernameIsError && usernameMessage ? t(usernameMessage) : undefined}
        helper={!usernameIsError && usernameMessage ? t(usernameMessage) : undefined}
        testID="username-input"
      />

      <View className="gap-1.5">
        <View className="flex-row gap-3">
          <Input
            className="flex-1"
            label={t('profile.setup.firstNameLabel')}
            value={firstName}
            onChangeText={setFirstName}
            onBlur={() => setNamesTouched((s) => ({ ...s, first: true }))}
            autoComplete="given-name"
            textContentType="givenName"
            maxLength={40}
            error={
              namesTouched.first && firstName.trim() !== '' && !firstNameValid
                ? t('profile.setup.nameInvalid')
                : undefined
            }
            testID="first-name-input"
          />
          <Input
            className="flex-1"
            label={t('profile.setup.lastNameLabel')}
            value={lastName}
            onChangeText={setLastName}
            onBlur={() => setNamesTouched((s) => ({ ...s, last: true }))}
            autoComplete="family-name"
            textContentType="familyName"
            maxLength={40}
            error={
              namesTouched.last && lastName.trim() !== '' && !lastNameValid
                ? t('profile.setup.nameInvalid')
                : undefined
            }
            testID="last-name-input"
          />
        </View>
        <Text variant="caption" tone="muted">
          {t('profile.setup.nameHint')}
        </Text>
      </View>

      <Input
        label={t('profile.setup.emailLabel')}
        placeholder={t('profile.setup.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        onBlur={() => setEmailTouched(true)}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={254}
        error={showEmailError ? t('profile.setup.emailInvalid') : undefined}
        helper={t('profile.setup.emailHint')}
        testID="email-input"
      />

      <View className="gap-4">
        <Checkbox
          checked={marketingOptIn}
          onToggle={() => setMarketingOptIn((value) => !value)}
          label={t('profile.setup.marketingOptIn')}
          description={t('profile.setup.marketingOptInHint')}
          testID="marketing-opt-in"
        />
        <Checkbox
          checked={accepted}
          onToggle={() => setAccepted((value) => !value)}
          label={t('profile.setup.acceptTerms')}
          description={t('profile.setup.acceptTermsHint')}
          testID="accept-terms"
        />
      </View>

      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite" testID="profile-error">
          {error}
        </Text>
      ) : null}

      <Button
        size="lg"
        fullWidth
        label={t('profile.setup.submit')}
        loading={saving}
        disabled={!canSubmit}
        onPress={() => void submit()}
        testID="save-profile"
      />
    </View>
  );
}

/** A short label on one line, with the details underneath, both next to the box. */
function Checkbox({
  checked,
  onToggle,
  label,
  description,
  testID,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  description: string;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      accessibilityHint={description}
      className="flex-row items-start gap-3"
      hitSlop={8}
      testID={testID}
    >
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={24}
        color={checked ? colors.primary : colors['text-secondary']}
      />
      <View className="flex-1 gap-0.5">
        <Text>{label}</Text>
        <Text variant="caption" tone="muted">
          {description}
        </Text>
      </View>
    </Pressable>
  );
}
