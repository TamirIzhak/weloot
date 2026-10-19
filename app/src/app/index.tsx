import { StyleSheet, Text, View } from 'react-native';

import { APP_NAME } from '@weloot/shared';

import { FirebaseStatus } from '@/features/dev/FirebaseStatus';
import { initFirebase } from '@/lib/firebase';

// Placeholder home screen. Replaced by the tab navigator in #06; theme tokens arrive in #04.
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.wordmark}>{APP_NAME}</Text>
      {__DEV__ && <FirebaseStatus emulatorHost={initFirebase()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
  },
  wordmark: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
  },
});
