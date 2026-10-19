import '../../global.css';

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

// Placeholder root layout. Navigation shell (tabs, onboarding, deal stacks) lands in #06.
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
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
        />
      </ToastProvider>
    </ThemeProvider>
  );
}
