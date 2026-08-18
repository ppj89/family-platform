export type AdsProvider = 'admob'

const isEnabled = (value: string | undefined) => value?.toLowerCase() === 'true'

export const adConfig = {
  enabled: isEnabled(import.meta.env.VITE_ADS_ENABLED),
  provider: (import.meta.env.VITE_ADS_PROVIDER || 'admob') as AdsProvider,
  admobBannerUnitId: import.meta.env.VITE_ADMOB_BANNER_UNIT_ID || '',
  admobInterstitialUnitId: import.meta.env.VITE_ADMOB_INTERSTITIAL_UNIT_ID || '',
}

export const canRenderBannerAd = adConfig.enabled && adConfig.provider === 'admob' && Boolean(adConfig.admobBannerUnitId)
export const canRenderInterstitialAd =
  adConfig.enabled && adConfig.provider === 'admob' && Boolean(adConfig.admobInterstitialUnitId)
