import { doc, getDoc, getFirestore } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

type Status =
  { kind: 'checking' } | { kind: 'ok'; source: string } | { kind: 'error'; message: string };

/**
 * Development-only connectivity check (issue #3): reads `config/app` from Firestore and shows whether it worked.
 * Not user-facing, so its text is not localized; it is removed or replaced once real screens exist.
 */
export function FirebaseStatus({ emulatorHost }: { emulatorHost: string | null }) {
  const [status, setStatus] = useState<Status>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(getFirestore(), 'config/app'))
      .then(() => {
        if (!cancelled)
          setStatus({ kind: 'ok', source: emulatorHost ? `emulator @ ${emulatorHost}` : 'cloud' });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setStatus({
            kind: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [emulatorHost]);

  const text =
    status.kind === 'checking'
      ? 'Firestore: checking…'
      : status.kind === 'ok'
        ? `Firestore: OK (${status.source})`
        : `Firestore: ${status.message}`;

  return (
    <Text testID="firebase-status" style={[styles.text, status.kind === 'error' && styles.error]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { color: '#B3B3B3', fontSize: 13, marginTop: 16 },
  error: { color: '#EF4444' },
});
