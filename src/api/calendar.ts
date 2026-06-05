import { apiRequest } from './client'

export type FamilySchedule = {
  id: number
  familyId: number
  title: string
  calendarBasis: 'solar' | 'lunar' | string
  scheduleDate: string
  scheduleTime?: string
  category?: string
  memberName?: string
  repeatRule?: string
  memo?: string
  createdAt: string
}

export type FamilySchedulePayload = Omit<FamilySchedule, 'id' | 'familyId' | 'createdAt'>

export function getSchedules(startDate: string, endDate: string, familyId = 1) {
  return apiRequest<FamilySchedule[]>(`/schedules?familyId=${familyId}&startDate=${startDate}&endDate=${endDate}`)
}

export function createSchedule(payload: FamilySchedulePayload, familyId = 1) {
  return apiRequest<FamilySchedule>(`/schedules?familyId=${familyId}`, {
    method: 'POST',
    body: payload,
  })
}

export function updateSchedule(scheduleId: number, payload: FamilySchedulePayload) {
  return apiRequest<FamilySchedule>(`/schedules/${scheduleId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteSchedule(scheduleId: number) {
  return apiRequest<void>(`/schedules/${scheduleId}`, {
    method: 'DELETE',
  })
}
