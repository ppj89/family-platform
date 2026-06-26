export interface StoredUser {
  id?: number
  email?: string
  loginEmail?: string
  nickname?: string
  loginProvider?: string
  platformAdmin?: boolean
}

export interface AuthSessionResponse {
  token?: string
  user?: StoredUser
  userId?: number
  email?: string
  loginEmail?: string
  nickname?: string
  loginProvider?: string
  platformAdmin?: boolean
}

const tokenKey = 'family-platform-access-token'
const userKey = 'family-platform-user'

export function getStoredAuthToken() {
  return window.localStorage.getItem(tokenKey) || window.sessionStorage.getItem(tokenKey) || ''
}

export function hasAuthToken() {
  return Boolean(getStoredAuthToken())
}

export function getStoredUser(): StoredUser | null {
  const raw = window.localStorage.getItem(userKey) || window.sessionStorage.getItem(userKey)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredUser
  } catch {
    return null
  }
}

export function normalizeAuthUser(response: AuthSessionResponse): StoredUser {
  const user = response.user || {}
  return {
    id: response.userId || user.id,
    email: response.email || user.email || '',
    loginEmail: response.loginEmail || user.loginEmail || '',
    nickname: response.nickname || user.nickname || '',
    loginProvider: response.loginProvider || user.loginProvider || '',
    platformAdmin: Boolean(response.platformAdmin || user.platformAdmin),
  }
}

export function storeAuthSession(response: AuthSessionResponse, persistent: boolean) {
  if (!response.token) {
    return
  }

  const target = persistent ? window.localStorage : window.sessionStorage
  const other = persistent ? window.sessionStorage : window.localStorage
  target.setItem(tokenKey, response.token)
  target.setItem(userKey, JSON.stringify(normalizeAuthUser(response)))
  other.removeItem(tokenKey)
  other.removeItem(userKey)
}

export function clearAuthSession() {
  window.localStorage.removeItem(tokenKey)
  window.localStorage.removeItem(userKey)
  window.sessionStorage.removeItem(tokenKey)
  window.sessionStorage.removeItem(userKey)
}
