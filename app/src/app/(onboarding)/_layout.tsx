import { Stack } from 'expo-router/stack';

/** Onboarding flow: splash, phone sign-in, profile setup (PRD §9-A). Screens arrive in #8 and #9. */
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
