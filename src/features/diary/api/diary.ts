import { apiRequest } from '../../../shared/api/client'
import { getReadableFamilyId } from '../../../shared/api/family'
import type { DiaryItem, DiaryPayload } from '../types'

async function familyQuery() {
  const familyId = await getReadableFamilyId()
  return `familyId=${encodeURIComponent(String(familyId))}`
}

export async function listDiaries(startDate: string, endDate: string) {
  const query = await familyQuery()
  return apiRequest<DiaryItem[]>(`/diaries?${query}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`)
}

export async function createDiary(payload: DiaryPayload) {
  const query = await familyQuery()
  return apiRequest<DiaryItem>(`/diaries?${query}`, { method: 'POST', body: payload })
}

export function updateDiary(id: number, payload: DiaryPayload) {
  return apiRequest<DiaryItem>(`/diaries/${encodeURIComponent(String(id))}`, { method: 'PUT', body: payload })
}

export function deleteDiary(id: number) {
  return apiRequest<null>(`/diaries/${encodeURIComponent(String(id))}`, { method: 'DELETE' })
}
