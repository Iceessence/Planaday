// Single Authoritative Planaday Release Identity (PD-017 / PF-52)
export const PLANADAY_RELEASE = Object.freeze({
  version: '4.2.0',
  syncProtocolVersion: 2,
  indexedDbSchemaVersion: 3,
  minSupportedChromeWebView: 74,
  minSupportedAndroidApi: 29,
  appId: 'com.dayplana.app',
  desktopAppId: 'com.dayplana.desktop',
  indexedDbName: 'dayplana-v2',
} as const);
