import { apiRequest } from '../../../shared/api/client'
import type { FamilyGroup } from '../../family/types'

export interface CurrentUserProfile {
  id: number
  email?: string
  loginEmail?: string
  nickname?: string
  loginProvider?: string
  platformAdmin?: boolean
  familyRole?: string
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
  familyRole?: string
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
    familyRole: response.familyRole || '',
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

export interface ModerationWarning {
  id: number
  reason: string
  sourceType: string
  sourceId?: number
  issuerName: string
  createdAt: string
  cancelled: boolean
  cancelledAt?: string
}

export interface ModerationUser {
  id: number
  email: string
  loginId: string
  nickname: string
  warningCount: number
  suspended: boolean
  suspendedAt?: string
  suspensionReason?: string
  mediaStorageBytes: number
  mediaStorageUnlimited: boolean
  mediaFileSizeUnlimited: boolean
  warnings: ModerationWarning[]
}

export interface ModerationUserPage {
  items: ModerationUser[]
  total: number
  page: number
  pageSize: number
}

export interface ModerationWarningPage {
  items: ModerationWarning[]
  total: number
  page: number
  pageSize: number
}

export async function listModerationUsers(query = '', page = 1, pageSize = 10) {
  const params = new URLSearchParams()
  if (query.trim()) params.set('query', query.trim())
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  const response = await apiRequest<Partial<ModerationUserPage>>(`/admin/moderation/users?${params.toString()}`)
  return {
    items: response.items ?? [],
    total: response.total ?? 0,
    page: response.page ?? page,
    pageSize: response.pageSize ?? pageSize,
  }
}

export async function listModerationWarnings(userId: number, page = 1, pageSize = 10) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const response = await apiRequest<Partial<ModerationWarningPage>>(
    `/admin/moderation/users/${encodeURIComponent(String(userId))}/warnings?${params.toString()}`,
  )
  return {
    items: response.items ?? [],
    total: response.total ?? 0,
    page: response.page ?? page,
    pageSize: response.pageSize ?? pageSize,
  }
}

export function issueModerationWarning(userId: number, reason: string) {
  return apiRequest<ModerationUser>('/admin/moderation/warnings', {
    method: 'POST',
    body: { userId, reason, sourceType: 'MANUAL' },
  })
}

export function cancelModerationWarning(warningId: number) {
  return apiRequest<ModerationUser>(`/admin/moderation/warnings/${encodeURIComponent(String(warningId))}`, {
    method: 'DELETE',
  })
}

export function releaseModerationUser(userId: number) {
  return apiRequest<ModerationUser>(`/admin/moderation/users/${encodeURIComponent(String(userId))}/release`, {
    method: 'POST',
  })
}

export function updateMediaStorageUnlimited(userId: number, unlimited: boolean) {
  return apiRequest<ModerationUser>(`/admin/media-storage/users/${encodeURIComponent(String(userId))}`, {
    method: 'PATCH',
    body: { unlimited },
  })
}

export function updateMediaFileSizeUnlimited(userId: number, unlimited: boolean) {
  return apiRequest<ModerationUser>(`/admin/media-storage/users/${encodeURIComponent(String(userId))}/file-size-limit`, {
    method: 'PATCH',
    body: { unlimited },
  })
}

export interface HolidaySyncResult {
  years: number[]
  upserted: number
  skipped: boolean
  message?: string
}

export function syncHolidaysNow(year?: number) {
  return apiRequest<HolidaySyncResult>('/admin/holidays/sync', {
    method: 'POST',
    body: year ? { year } : {},
  })
}

export type ManagedBatchStatus = 'RUNNING' | 'COMPLETED' | 'SKIPPED' | 'FAILED'

export interface ManagedBatchRun {
  startedAt: string
  completedAt?: string
  status: ManagedBatchStatus
  processedCount: number
  message?: string
}

export interface ManagedBatchItem {
  key: string
  label: string
  schedule: string
  description: string
  lastRun?: ManagedBatchRun
}

export async function listManagedBatches() {
  const response = await apiRequest<{ items?: ManagedBatchItem[] }>('/admin/batches')
  return response.items ?? []
}

export function runManagedBatch(batchKey: string) {
  return apiRequest<ManagedBatchRun>(`/admin/batches/${encodeURIComponent(batchKey)}/run`, {
    method: 'POST',
  })
}

export interface AdminHotDealItem {
  source: string
  sourceLabel: string
  title: string
  summary: string
  price: string
  originalUrl: string
  collectedAt: string
}

export interface AdminHotDealSource {
  key: string
  label: string
  listingUrl: string
  collectionEnabled: boolean
}

export interface AdminHotDealVerification {
  items: AdminHotDealItem[]
  sources: AdminHotDealSource[]
  refreshedAt: string
  published: boolean
}

export function getAdminHotDealVerification(refresh = false) {
  return apiRequest<AdminHotDealVerification>(`/admin/community/deals${refresh ? '?refresh=true' : ''}`, { timeoutMs: 90000 })
}

export function updateAdminHotDealPublished(published: boolean) {
  return apiRequest<{ published: boolean }>('/admin/community/deals/publish', {
    method: 'PATCH',
    body: { published },
  })
}

