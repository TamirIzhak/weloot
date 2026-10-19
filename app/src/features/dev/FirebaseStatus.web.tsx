// No native Firebase on web; the connectivity check only runs in native development builds.
export function FirebaseStatus(_props: { emulatorHost: string | null }) {
  return null;
}
