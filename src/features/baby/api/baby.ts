import { apiRequest } from '../../../shared/api/client'
import { getReadableFamilyId } from '../../../shared/api/family'
import type { BabyPayload, BabyProfile, BabyRecord, BabyRecordPayload } from '../types'

async function familyQuery() {
  const familyId = await getReadableFamilyId()
  return `familyId=${encodeURIComponent(String(familyId))}`
}

export async function listBabies() {
  return apiRequest<BabyProfile[]>(`/babies?${await familyQuery()}`)
}

export async function createBaby(payload: BabyPayload) {
  return apiRequest<BabyProfile>(`/babies?${await familyQuery()}`, { method: 'POST', body: payload })
}

export async function updateBaby(id: number, payload: BabyPayload) {
  return apiRequest<BabyProfile>(`/babies/${id}`, { method: 'PUT', body: payload })
}

export async function deleteBaby(id: number) {
  return apiRequest<null>(`/babies/${id}`, { method: 'DELETE' })
}

export async function listBabyRecords(babyId: number, startDate?: string, endDate?: string) {
  const query = startDate && endDate ? `?startDate=${startDate}&endDate=${endDate}` : ''
  return apiRequest<BabyRecord[]>(`/babies/${babyId}/records${query}`)
}

export async function createBabyRecord(babyId: number, payload: BabyRecordPayload) {
  return apiRequest<BabyRecord>(`/babies/${babyId}/records`, { method: 'POST', body: payload })
}

export async function updateBabyRecord(id: number, payload: BabyRecordPayload) {
  return apiRequest<BabyRecord>(`/baby-records/${id}`, { method: 'PUT', body: payload })
}

export async function deleteBabyRecord(id: number) {
  return apiRequest<null>(`/baby-records/${id}`, { method: 'DELETE' })
}
