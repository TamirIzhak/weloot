import '../../global.css';
// i18n must initialize before any screen renders text.
import '@/i18n';

import {
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_700Bold,
  Rubik_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/rubik';
import { DarkTheme, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ToastProvider } from '@/components';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { Splash } from '@/features/auth/Splash';
import { initFirebase } from '@/lib/firebase';
import { colors } from '@/theme/tokens';

export { AppErrorBoundary as ErrorBoundary } from '@/components';

// Connect to the local emulators (dev only) before any screen touches Firebase.
initFirebase();

// Keep the splash screen up until the fonts are ready, so text never flashes in a fallback font.
void SplashScreen.preventAutoHideAsync();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.surface,
    text: colors['text-primary'],
    border: colors.border,
    notification: colors.accent,
  },
};

const withHeader = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors['text-primary'],
  headerTitleStyle: { fontFamily: 'Rubik_500Medium' },
  headerShadowVisible: false,
} as const;

/**
 * Guest-first navigation (PRD W1): everyone lands on the tabs. Protected actions open the `sign-in` modal
 * through `useRequireAuth`; nothing is locked at the app level.
 */
function RootNavigator() {
  const auth = useAuth();
  if (auth.status === 'loading') return <Splash />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
      <Stack.Screen name="location" options={{ presentation: 'modal' }} />
      {/* Pushed screens with a header and back button (titles set by each screen). */}
      <Stack.Screen name="settings/index" options={withHeader} />
      <Stack.Screen name="settings/addresses" options={withHeader} />
      <Stack.Screen name="settings/delete-account" options={withHeader} />
      <Stack.Screen name="me/listings" options={withHeader} />
      <Stack.Screen name="me/[section]" options={withHeader} />
      <Stack.Screen name="add/details" options={withHeader} />
      <Stack.Screen name="add/done" options={{ gestureEnabled: false }} />
      <Stack.Screen name="listings/[id]/photos" options={withHeader} />
      <Stack.Screen name="addresses/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="addresses/[id]" options={{ presentation: 'modal' }} />
      {/* OAuth redirects land here for a moment and step back (OAuthRedirect). */}
      <Stack.Screen
        name="auth/[provider]"
        options={{ presentation: 'transparentModal', animation: 'none' }}
      />
      <Stack.Screen
        name="authorize"
        options={{ presentation: 'transparentModal', animation: 'none' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_700Bold,
    Rubik_800ExtraBold,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (fontError) console.warn('[fonts] Rubik failed to load; using the system font.', fontError);
    if (ready) void SplashScreen.hideAsync();
  }, [ready, fontError]);

  if (!ready) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <ToastProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
