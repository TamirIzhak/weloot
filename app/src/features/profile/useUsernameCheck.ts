import { useEffect, useState } from 'react';

import { USERNAME_PATTERN } from '@weloot/shared';

import { isUsernameAvailable } from './profileApi';

export type UsernameCheck = 'empty' | 'invalid' | 'checking' | 'available' | 'taken' | 'unknown';

/** Wait this long after the last keystroke before asking the server. */
export const USERNAME_CHECK_DELAY_MS = 400;

/**
 * Live availability of a username as the user types: format first (instant), then the server (debounced).
 * `unknown` means the check itself failed (e.g. offline); submitting still works and the rules decide.
 */
export function useUsernameCheck(username: string): UsernameCheck {
  const [result, setResult] = useState<{ username: string; check: UsernameCheck } | null>(null);
  const valid = USERNAME_PATTERN.test(username);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      isUsernameAvailable(username).then(
        (available) => {
          if (!cancelled) setResult({ username, check: available ? 'available' : 'taken' });
        },
        () => {
          if (!cancelled) setResult({ username, check: 'unknown' });
        },
      );
    }, USERNAME_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, valid]);

  if (username === '') return 'empty';
  if (!valid) return 'invalid';
  return result?.username === username ? result.check : 'checking';
}
