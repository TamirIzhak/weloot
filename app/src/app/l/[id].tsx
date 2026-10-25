import { Redirect, useLocalSearchParams } from 'expo-router';

/** A shared link (`https://<domain>/l/{id}`) opened in the app (PRD W7): straight to the game page. */
export default function SharedListing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/listings/[id]', params: { id } }} />;
}
