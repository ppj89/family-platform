import { apiRequest } from '../../../shared/api/client'
import type { FamilyGroup } from '../../family/types'

export interface CurrentUserProfile {
  id: number
  email?: string
  nickname?: string
  loginProvider?: string
  platformAdmin?: boolean
}

export function getCurrentUserProfile() {
  return apiRequest<CurrentUserProfile>('/auth/me')
}

export function listAdminVisibleFamilies() {
  return apiRequest<FamilyGroup[]>('/families')
}
