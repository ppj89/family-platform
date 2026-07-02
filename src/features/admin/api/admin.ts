import { apiRequest } from '../../../shared/api/client'
import type { FamilyGroup } from '../../family/types'

export interface CurrentUserProfile {
  id: number
  email?: string
  loginEmail?: string
  nickname?: string
  loginProvider?: string
  platformAdmin?: boolean
}

interface CurrentUserProfileResponse {
  id?: number
  userId?: number
  email?: string
  loginEmail?: string
  nickname?: string
  loginProvider?: string
  provider?: string
  platformAdmin?: boolean
}

export async function getCurrentUserProfile() {
  const response = await apiRequest<CurrentUserProfileResponse>('/auth/me')
  return {
    id: response.id ?? response.userId ?? 0,
    email: response.email || '',
    loginEmail: response.loginEmail || '',
    nickname: response.nickname || '',
    loginProvider: response.loginProvider || response.provider || '',
    platformAdmin: Boolean(response.platformAdmin),
  } satisfies CurrentUserProfile
}

export function listAdminVisibleFamilies() {
  return apiRequest<FamilyGroup[]>('/families')
}
