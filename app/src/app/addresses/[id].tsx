import { useLocalSearchParams } from 'expo-router';

import { AddressFormScreen } from '@/features/location/AddressFormScreen';

/** Edit or delete a saved address (PRD W2). */
export default function EditAddress() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AddressFormScreen id={id} />;
}
