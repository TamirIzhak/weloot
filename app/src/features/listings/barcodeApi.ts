import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import {
  barcodeLookupResultSchema,
  FIREBASE_REGION,
  type BarcodeLookupInput,
  type BarcodeLookupResult,
  type ConfirmBarcodeInput,
} from '@weloot/shared';

const functions = () => getFunctions(getApp(), FIREBASE_REGION);

/** Looks a scanned barcode up (PRD §5.1): a known match, or suggestions, or nothing. */
export async function lookupBarcode(ean: string): Promise<BarcodeLookupResult> {
  const call = httpsCallable<BarcodeLookupInput, unknown>(functions(), 'lookupBarcode');
  const { data } = await call({ ean });
  return barcodeLookupResultSchema.parse(data);
}

/** Records that this barcode is this game on this platform (improves the table for everyone). */
export async function confirmBarcode(input: ConfirmBarcodeInput): Promise<void> {
  const call = httpsCallable<ConfirmBarcodeInput, { trusted: boolean }>(
    functions(),
    'confirmBarcode',
  );
  await call(input);
}
