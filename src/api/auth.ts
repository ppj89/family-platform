import { apiRequest, clearAuthToken, setAuthToken } from './client'

export type AuthResponse = {
  accessToken: string
  userId: number
  email: string
  nickname: string
  platformAdmin: boolean
}

export type LoginPayload = {
  email: string
  password: string
  forceLogin?: boolean
}

export type RegisterPayload = LoginPayload & {
  nickname: string
}

export async function register(payload: RegisterPayload) {
  const response = await apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: payload,
  })
  setAuthToken(response.accessToken)
  return response
}

export async function login(payload: LoginPayload) {
  const response = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: payload,
  })
  setAuthToken(response.accessToken)
  return response
}

export async function me() {
  return apiRequest<AuthResponse>('/auth/me')
}

export async function requestLogout() {
  try {
    await apiRequest<void>('/auth/logout', {
      method: 'POST',
    })
  } finally {
    clearAuthToken()
  }
}

export function logout() {
  void requestLogout()
}
