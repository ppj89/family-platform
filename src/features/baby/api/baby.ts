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
  return apiRequest<BabyProfile>(`/babies/${encodeURIComponent(String(id))}`, { method: 'PUT', body: payload })
}

export async function deleteBaby(id: number) {
  return apiRequest<null>(`/babies/${encodeURIComponent(String(id))}`, { method: 'DELETE' })
}

export async function listBabyRecords(babyId: number, startDate?: string, endDate?: string) {
  const query = startDate && endDate
    ? `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
    : ''
  return apiRequest<BabyRecord[]>(`/babies/${encodeURIComponent(String(babyId))}/records${query}`)
}

export async function createBabyRecord(babyId: number, payload: BabyRecordPayload) {
  return apiRequest<BabyRecord>(`/babies/${encodeURIComponent(String(babyId))}/records`, { method: 'POST', body: payload })
}

export async function updateBabyRecord(id: number, payload: BabyRecordPayload) {
  return apiRequest<BabyRecord>(`/baby-records/${encodeURIComponent(String(id))}`, { method: 'PUT', body: payload })
}

export async function deleteBabyRecord(id: number) {
  return apiRequest<null>(`/baby-records/${encodeURIComponent(String(id))}`, { method: 'DELETE' })
}
