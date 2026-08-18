export type HomeWidgetKey = 'expense' | 'travel' | 'baby' | 'family' | 'recentLedger'

export type HomeSettings = Record<HomeWidgetKey, boolean>

export const homeSettingsStorageKey = 'family-platform-home-settings'
export const homeSettingsChangedEvent = 'family-platform-home-settings-changed'

export const homeWidgetLabels: Record<HomeWidgetKey, string> = {
  expense: '이번 달 지출',
  travel: '여행 누적',
  baby: '육아 기록',
  family: '구성원',
  recentLedger: '최근 가계부',
}

export const defaultHomeSettings: HomeSettings = {
  expense: true,
  travel: true,
  baby: true,
  family: true,
  recentLedger: true,
}

export function normalizeHomeSettings(value: unknown): HomeSettings {
  if (!value || typeof value !== 'object') return { ...defaultHomeSettings }
  const record = value as Partial<Record<HomeWidgetKey, unknown>>
  return {
    expense: typeof record.expense === 'boolean' ? record.expense : defaultHomeSettings.expense,
    travel: typeof record.travel === 'boolean' ? record.travel : defaultHomeSettings.travel,
    baby: typeof record.baby === 'boolean' ? record.baby : defaultHomeSettings.baby,
    family: typeof record.family === 'boolean' ? record.family : defaultHomeSettings.family,
    recentLedger: typeof record.recentLedger === 'boolean' ? record.recentLedger : defaultHomeSettings.recentLedger,
  }
}

export function loadHomeSettings(): HomeSettings {
  try {
    return normalizeHomeSettings(JSON.parse(window.localStorage.getItem(homeSettingsStorageKey) || 'null'))
  } catch {
    return { ...defaultHomeSettings }
  }
}

export function saveHomeSettings(settings: HomeSettings) {
  window.localStorage.setItem(homeSettingsStorageKey, JSON.stringify(normalizeHomeSettings(settings)))
  window.dispatchEvent(new Event(homeSettingsChangedEvent))
}
