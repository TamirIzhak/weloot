// Support and legal links (PRD §9-D). All values are public app config (app/.env); an empty value hides or disables
// the matching row.

const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '';
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? '';
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? '';

/** WhatsApp chat with support, prefilled with a message that includes the user's ID (or "guest"). */
export function supportWhatsAppUrl(message: string): string | null {
  const number = SUPPORT_WHATSAPP.replace(/\D/g, '');
  if (number === '') return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function supportEmailUrl(subject: string, body: string): string | null {
  if (SUPPORT_EMAIL === '') return null;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Terms of Service / Privacy Policy in the reader's language. The configured URL may contain `{lang}` (en|he).
 * Null until the legal texts are published (docs/OWNER-TODO.md).
 */
export function legalUrl(kind: 'terms' | 'privacy', language: 'en' | 'he'): string | null {
  const url = kind === 'terms' ? TERMS_URL : PRIVACY_URL;
  return url === '' ? null : url.replaceAll('{lang}', language);
}
