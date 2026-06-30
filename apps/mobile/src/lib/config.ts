import Constants from 'expo-constants';

/**
 * Backend API URL. In dev this must be your machine's LAN IP (not localhost,
 * because localhost on the phone points to the phone). Set it via:
 *   EXPO_PUBLIC_API_URL=http://192.168.1.42:3000 npx expo start
 *
 * In production this is the hosted origin, e.g. https://ensemble.app.
 */
const fallbackDevUrl = () => {
  // Best-effort derivation from Expo's dev server host.
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (!hostUri) return 'http://localhost:3000';
  const host = hostUri.split(':')[0];
  return `http://${host}:3000`;
};

/**
 * Hardcoded production origin. Used as the fallback when EXPO_PUBLIC_API_URL
 * isn't baked into the bundle — e.g. a release build produced via an Xcode
 * Archive rather than `eas build` (eas.json's `env` block only applies to EAS
 * builds). Without this, release builds fell back to http://localhost:3000,
 * which the device can't reach and ATS blocks → infinite spinner.
 */
const PROD_API_URL = 'https://ensemblelanguage.com';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? fallbackDevUrl() : PROD_API_URL);

/** Custom URL scheme registered in app.json. Used for OAuth redirects. */
export const APP_SCHEME = 'ensemble';