export interface AnalyticsHourBucket {
  hour: number
  visitors: number
}

export interface AnalyticsTrendBucket {
  label: string
  visitors: number
}

export interface AnalyticsMenuBucket {
  menuKey: string
  count: number
}

export interface AnalyticsChangeBucket {
  menuKey: string
  entityType: string
  action: string
  count: number
}

export interface AnalyticsActivityItem {
  occurredAt: string
  actor: string
  actorLogin?: string
  menuKey: string
  eventType: string
  entityType?: string
  action: string
  route?: string
}

export interface AnalyticsRegistrationItem {
  id: number
  loginId: string
  nickname: string
  provider: string
  status: 'ACTIVE' | 'WITHDRAWN'
  createdAt: string
}

export interface AnalyticsDashboard {
  date: string
  period: 'day' | 'week' | 'month' | 'year'
  rangeStart: string
  rangeEnd: string
  visitors: number
  activeUsers: number
  registeredUsers: number
  withdrawnUsers: number
  visitorsByHour: AnalyticsHourBucket[]
  visitorTrend: AnalyticsTrendBucket[]
  menuAccess: AnalyticsMenuBucket[]
  dataChanges: AnalyticsChangeBucket[]
  recentRegistrations: AnalyticsRegistrationItem[]
  recentActivity: AnalyticsActivityItem[]
  activityTotal: number
  page: number
  pageSize: number
}

export interface AnalyticsDashboardQuery {
  date: string
  period: 'day' | 'week' | 'month' | 'year'
  userQuery?: string
  page?: number
  pageSize?: number
}

export type AnalyticsActivityDetailType = 'visitor' | 'menu' | 'change'

export interface AnalyticsActivityDetailItem extends AnalyticsActivityItem {
  eventCount?: number
}

export interface AnalyticsActivityDetailResponse {
  type: AnalyticsActivityDetailType
  items: AnalyticsActivityDetailItem[]
  total: number
  page: number
  pageSize: number
}

export interface AnalyticsActivityDetailQuery extends AnalyticsDashboardQuery {
  type: AnalyticsActivityDetailType
  hour?: number
  menuKey?: string
  entityType?: string
  action?: string
}

export type AnalyticsMemberDetailType = 'active' | 'registered'

export interface AnalyticsMemberListResponse {
  type: AnalyticsMemberDetailType
  items: AnalyticsRegistrationItem[]
  total: number
  page: number
  pageSize: number
}

export interface AnalyticsMemberListQuery extends AnalyticsDashboardQuery {
  type: AnalyticsMemberDetailType
}

export function getAnalyticsDashboard(query: AnalyticsDashboardQuery) {
  const params = new URLSearchParams({
    date: query.date,
    period: query.period,
    page: String(query.page || 1),
    pageSize: String(query.pageSize || 30),
  })
  if (query.userQuery?.trim()) params.set('userQuery', query.userQuery.trim())
  return apiRequest<AnalyticsDashboard>(`/admin/analytics/dashboard?${params.toString()}`)
}

export function getAnalyticsActivityDetails(query: AnalyticsActivityDetailQuery) {
  const params = new URLSearchParams({
    type: query.type,
    date: query.date,
    period: query.period,
    page: String(query.page || 1),
    pageSize: String(query.pageSize || 30),
  })
  if (query.userQuery?.trim()) params.set('userQuery', query.userQuery.trim())
  if (typeof query.hour === 'number') params.set('hour', String(query.hour))
  if (query.menuKey) params.set('menuKey', query.menuKey)
  if (query.entityType) params.set('entityType', query.entityType)
  if (query.action) params.set('action', query.action)
  return apiRequest<AnalyticsActivityDetailResponse>(`/admin/analytics/detail?${params.toString()}`)
}

export function getAnalyticsMembers(query: AnalyticsMemberListQuery) {
  const params = new URLSearchParams({
    type: query.type,
    date: query.date,
    period: query.period,
    page: String(query.page || 1),
    pageSize: String(query.pageSize || 30),
  })
  if (query.userQuery?.trim()) params.set('userQuery', query.userQuery.trim())
  return apiRequest<AnalyticsMemberListResponse>(`/admin/analytics/members?${params.toString()}`)
}

export interface AdminUserSearchItem {
  id: number
  loginId: string
  nickname: string
  provider: string
  createdAt: string
}

export interface AdminUserDataRecord {
  menuKey: string
  entityType: string
  entityId: number
  action: string
  createdAt: string
  snapshot?: Record<string, unknown>
}

export interface AdminUserDataResponse {
  user: AdminUserSearchItem
  items: AdminUserDataRecord[]
  total: number
}

export async function searchAdminUsers(query: string) {
  const response = await apiRequest<{ items?: AdminUserSearchItem[] }>(`/admin/users/search?query=${encodeURIComponent(query.trim())}`)
  return response.items ?? []
}

export function getAdminUserData(userId: number) {
  return apiRequest<AdminUserDataResponse>(`/admin/users/${encodeURIComponent(String(userId))}/data`)
}
