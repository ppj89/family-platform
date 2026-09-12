import { Capacitor, registerPlugin } from '@capacitor/core'

// Android-only. iOS gives apps no way to read other apps' notifications
// (or SMS), so the card-paste dialog stays the only route there.
//
// The native side (PaymentNotificationListener.java) only queues the raw
// notification text; everything is parsed here with the same parser the
// manual "카드 붙여넣기" dialog already uses, so the two paths can't drift.

export type CapturedNotification = {
  id: string
  packageName: string
  title: string
  text: string
  postedAt: number
}

type NotificationCapturePlugin = {
  isEnabled(): Promise<{ enabled: boolean }>
  openSettings(): Promise<void>
  takePending(): Promise<{ items: CapturedNotification[] }>
}

const plugin = registerPlugin<NotificationCapturePlugin>('NotificationCapture')

/**
 * True only on a native Android shell new enough to carry the plugin. The
 * web build is served live and can be running on an older installed APK,
 * so this has to be checked before every call — same guard as the SSO
 * Browser plugin in LoginPage.
 */
export function isNotificationCaptureSupported() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android' &&
    Capacitor.isPluginAvailable('NotificationCapture')
  )
}

export async function isNotificationCaptureEnabled() {
  if (!isNotificationCaptureSupported()) return false
  try {
    const { enabled } = await plugin.isEnabled()
    return enabled
  } catch {
    return false
  }
}

/** Opens the system settings screen where notification access is granted. */
export async function openNotificationCaptureSettings() {
  if (!isNotificationCaptureSupported()) return
  try {
    await plugin.openSettings()
  } catch {
    // The settings screen is missing on some ROMs; nothing to fall back to.
  }
}

/**
 * Drains the queue. The native side clears what it hands over, so each
 * captured message is only ever offered for review once — callers must
 * keep whatever they get.
 */
async function takeCapturedNotifications(): Promise<CapturedNotification[]> {
  if (!isNotificationCaptureSupported()) return []
  try {
    const { items } = await plugin.takePending()
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

// The native queue is cleared by the very act of reading it, so whatever
// comes back has to be kept here — otherwise a page reload (which this app
// does on every login and deep link) would silently drop captures the user
// had not reviewed yet.
const QUEUE_KEY = 'family-platform-capture-queue'
const MAX_QUEUE = 100

export function loadCaptureQueue(): CapturedNotification[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CapturedNotification[]) : []
  } catch {
    return []
  }
}

export function saveCaptureQueue(items: CapturedNotification[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)))
  } catch {
    // Storage full or disabled: the queue is a convenience, not a record.
  }
}

/** Drains anything newly captured into the local review queue. */
export async function syncCaptureQueue(): Promise<CapturedNotification[]> {
  const existing = loadCaptureQueue()
  const captured = await takeCapturedNotifications()
  if (captured.length === 0) return existing
  const seen = new Set(existing.map((item) => item.id))
  const merged = [...existing, ...captured.filter((item) => !seen.has(item.id))]
  merged.sort((a, b) => a.postedAt - b.postedAt)
  const trimmed = merged.slice(-MAX_QUEUE)
  saveCaptureQueue(trimmed)
  return trimmed
}
