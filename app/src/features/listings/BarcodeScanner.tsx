import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, View } from 'react-native';

import { normalizeBarcode } from '@weloot/shared';

import { Button, Card, Text } from '@/components';
import { colors } from '@/theme/tokens';

/**
 * Camera barcode scanner for game cases (EAN-13 / UPC-A, PRD §5.1). Reports the first valid code once; the camera
 * only runs while the screen is focused. Without camera permission it explains why and offers search instead.
 */
export function BarcodeScanner({
  onScanned,
  onSearchInstead,
}: {
  onScanned: (ean: string) => void;
  onSearchInstead: () => void;
}) {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const reported = useRef(false);

  if (!permission)
    return <ActivityIndicator color={colors.primary} testID="camera-permission-loading" />;

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <Card className="gap-3 p-5" testID="camera-permission">
        <Ionicons name="camera-outline" size={28} color={colors['text-secondary']} />
        <Text variant="subheading">{t('listings.identify.camera.title')}</Text>
        <Text tone="secondary">
          {t(blocked ? 'listings.identify.camera.blocked' : 'listings.identify.camera.body')}
        </Text>
        <Button
          label={t(
            blocked ? 'listings.identify.camera.openSettings' : 'listings.identify.camera.allow',
          )}
          onPress={() => void (blocked ? Linking.openSettings() : requestPermission())}
          testID="camera-permission-button"
        />
        <Button
          variant="ghost"
          label={t('listings.identify.searchInstead')}
          onPress={onSearchInstead}
          testID="search-instead"
        />
      </Card>
    );
  }

  return (
    <View className="gap-3">
      <View
        className="aspect-[4/3] overflow-hidden rounded-card bg-surface"
        testID="barcode-camera"
      >
        {focused ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'upc_a'] }}
            onBarcodeScanned={({ data }) => {
              const ean = normalizeBarcode(data);
              if (!ean || reported.current) return;
              reported.current = true;
              onScanned(ean);
            }}
          />
        ) : null}
      </View>
      <Text tone="secondary" className="text-center">
        {t('listings.identify.scanHint')}
      </Text>
    </View>
  );
}
