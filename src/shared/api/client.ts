import { clearAuthSession, getStoredAuthToken } from './auth'

export interface ApiError extends Error {
  status?: number
}

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
const apiTimeoutMs = 15000

export async function apiRequest<T>(path: string, options: { method?: ApiMethod; body?: unknown } = {}): Promise<T> {
  const token = getStoredAuthToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), apiTimeoutMs)

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다. 다시 시도해주세요.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }

  if (!response.ok) {
    const message = await response.text()
    if (response.status === 401) {
      clearAuthSession()
      window.dispatchEvent(new CustomEvent('family-platform-auth-invalid'))
    }
    const error = new Error(message || `API ${response.status}`) as ApiError
    error.status = response.status
    throw error
  }

  if (response.status === 204) return null as T
  return response.json() as Promise<T>
}

export async function apiFormRequest<T>(path: string, formData: FormData, options: { method?: Extract<ApiMethod, 'POST' | 'PUT' | 'PATCH'> } = {}): Promise<T> {
  const token = getStoredAuthToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), apiTimeoutMs)

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method || 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다. 다시 시도해주세요.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }

  if (!response.ok) {
    const message = await response.text()
    if (response.status === 401) {
      clearAuthSession()
      window.dispatchEvent(new CustomEvent('family-platform-auth-invalid'))
    }
    const error = new Error(message || `API ${response.status}`) as ApiError
    error.status = response.status
    throw error
  }

  if (response.status === 204) return null as T
  return response.json() as Promise<T>
}

export function apiActionMessage(error: unknown, fallback: string) {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as ApiError).status) : 0
  const raw = error instanceof Error ? error.message : String(error || '')
  if (status === 401) return ''
  if (status === 403) return '권한이 없어 처리할 수 없습니다.'
  if (status === 404) return '대상 데이터를 찾을 수 없습니다.'
  if (status === 400 || raw.includes('required') || raw.includes('invalid')) return '입력값을 확인해주세요.'
  if (status >= 500 || raw.includes('database')) return '시스템 문제로 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
  return fallback
}

export function isAuthError(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as ApiError).status) : 0
  const raw = error instanceof Error ? error.message : String(error || '')
  return status === 401 || raw.includes('invalid session') || raw.includes('로그인이 필요합니다')
}
