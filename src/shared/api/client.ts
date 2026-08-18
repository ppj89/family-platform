import { clearAuthSession, getStoredAuthToken } from './auth'

export interface ApiError extends Error {
  status?: number
}

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ApiRequestOptions = {
  method?: ApiMethod
  body?: unknown
  timeoutMs?: number
}

let activeDataViewMenuKey = ''
let pendingDataViewMenuKey = ''
let pendingDataViewTimer: number | undefined

function dataViewPathMatchesMenu(path: string, menuKey: string) {
  switch (menuKey) {
    case 'calendar': return path.startsWith('/schedules') || path.startsWith('/holidays')
    case 'ledger': return path.startsWith('/ledger')
    case 'travel': return path.startsWith('/trips') || path.startsWith('/travel-records')
    case 'baby': return path.startsWith('/babies') || path.startsWith('/baby-records')
    case 'diary': return path.startsWith('/diaries')
    case 'restaurant': return path.startsWith('/restaurants')
    case 'community': return path.startsWith('/community')
    case 'hotdeal': return path.startsWith('/community/deals')
    case 'family': return path.startsWith('/families') || path.startsWith('/family-invitations')
    case 'home': return path.startsWith('/ledger') || path.startsWith('/schedules') || path.startsWith('/babies') || path.startsWith('/trips')
    default: return false
  }
}

function armDataView(menuKey: string) {
  if (!menuKey) return
  pendingDataViewMenuKey = menuKey
  if (pendingDataViewTimer !== undefined) window.clearTimeout(pendingDataViewTimer)
  pendingDataViewTimer = window.setTimeout(() => {
    pendingDataViewMenuKey = ''
    pendingDataViewTimer = undefined
  }, 5000)
}

function consumeDataViewFor(path: string, method: ApiMethod) {
  if (method !== 'GET' || !pendingDataViewMenuKey || !dataViewPathMatchesMenu(path, pendingDataViewMenuKey)) return ''
  const menuKey = pendingDataViewMenuKey
  pendingDataViewMenuKey = ''
  if (pendingDataViewTimer !== undefined) window.clearTimeout(pendingDataViewTimer)
  pendingDataViewTimer = undefined
  return menuKey
}

// 화면 전환 자체가 아니라, 현재 화면이 실제 데이터를 조회한 경우만
// 운영 통계에 남기기 위한 컨텍스트다.
export function setApiDataViewMenuKey(menuKey?: string) {
  const nextMenuKey = menuKey || ''
  if (nextMenuKey && nextMenuKey !== activeDataViewMenuKey) armDataView(nextMenuKey)
  if (!nextMenuKey && pendingDataViewTimer !== undefined) window.clearTimeout(pendingDataViewTimer)
  if (!nextMenuKey) {
    pendingDataViewMenuKey = ''
    pendingDataViewTimer = undefined
  }
  activeDataViewMenuKey = nextMenuKey
}

// 메뉴 진입 외에 사용자가 조회·검색을 다시 실행했을 때 한 번 더 집계한다.
export function markApiDataViewQuery() {
  armDataView(activeDataViewMenuKey)
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
const apiTimeoutMs = 15000
// 사진·영상 업로드는 모바일 네트워크에서 15초를 넘길 수 있으므로 별도 시간을 사용합니다.
const mediaUploadTimeoutMs = 180000

function normalizeApiErrorMessage(raw: string, status: number) {
  const text = raw.trim()
  let message = text

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string }
      message = parsed.message || parsed.error || text
    } catch {
      message = text
    }
  }

  const normalized = message.toLowerCase()
  if (normalized.includes('email verification required')) return '이메일 인증이 필요합니다. 메일에서 인증을 완료한 뒤 로그인해주세요.'
  if (normalized.includes('verification email accepted')) return '인증 메일을 보냈습니다. 메일에서 인증을 완료한 뒤 로그인해주세요.'
  if (normalized.includes('nickname is already registered')) return '이미 사용 중인 닉네임입니다.'
  if (normalized.includes('email is already registered') || normalized.includes('already registered')) return '이미 가입된 이메일입니다.'
  if (normalized.includes('active session') || normalized.includes('duplicate session')) return '이미 로그인된 세션이 있습니다.'
  if (normalized.includes('invalid session')) return '로그인이 필요합니다.'
  if (normalized.includes('invalid credentials')) return '이메일 또는 비밀번호를 확인해주세요.'
  if (normalized.includes('free board post rate limit')) return '자유게시판 글은 10분에 1건만 등록할 수 있습니다.'
  if (normalized.includes('rate limit')) return '요청이 많습니다. 잠시 후 다시 시도해주세요.'
  if (normalized.includes('required') || normalized.includes('invalid') || status === 400) return '입력값을 확인해주세요.'
  if (status === 403) return '권한이 없어 처리할 수 없습니다.'
  if (status === 404) return '대상 데이터를 찾을 수 없습니다.'
  if (status >= 500 || normalized.includes('database')) return '시스템 문제로 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
  return message || `API ${status}`
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = getStoredAuthToken()
  const method = options.method || 'GET'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const dataViewMenuKey = consumeDataViewFor(path, method)
  if (dataViewMenuKey) headers['X-Family-Platform-Data-View'] = dataViewMenuKey
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? apiTimeoutMs)

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
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
    const message = normalizeApiErrorMessage(await response.text(), response.status)
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
  const timeout = window.setTimeout(() => controller.abort(), mediaUploadTimeoutMs)

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
    const message = normalizeApiErrorMessage(await response.text(), response.status)
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
  if (status === 413 || raw.includes('file is too large')) return '첨부 파일 크기를 확인해주세요.'
  if (status === 400 || raw.includes('required') || raw.includes('invalid')) return '입력값을 확인해주세요.'
  if (status >= 500 || raw.includes('database')) return '시스템 문제로 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
  return fallback
}

export function isAuthError(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as ApiError).status) : 0
  const raw = error instanceof Error ? error.message : String(error || '')
  return status === 401 || raw.includes('invalid session') || raw.includes('로그인이 필요합니다')
}
