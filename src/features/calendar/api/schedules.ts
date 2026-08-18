import { apiRequest } from '../../../shared/api/client'
import { getReadableFamilyId } from '../../../shared/api/family'
import type { ScheduleItem, SchedulePayload } from '../types'

async function familyQuery() {
  const familyId = await getReadableFamilyId()
  return `familyId=${encodeURIComponent(String(familyId))}`
}

export async function listSchedules(startDate: string, endDate: string) {
  const family = await familyQuery()
  return apiRequest<ScheduleItem[]>(`/schedules?${family}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`)
}

export async function createSchedule(payload: SchedulePayload) {
  const family = await familyQuery()
  return apiRequest<ScheduleItem>(`/schedules?${family}`, {
    method: 'POST',
    body: payload,
  })
}

export function updateSchedule(id: number, payload: SchedulePayload) {
  return apiRequest<ScheduleItem>(`/schedules/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteSchedule(id: number) {
  return apiRequest<null>(`/schedules/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })
}

export function createScheduleException(id: number, occurrenceDate: string) {
  return apiRequest<null>(`/schedules/${encodeURIComponent(String(id))}/exceptions`, {
    method: 'POST',
    body: { occurrenceDate },
  })
}

export function createScheduleReminders(date: string) {
  return apiRequest<{ created: number }>(`/notifications/schedule-reminders?date=${encodeURIComponent(date)}`, {
    method: 'POST',
  })
}
