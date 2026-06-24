import { apiRequest } from '../../../shared/api/client'
import { getReadableFamilyId } from '../../../shared/api/family'
import type { PlaceSearchResult, TravelRecord, TravelRecordPayload, Trip, TripPayload } from '../types'

async function familyQuery() {
  const familyId = await getReadableFamilyId()
  return `?familyId=${encodeURIComponent(String(familyId))}`
}

export async function listTrips() {
  return apiRequest<Trip[]>(`/trips${await familyQuery()}`)
}

export async function createTrip(payload: TripPayload) {
  return apiRequest<Trip>(`/trips${await familyQuery()}`, { method: 'POST', body: payload })
}

export async function updateTrip(id: number, payload: TripPayload) {
  return apiRequest<Trip>(`/trips/${id}`, { method: 'PUT', body: payload })
}

export async function deleteTrip(id: number) {
  return apiRequest<null>(`/trips/${id}`, { method: 'DELETE' })
}

export async function listTravelRecords(tripId: number) {
  return apiRequest<TravelRecord[]>(`/trips/${tripId}/records`)
}

export async function createTravelRecord(tripId: number, payload: TravelRecordPayload) {
  return apiRequest<TravelRecord>(`/trips/${tripId}/records`, { method: 'POST', body: payload })
}

export async function updateTravelRecord(id: number, payload: TravelRecordPayload) {
  return apiRequest<TravelRecord>(`/travel-records/${id}`, { method: 'PUT', body: payload })
}

export async function deleteTravelRecord(id: number) {
  return apiRequest<null>(`/travel-records/${id}`, { method: 'DELETE' })
}

export async function searchPlaces(query: string, limit = 6) {
  if (query.trim().length < 2) return []
  return apiRequest<PlaceSearchResult[]>(`/places/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`)
}
