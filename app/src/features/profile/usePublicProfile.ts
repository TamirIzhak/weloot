import { useEffect, useState } from 'react';

import { subscribeToProfile, type ProfileState } from './profileApi';

/** Someone's public profile (`users/{uid}`, readable by guests too): username and trust signals (PRD W9). */
export function usePublicProfile(uid: string | undefined): ProfileState {
  const [state, setState] = useState<{ uid: string; value: ProfileState } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return subscribeToProfile(uid, (value) => setState({ uid, value }));
  }, [uid]);

  if (!uid) return { status: 'missing' };
  return state?.uid === uid ? state.value : { status: 'loading' };
}
