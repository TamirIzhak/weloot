import { getAuth, onAuthStateChanged, type User } from '@react-native-firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type AuthState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: User };

const AuthContext = createContext<AuthState | null>(null);

/** Tracks the Firebase Auth user for the whole app. Wraps the root navigator. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(
    () =>
      onAuthStateChanged(getAuth(), (user) =>
        setState(user ? { status: 'signedIn', user } : { status: 'signedOut' }),
      ),
    [],
  );

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used inside <AuthProvider>');
  return state;
}
