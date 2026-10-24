import { z } from 'zod';

import { PLATFORM_KEYS, type PlatformKey } from './enums';
import { gameRecordSchema } from './search';

// Barcodes on game cases (PRD §5.1): EAN-13, or UPC-A (12 digits, the same code with a leading 0 in EAN-13).
// IGDB has no barcodes, so WeLoot keeps its own mapping, improved by users' confirmations.

/** Confirmations from different users after which a mapping is trusted. */
export const TRUSTED_BARCODE_CONFIRMATIONS = 2;

/** Whether a 13-digit code has a valid EAN-13 check digit. */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop() ?? -1;
  const sum = digits.reduce((acc, digit, i) => acc + digit * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** A scanned EAN-13 or UPC-A as a valid EAN-13, or null when it isn't one. */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const ean = digits.length === 12 ? `0${digits}` : digits;
  return isValidEan13(ean) ? ean : null;
}

const platform = z.enum(PLATFORM_KEYS as [PlatformKey, ...PlatformKey[]]);
const ean13 = z.string().refine(isValidEan13, { message: 'Not a valid EAN-13' });

export const barcodeLookupInputSchema = z.object({ ean: ean13 });
export type BarcodeLookupInput = z.infer<typeof barcodeLookupInputSchema>;

/**
 * `match`: the barcode is in our table (the game and platform it maps to). Otherwise `suggestions` from the UPC
 * provider's product title, for the user to pick from (empty when the barcode is unknown everywhere).
 */
export const barcodeLookupResultSchema = z.object({
  ean: ean13,
  match: z.object({ game: gameRecordSchema, platform, trusted: z.boolean() }).optional(),
  suggestions: z.array(gameRecordSchema),
});
export type BarcodeLookupResult = z.infer<typeof barcodeLookupResultSchema>;

export const confirmBarcodeInputSchema = z.object({
  ean: ean13,
  igdbGameId: z.number().int().positive(),
  platform,
});
export type ConfirmBarcodeInput = z.infer<typeof confirmBarcodeInputSchema>;

/** Stable `details.reason` values of the barcode callables. */
export type BarcodeError = 'invalidInput' | 'unknownGame' | 'wrongPlatform';
