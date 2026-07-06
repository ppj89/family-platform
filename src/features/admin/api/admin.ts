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

export type AccountInquiryStatus = 'OPEN' | 'IN_PROGRESS' | 'REPLIED' | 'CLOSED'

export interface AccountRecoveryInquiry {
  id: number
  createdAt: string
  updatedAt?: string
  email?: string
  nickname?: string
  contact?: string
  recoveryType?: string
  message?: string
  status: AccountInquiryStatus
  replyMessage?: string
  repliedAt?: string
  repliedByUserId?: number
}

export async function listAccountRecoveryInquiries(status: AccountInquiryStatus | 'ALL' = 'OPEN') {
  const query = status === 'ALL' ? '?status=ALL' : `?status=${encodeURIComponent(status)}`
  const response = await apiRequest<{ items?: AccountRecoveryInquiry[] }>(`/admin/account-inquiries${query}`)
  return response.items ?? []
}

export function updateAccountRecoveryInquiryStatus(id: number, status: AccountInquiryStatus) {
  return apiRequest<AccountRecoveryInquiry>(`/admin/account-inquiries/${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    body: { status },
  })
}

export function replyAccountRecoveryInquiry(id: number, message: string) {
  return apiRequest<AccountRecoveryInquiry>(`/admin/account-inquiries/${encodeURIComponent(String(id))}/reply`, {
    method: 'POST',
    body: { message },
  })
}
