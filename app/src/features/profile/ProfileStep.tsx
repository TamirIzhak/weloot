import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { searchCities, type City } from '@weloot/shared';

import { Button, Input, Text } from '@/components';
import { currentLanguage } from '@/i18n';
import { colors } from '@/theme/tokens';

import { createProfile, ProfileSetupError } from './profileApi';
import { useUsernameCheck, type UsernameCheck } from './useUsernameCheck';

/** How many matching cities to show under the search field. */
const MAX_CITY_RESULTS = 6;

const USERNAME_MESSAGE_KEY: Record<UsernameCheck, string | null> = {
  empty: 'profile.setup.usernameHint',
  invalid: 'profile.setup.usernameInvalid',
  checking: 'profile.setup.usernameChecking',
  available: 'profile.setup.usernameAvailable',
  taken: 'profile.setup.usernameTaken',
  unknown: null,
};

/**
 * Sign-in step 3, on a first sign-in (PRD W1): username, city and the 16+/Terms confirmation. Saves the profile;
 * the sheet then continues the pending action (it watches the profile, so this step has no `onDone`).
 * The language isn't asked here: the app's current language is saved, and Settings can change it.
 */
export function ProfileStep({ uid }: { uid: string }) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const [username, setUsername] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [city, setCity] = useState<City | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [takenOnSubmit, setTakenOnSubmit] = useState<string | null>(null);

  const liveCheck = useUsernameCheck(username);
  const check: UsernameCheck = takenOnSubmit === username ? 'taken' : liveCheck;
  const usernameMessage = USERNAME_MESSAGE_KEY[check];
  const usernameIsError = check === 'invalid' || check === 'taken';

  const cityResults = city ? [] : searchCities(cityQuery, language).slice(0, MAX_CITY_RESULTS);
  const canSubmit =
    (check === 'available' || check === 'unknown') && city !== null && accepted && !saving;

  const submit = async () => {
    if (!canSubmit || !city) return;
    setSaving(true);
    setError(undefined);
    try {
      await createProfile(uid, { username, cityId: city.id }, language);
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

      <View className="gap-2">
        <Input
          label={t('profile.setup.cityLabel')}
          placeholder={t('profile.setup.cityPlaceholder')}
          value={city ? city[language] : cityQuery}
          onChangeText={(value) => {
            setCity(null);
            setCityQuery(value);
          }}
          onFocus={() => {
            // Tapping a chosen city starts a new search.
            if (city) {
              setCity(null);
              setCityQuery('');
            }
          }}
          autoCorrect={false}
          helper={
            !city && cityQuery !== '' && cityResults.length === 0
              ? t('profile.setup.cityNoResults')
              : t('profile.setup.cityHint')
          }
          testID="city-input"
        />
        {cityQuery !== '' && cityResults.length > 0 ? (
          <View className="overflow-hidden rounded-button bg-surface-raised" testID="city-results">
            {cityResults.map((result) => (
              <Pressable
                key={result.id}
                accessibilityRole="button"
                onPress={() => {
                  setCity(result);
                  setCityQuery('');
                }}
                className="border-b border-border px-4 py-3 active:bg-surface"
                testID={`city-${result.id}`}
              >
                <Text>{result[language]}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        onPress={() => setAccepted((value) => !value)}
        className="flex-row items-center gap-3"
        hitSlop={8}
        testID="accept-terms"
      >
        <Ionicons
          name={accepted ? 'checkbox' : 'square-outline'}
          size={24}
          color={accepted ? colors.primary : colors['text-secondary']}
        />
        <Text className="flex-1">{t('profile.setup.acceptTerms')}</Text>
      </Pressable>

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
