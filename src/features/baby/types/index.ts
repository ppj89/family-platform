export interface BabyProfile {
  id: number
  familyId: number
  name: string
  gender?: string | null
  birthDate: string
  memo?: string | null
  photoUrl?: string | null
  latestHeightCm?: number | null
  latestWeightKg?: number | null
  createdAt: string
}

export interface BabyPayload {
  name: string
  gender: string | null
  birthDate: string
  memo?: string | null
  photoUrl?: string | null
  latestHeightCm?: number | null
  latestWeightKg?: number | null
}

export interface BabyRecord {
  id: number
  babyId: number
  recordType: string
  recordDate: string
  recordTime?: string | null
  amountMl?: number | null
  heightCm?: number | null
  weightKg?: number | null
  memo?: string | null
  mediaUrls: string[]
  createdAt: string
}

export interface BabyRecordPayload {
  recordType: string
  recordDate: string
  recordTime?: string | null
  amountMl?: number | null
  heightCm?: number | null
  weightKg?: number | null
  memo?: string | null
  mediaUrls: string[]
}
