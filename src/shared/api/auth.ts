export interface StoredUser {
  id?: number
  email?: string
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
