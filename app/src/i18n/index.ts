import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { currentLanguage } from './language';
import en from './locales/en.json';
import he from './locales/he.json';

export { formatDate, formatMonthYear, formatNumber, formatPrice, isolate } from './format';
export { currentLanguage, isRTLLanguage, LANGUAGES, setLanguage, type Language } from './language';

export const resources = { en: { translation: en }, he: { translation: he } } as const;

// Synchronous init (bundled resources), so the first render already has text. Import this module once, early,
// from the root layout.
// eslint-disable-next-line import/no-named-as-default-member -- the instance method is the documented API
void i18n.use(initReactI18next).init({
  resources,
  lng: currentLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'he'],
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

export default i18n;
