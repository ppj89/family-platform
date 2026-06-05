import { apiRequest } from './client'

export type FamilyDiary = {
  id: number
  familyId: number
  title: string
  body: string
  diaryDate: string
  weather?: string
  mood?: string
  minTemperature?: number
  maxTemperature?: number
  mediaUrls: string[]
  createdAt: string
}

export type FamilyDiaryPayload = Omit<FamilyDiary, 'id' | 'familyId' | 'createdAt'>

export function getDiaries(startDate: string, endDate: string, familyId = 1) {
  return apiRequest<FamilyDiary[]>(`/diaries?familyId=${familyId}&startDate=${startDate}&endDate=${endDate}`)
}

export function createDiary(payload: FamilyDiaryPayload, familyId = 1) {
  return apiRequest<FamilyDiary>(`/diaries?familyId=${familyId}`, {
    method: 'POST',
    body: payload,
  })
}

export function updateDiary(diaryId: number, payload: FamilyDiaryPayload) {
  return apiRequest<FamilyDiary>(`/diaries/${diaryId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteDiary(diaryId: number) {
  return apiRequest<void>(`/diaries/${diaryId}`, {
    method: 'DELETE',
  })
}
