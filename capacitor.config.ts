import type { CapacitorConfig } from '@capacitor/cli';

const appServerUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.familyplatform.app',
  appName: 'Family Platform',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    ...(appServerUrl
      ? {
          url: appServerUrl,
          cleartext: appServerUrl.startsWith('http://'),
        }
      : {}),
  }
};

export default config;
