import { AGOROT_PER_SHEKEL, type Agorot } from '@weloot/shared';

import type { Language } from './language';

const LOCALE: Record<Language, string> = { en: 'en-IL', he: 'he-IL' };

// Unicode first-strong isolate / pop directional isolate: keeps an embedded run (a price, a game title,
// a phone number) in its own direction inside text of the other direction (PRD §3.5).
const FSI = '⁨';
const PDI = '⁩';

/** Wraps text in a bidi isolate so it renders in its own direction inside Hebrew (or English) text. */
export function isolate(text: string | number): string {
  return `${FSI}${text}${PDI}`;
}

/** Formats an integer agorot amount as shekels, e.g. 15000 → "₪150" (whole shekels shown without decimals). */
export function formatPrice(agorot: Agorot, language: Language): string {
  const shekels = agorot / AGOROT_PER_SHEKEL;
  const whole = Number.isInteger(shekels);
  return new Intl.NumberFormat(LOCALE[language], {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(shekels);
}

export function formatNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(LOCALE[language]).format(value);
}
