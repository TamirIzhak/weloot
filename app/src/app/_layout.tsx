import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';

import { initFirebase } from '@/lib/firebase';

// Connect to the local emulators (dev only) before any screen touches Firebase.
initFirebase();

// Placeholder root layout. Navigation shell (tabs, onboarding, transaction stacks) lands in #06.
export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
