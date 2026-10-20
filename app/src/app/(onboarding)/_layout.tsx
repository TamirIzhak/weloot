import { Stack } from 'expo-router/stack';

import { colors } from '@/theme/tokens';

// Expo Router 58: the initial route is set here, not as a Stack prop.
export const unstable_settings = { initialRouteName: 'phone' };

/** Onboarding flow (PRD §9-A): phone sign-in now; profile setup joins in #9. */
export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
