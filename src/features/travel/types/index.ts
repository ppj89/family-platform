export interface Trip {
  id: number
  familyId: number
  title: string
  startDate: string
  endDate: string
  description?: string | null
  createdAt: string
}

export interface TripPayload {
  title: string
  startDate: string
  endDate: string
  description?: string | null
}

export interface TravelRecord {
  id: number
  tripId: number
  sortOrder?: number | null
  title: string
  category?: string | null
  amount: number
  note?: string | null
  location: string
  latitude: number
  longitude: number
  recordDate: string
  recordTime?: string | null
  mediaUrls: string[]
  createdAt: string
}

export interface TravelRecordPayload {
  sortOrder?: number | null
  title: string
  category?: string | null
  amount: number
  note?: string | null
  location: string
  latitude: number
  longitude: number
  recordDate: string
  recordTime?: string | null
  mediaUrls: string[]
}

export interface PlaceSearchResult {
  id: string
  name: string
  address: string
  latitude: number
  longitude: number
  source: string
}
