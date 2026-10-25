import { useEffect } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';

import { setMonitoringUser } from './crash';

/** Keeps the crash and analytics user ID in step with who's signed in (IDs only). */
export function MonitoringBridge() {
  const auth = useAuth();
  const uid = auth.status === 'signedIn' ? auth.user.uid : null;
  useEffect(() => {
    if (auth.status !== 'loading') setMonitoringUser(uid);
  }, [auth.status, uid]);
  return null;
}
