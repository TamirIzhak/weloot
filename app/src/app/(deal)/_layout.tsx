import { Stack } from 'expo-router/stack';

/** Deal stack: game detail, offer composer, conversation, rating, report (PRD §9-C). Screens arrive in #19+. */
export default function DealLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
