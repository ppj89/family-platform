import { apiRequest } from './client'

export interface NotificationItem {
  id: number
  type: string
  title: string
  body: string
  targetDate?: string
  communityPostId?: number | null
  communityCommentId?: number | null
}

export function listUnreadNotifications() {
  return apiRequest<NotificationItem[]>('/notifications?unreadOnly=true')
}

export function markNotificationRead(notificationId: number) {
  return apiRequest<null>(`/notifications/${encodeURIComponent(String(notificationId))}/read`, { method: 'PATCH' })
}

export function markAllNotificationsRead() {
  return apiRequest<null>('/notifications/read-all', { method: 'PATCH' })
}
