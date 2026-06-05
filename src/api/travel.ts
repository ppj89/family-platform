import { apiRequest } from './client'

export type Trip = {
  id: number
  familyId: number
  title: string
  startDate: string
  endDate: string
  description?: string
  createdAt: string
}

export type TravelRecord = {
  id: number
  tripId: number
  sortOrder?: number
  title: string
  category?: string
  amount: number
  note?: string
  location: string
  latitude: number
  longitude: number
  recordDate: string
  recordTime?: string
  mediaUrls: string[]
  createdAt: string
}

export type TripPayload = Pick<Trip, 'title' | 'startDate' | 'endDate'> & {
  description?: string
}

export type TravelRecordPayload = Omit<TravelRecord, 'id' | 'tripId' | 'createdAt'>

export function getTrips(familyId = 1) {
  return apiRequest<Trip[]>(`/trips?familyId=${familyId}`)
}

export function createTrip(payload: TripPayload, familyId = 1) {
  return apiRequest<Trip>(`/trips?familyId=${familyId}`, {
    method: 'POST',
    body: payload,
  })
}

export function updateTrip(tripId: number, payload: TripPayload) {
  return apiRequest<Trip>(`/trips/${tripId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteTrip(tripId: number) {
  return apiRequest<void>(`/trips/${tripId}`, {
    method: 'DELETE',
  })
}

export function getTravelRecords(tripId: number) {
  return apiRequest<TravelRecord[]>(`/trips/${tripId}/records`)
}

export function createTravelRecord(tripId: number, payload: TravelRecordPayload) {
  return apiRequest<TravelRecord>(`/trips/${tripId}/records`, {
    method: 'POST',
    body: payload,
  })
}

export function updateTravelRecord(recordId: number, payload: TravelRecordPayload) {
  return apiRequest<TravelRecord>(`/travel-records/${recordId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteTravelRecord(recordId: number) {
  return apiRequest<void>(`/travel-records/${recordId}`, {
    method: 'DELETE',
  })
}
