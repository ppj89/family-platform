import type { CapacitorConfig } from '@capacitor/cli';

const appServerUrl = process.env.CAPACITOR_SERVER_URL?.trim()
  || (process.env.CAPACITOR_BUNDLED_WEB === 'true' ? undefined : 'https://familyhistory.dedyn.io')

const config: CapacitorConfig = {
  appId: 'com.familyplatform.app',
  appName: '공유 가계부·공유 일정·공유 여행·공유 육아·일기·맛집',
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
