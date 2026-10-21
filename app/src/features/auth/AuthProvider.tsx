import { getAuth, onAuthStateChanged, type User } from '@react-native-firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { subscribeToProfile, type ProfileState } from '@/features/profile/profileApi';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | {
      status: 'signedIn';
      user: User;
      /** The user's public profile; `missing` until profile setup (PRD W1) is done. */
      profile: ProfileState;
      /** Listens to the profile again after a load error. */
      retryProfile: () => void;
    };

const AuthContext = createContext<AuthState | null>(null);

/** Tracks the Firebase Auth user and their profile for the whole app. Wraps the root navigator. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<{ uid: string; state: ProfileState } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => onAuthStateChanged(getAuth(), (next) => setUser(next ?? null)), []);

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    return subscribeToProfile(uid, (state) => setProfile({ uid, state }));
  }, [uid, attempt]);

  let state: AuthState;
  if (user === undefined) state = { status: 'loading' };
  else if (user === null) state = { status: 'signedOut' };
  else {
    state = {
      status: 'signedIn',
      user,
      // Ignore a previous user's profile until this user's first snapshot arrives.
      profile: profile?.uid === user.uid ? profile.state : { status: 'loading' },
      retryProfile: () => {
        setProfile(null);
        setAttempt((n) => n + 1);
      },
    };
  }

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used inside <AuthProvider>');
  return state;
}

/** True once the user is signed in and has finished profile setup: what protected actions need. */
export function isProfileComplete(auth: AuthState): boolean {
  return auth.status === 'signedIn' && auth.profile.status === 'ready';
}
