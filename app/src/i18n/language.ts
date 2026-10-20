import { DevSettings, I18nManager } from 'react-native';

/** Languages the app ships. Hebrew is right-to-left. */
export type Language = 'en' | 'he';
export const LANGUAGES: readonly Language[] = ['en', 'he'];

/**
 * The current language is derived from React Native's layout direction, which the OS persists across restarts
 * (ADR 0002). On first launch a Hebrew phone is RTL (supportsRTL), so it starts in Hebrew; anything else starts
 * in English. `setLanguage` pins the choice.
 */
export function currentLanguage(): Language {
  return I18nManager.isRTL ? 'he' : 'en';
}

export function isRTLLanguage(language: Language): boolean {
  return language === 'he';
}

/** Restarts the JS app so a new layout direction takes effect (RN applies direction only at startup). */
export type Reloader = () => Promise<void> | void;

async function defaultReload(): Promise<void> {
  if (__DEV__) {
    // expo-updates can't reload in development builds; the dev menu reload works there.
    DevSettings.reload();
    return;
  }
  // Lazy import: expo-updates' native module only exists in native builds, never in tests or on web.
  const Updates = await import('expo-updates');
  await Updates.reloadAsync();
}

/**
 * Switches language: pins the layout direction (persisted natively) and restarts the app.
 * Returns false without restarting when the language is already active.
 *
 * `allowRTL(false)` is needed for English: on a Hebrew phone `forceRTL(false)` alone stays RTL.
 */
export async function setLanguage(
  language: Language,
  reload: Reloader = defaultReload,
): Promise<boolean> {
  if (language === currentLanguage()) return false;
  const rtl = isRTLLanguage(language);
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  await reload();
  return true;
}
