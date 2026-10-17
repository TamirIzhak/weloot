import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';

// Placeholder root layout. Navigation shell (tabs, onboarding, transaction stacks) lands in #06.
export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
