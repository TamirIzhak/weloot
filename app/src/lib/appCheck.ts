import { getApp } from '@react-native-firebase/app';
import { initializeAppCheck, ReactNativeFirebaseAppCheckProvider } from '@react-native-firebase/app-check';
import Constants from 'expo-constants';

// App Check (PRD §12, #38): proves calls come from the genuine WeLoot app on a real device, so scripts can't hit
// Functions, Firestore or Storage directly. Release variants attest with Play Integrity (Android) and App Attest
// with a DeviceCheck fallback (iOS). The development variant uses the debug provider: on first launch it logs a
// debug token to register in the Firebase console (docs/OWNER-TODO.md §11). No token is ever bundled.

/** Which attestation a build variant uses. */
export function appCheckProviders(variant: string | undefined) {
  const debug = variant === undefined || variant === 'development';
  return {
    android: { provider: debug ? ('debug' as const) : ('playIntegrity' as const) },
    apple: {
      provider: debug ? ('debug' as const) : ('appAttestWithDeviceCheckFallback' as const),
    },
  };
}

let started = false;

/** Starts App Check once, before any other Firebase call. Never throws: a failure only means unattested calls. */
export function initAppCheck(): void {
  if (started) return;
  started = true;
  try {
    const variant = (Constants.expoConfig?.extra as { appVariant?: string } | undefined)?.appVariant;
    const provider = new ReactNativeFirebaseAppCheckProvider();
    provider.configure(appCheckProviders(variant));
    initializeAppCheck(getApp(), { provider, isTokenAutoRefreshEnabled: true });
  } catch (error) {
    if (__DEV__) console.warn('[appCheck] not started', error);
  }
}
