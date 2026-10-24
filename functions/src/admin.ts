import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// The Admin SDK, initialized once per instance on first use (not at import time, so tests and the build
// never need credentials).

function app() {
  return getApps()[0] ?? initializeApp();
}

export function adminAuth(): Auth {
  return getAuth(app());
}

export function adminDb(): Firestore {
  return getFirestore(app());
}
