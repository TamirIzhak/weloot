import type { ConfigContext, ExpoConfig } from 'expo/config';

// Build variants, selected by APP_VARIANT (set per profile in eas.json).
// Each variant has its own app ID so dev, staging and prod can be installed side by side,
// and its own Firebase project (see README "Firebase projects").
type Variant = 'development' | 'preview' | 'production';

const VARIANTS: Record<Variant, { name: string; appId: string }> = {
  development: { name: 'WeLoot Dev', appId: 'com.weloot.app.dev' },
  preview: { name: 'WeLoot Staging', appId: 'com.weloot.app.staging' },
  production: { name: 'WeLoot', appId: 'com.weloot.app' },
};

function resolveVariant(value: string | undefined): Variant {
  if (value === undefined || value === '') return 'development';
  if (value in VARIANTS) return value as Variant;
  throw new Error(
    `Unknown APP_VARIANT "${value}". Expected one of: ${Object.keys(VARIANTS).join(', ')}`,
  );
}

const variant = resolveVariant(process.env.APP_VARIANT);

// Facebook Login redirects native apps to fb<app id>://authorize, so that scheme is registered once the Facebook
// app exists (EXPO_PUBLIC_FACEBOOK_APP_ID, docs/OWNER-TODO.md). Changing it needs a new dev build.
const facebookAppId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;

// English permission texts (the default). Hebrew ones are in ./locales/he.json.
const PERMISSIONS = {
  camera: 'WeLoot uses the camera to scan game barcodes and take photos of your games.',
  photos: 'WeLoot uses your photos so you can add pictures of the games you list.',
  location:
    'WeLoot uses your location to show games near you and to fill in your address when you post.',
};
const { name, appId } = VARIANTS[variant];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: 'weloot',
  owner: 'tamiri',
  version: '0.3.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: facebookAppId ? ['weloot', `fb${facebookAppId}`] : 'weloot',
  userInterfaceStyle: 'dark',
  backgroundColor: '#121212',
  ios: {
    icon: './assets/expo.icon',
    bundleIdentifier: appId,
    // GoogleService-Info.plist per variant is added when iOS builds start (needs an Apple developer account).
  },
  android: {
    package: appId,
    // Provided by EAS as a file environment variable; never committed (see README "Firebase config files").
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    adaptiveIcon: {
      backgroundColor: '#121212',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Libraries may add these; WeLoot never records audio or tracks location in the background.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#121212',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-firebase/analytics',
    '@react-native-firebase/crashlytics',
    '@react-native-firebase/messaging',
    // RTL: Hebrew layouts mirror via I18nManager (PRD §3.5, ADR 0002).
    ['expo-localization', { supportsRTL: true }],
    'expo-updates',
    // No yellow autofill overlay on Android text fields.
    './plugins/withNoAutofillHighlight',
    // Sign in with Google (#64). Android reads the OAuth client from google-services.json.
    '@react-native-google-signin/google-signin',
    // Barcode scanning (#14) and listing photos (#15); no audio anywhere.
    [
      'expo-camera',
      {
        cameraPermission: PERMISSIONS.camera,
        microphonePermission: false,
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: PERMISSIONS.photos,
        cameraPermission: PERMISSIONS.camera,
        microphonePermission: false,
      },
    ],
    // Browsing location and saved addresses (#66): foreground only.
    [
      'expo-location',
      {
        locationWhenInUsePermission: PERMISSIONS.location,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
  ],
  // iOS permission texts per language (Android uses the system's own wording).
  locales: { en: './locales/en.json', he: './locales/he.json' },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    appVariant: variant,
    eas: { projectId: '93b88dcd-9316-4815-bb20-44137f94f91d' },
  },
  // expo-updates needs these to be enabled; it's used to restart the app after a language change (release builds).
  updates: { url: 'https://u.expo.dev/93b88dcd-9316-4815-bb20-44137f94f91d' },
  runtimeVersion: { policy: 'appVersion' },
});
