import { apiRequest } from './client'

export type BabyProfile = {
  id: number
  familyId: number
  name: string
  gender?: string
  birthDate: string
  memo?: string
  photoUrl?: string
  latestHeightCm?: number
  latestWeightKg?: number
  createdAt: string
}

export type BabyRecord = {
  id: number
  babyId: number
  recordType: string
  recordDate: string
  recordTime?: string
  amountMl?: number
  heightCm?: number
  weightKg?: number
  memo?: string
  mediaUrls: string[]
  createdAt: string
}

export type BabyProfilePayload = Omit<BabyProfile, 'id' | 'familyId' | 'createdAt'>
export type BabyRecordPayload = Omit<BabyRecord, 'id' | 'babyId' | 'createdAt'>

export function getBabies(familyId = 1) {
  return apiRequest<BabyProfile[]>(`/babies?familyId=${familyId}`)
}

export function createBaby(payload: BabyProfilePayload, familyId = 1) {
  return apiRequest<BabyProfile>(`/babies?familyId=${familyId}`, {
    method: 'POST',
    body: payload,
  })
}

export function updateBaby(babyId: number, payload: BabyProfilePayload) {
  return apiRequest<BabyProfile>(`/babies/${babyId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteBaby(babyId: number) {
  return apiRequest<void>(`/babies/${babyId}`, {
    method: 'DELETE',
  })
}

export function getBabyRecords(babyId: number, startDate?: string, endDate?: string) {
  const range = startDate && endDate ? `?startDate=${startDate}&endDate=${endDate}` : ''
  return apiRequest<BabyRecord[]>(`/babies/${babyId}/records${range}`)
}

export function createBabyRecord(babyId: number, payload: BabyRecordPayload) {
  return apiRequest<BabyRecord>(`/babies/${babyId}/records`, {
    method: 'POST',
    body: payload,
  })
}

export function updateBabyRecord(recordId: number, payload: BabyRecordPayload) {
  return apiRequest<BabyRecord>(`/baby-records/${recordId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteBabyRecord(recordId: number) {
  return apiRequest<void>(`/baby-records/${recordId}`, {
    method: 'DELETE',
  })
}
