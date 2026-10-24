import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import {
  MAX_SAVED_LOCATIONS,
  savedLocationInputSchema,
  savedLocationSchema,
  type SavedLocation,
  type SavedLocationInput,
} from '@weloot/shared';

// Saved addresses (PRD W2): `users/{uid}/locations`, owner-only (Security Rules). The exact point stays here;
// listings get an area-level copy from the publish function (#16).

export type SavedLocationWithId = SavedLocation & { id: string };

export type SavedLocationsState =
  { status: 'loading' } | { status: 'ready'; items: SavedLocationWithId[] } | { status: 'error' };

const locations = (uid: string) => collection(getFirestore(), 'users', uid, 'locations');

/** Listens to the user's saved addresses, oldest first (the first one added is usually "Home"). */
export function useSavedLocations(uid: string | undefined): SavedLocationsState {
  const [state, setState] = useState<{ uid: string; value: SavedLocationsState } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(locations(uid), orderBy('createdAt', 'asc')),
      (snapshot) => {
        const items = snapshot.docs.flatMap((d) => {
          const parsed = savedLocationSchema.safeParse(d.data({ serverTimestamps: 'estimate' }));
          return parsed.success ? [{ ...parsed.data, id: d.id }] : [];
        });
        setState({ uid, value: { status: 'ready', items } });
      },
      () => setState({ uid, value: { status: 'error' } }),
    );
  }, [uid]);

  if (!uid) return { status: 'ready', items: [] };
  return state?.uid === uid ? state.value : { status: 'loading' };
}

export class SavedLocationError extends Error {
  constructor(readonly reason: 'invalid' | 'tooMany') {
    super(reason);
    this.name = 'SavedLocationError';
  }
}

/** Adds a saved address and returns its id. */
export async function addSavedLocation(
  uid: string,
  input: SavedLocationInput,
  existingCount: number,
): Promise<string> {
  if (existingCount >= MAX_SAVED_LOCATIONS) throw new SavedLocationError('tooMany');
  const parsed = savedLocationInputSchema.safeParse(input);
  if (!parsed.success) throw new SavedLocationError('invalid');
  const now = serverTimestamp();
  const ref = await addDoc(locations(uid), { ...parsed.data, createdAt: now, updatedAt: now });
  return ref.id;
}

export async function updateSavedLocation(
  uid: string,
  id: string,
  input: SavedLocationInput,
): Promise<void> {
  const parsed = savedLocationInputSchema.safeParse(input);
  if (!parsed.success) throw new SavedLocationError('invalid');
  // A locality that no longer matches is removed rather than left stale.
  await updateDoc(doc(locations(uid), id), {
    ...parsed.data,
    cityId: parsed.data.cityId ?? deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSavedLocation(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(locations(uid), id));
}
