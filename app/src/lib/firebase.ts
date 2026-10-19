import { getApp } from '@react-native-firebase/app';
import { connectAuthEmulator, getAuth } from '@react-native-firebase/auth';
import { connectFirestoreEmulator, getFirestore } from '@react-native-firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from '@react-native-firebase/functions';
import { connectStorageEmulator, getStorage } from '@react-native-firebase/storage';
import Constants from 'expo-constants';

import { FIREBASE_REGION } from '@weloot/shared';

/** Ports from firebase.json "emulators". */
const EMULATOR_PORTS = { auth: 9099, firestore: 8080, functions: 5001, storage: 9199 } as const;

/**
 * Host the Firebase emulators run on: the dev machine serving Metro.
 * `hostUri` is "<lan-ip>:<port>" for a phone on the same Wi-Fi (and 10.0.2.2 on an Android emulator).
 */
export function emulatorHost(hostUri: string | undefined): string | null {
  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  return host ? host : null;
}

/** Emulators are used only in development JS bundles, and only when opted in via app/.env. */
export function shouldUseEmulators(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_USE_EMULATORS === 'true';
}

/** undefined until initFirebase() runs; then the emulator host, or null for the real project. */
let emulatorHostInUse: string | null | undefined;

/**
 * Points every Firebase service at the local emulators when `shouldUseEmulators()`.
 * Must run once before any Firebase call (called from the root layout); later calls return the first result.
 * Returns the emulator host, or null when talking to the real project from google-services.json.
 */
export function initFirebase(): string | null {
  if (emulatorHostInUse !== undefined) return emulatorHostInUse;
  emulatorHostInUse = null;
  if (!shouldUseEmulators()) return null;

  const host = emulatorHost(Constants.expoConfig?.hostUri);
  if (!host) {
    console.warn(
      '[firebase] EXPO_PUBLIC_USE_EMULATORS is set but the dev server host is unknown; using the real project.',
    );
    return null;
  }

  const app = getApp();
  connectSafely('auth', () =>
    connectAuthEmulator(getAuth(app), `http://${host}:${EMULATOR_PORTS.auth}`),
  );
  connectSafely('firestore', () =>
    connectFirestoreEmulator(getFirestore(), host, EMULATOR_PORTS.firestore),
  );
  connectSafely('functions', () =>
    connectFunctionsEmulator(getFunctions(app, FIREBASE_REGION), host, EMULATOR_PORTS.functions),
  );
  connectSafely('storage', () =>
    connectStorageEmulator(getStorage(app), host, EMULATOR_PORTS.storage),
  );
  emulatorHostInUse = host;
  return host;
}

/**
 * Runs one emulator connection without ever throwing. A JS reload (shake → Reload) restarts this module but
 * keeps the native Firebase instances, which are already connected and started, so connecting again can throw.
 * That must not stop the app from rendering (issue #52); anything unexpected is logged instead.
 */
function connectSafely(service: string, connect: () => void): void {
  try {
    connect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[firebase] ${service} emulator connection skipped: ${message}`);
  }
}
