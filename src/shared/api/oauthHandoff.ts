// Google refuses to render its login page inside an embedded WebView, so
// the native app has to open that login in an external Chrome Custom Tab.
// Getting the finished login back *into* the app is the hard part: the
// familyplatform:// deep link the backend redirects to only fires when
// Chrome feels like honouring it, and after the multi-page detour through
// Google's own login and consent screens Chrome no longer considers the
// original button tap a live user gesture — so it can silently refuse,
// stranding the user on a Chrome tab with a finished login they can't use.
//
// So the deep link is treated as a bonus, not the mechanism. Before opening
// the Custom Tab the app generates an id, hands it to the backend, and the
// backend parks the finished login under it. Whenever the app is
// foregrounded again — via the deep link, the back button, or the task
// switcher — it claims the result itself. Nothing depends on Chrome.

const PENDING_KEY = 'family-platform-oauth-handoff'

function apiBaseUrl() {
  const appWindow = window as Window & { FAMILY_PLATFORM_API_BASE_URL?: string }
  const base = appWindow.FAMILY_PLATFORM_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api'
  return base.replace(/\/+$/, '')
}

export type OauthHandoffResult =
  | { status: 'pending' }
  | { status: 'ready'; token: string; user: Record<string, unknown> }
  | { status: 'error'; message: string }

function randomId() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Creates the id for a login about to start, and remembers it locally. */
export function createOauthHandoffId() {
  const id = randomId()
  try {
    localStorage.setItem(PENDING_KEY, id)
  } catch {
    // Private mode / storage disabled: the deep link is still the fallback.
  }
  return id
}

export function pendingOauthHandoffId() {
  try {
    return localStorage.getItem(PENDING_KEY) || ''
  } catch {
    return ''
  }
}

export function clearOauthHandoffId() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // ignore
  }
}

/**
 * Asks the backend whether the login parked under `id` has finished.
 * The backend hands each result out exactly once, so a 'pending' here just
 * means "not done yet" — it is safe to call repeatedly.
 */
export async function claimOauthHandoff(id: string): Promise<OauthHandoffResult> {
  const response = await fetch(`${apiBaseUrl()}/auth/oauth-handoff/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return { status: 'pending' }
  return (await response.json()) as OauthHandoffResult
}
