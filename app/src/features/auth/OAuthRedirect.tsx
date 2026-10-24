import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * Landing route for OAuth redirects (`weloot://auth/discord`, `fb<app id>://authorize`). The browser session has
 * already handed the result to expo-auth-session; the router also opens the link, so this screen steps straight
 * back to where the user was (the sign-in sheet).
 */
export function OAuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
  return null;
}
