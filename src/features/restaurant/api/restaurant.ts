import { apiRequest } from '../../../shared/api/client'
import { getReadableFamilyId } from '../../../shared/api/family'
import type { PlaceSearchResult, RestaurantItem, RestaurantPayload } from '../types'

async function familyQuery() {
  const familyId = await getReadableFamilyId()
  return `familyId=${encodeURIComponent(familyId)}`
}

export async function listRestaurants() {
  const query = await familyQuery()
  return apiRequest<RestaurantItem[]>(`/restaurants?${query}`)
}

export async function createRestaurant(payload: RestaurantPayload) {
  const query = await familyQuery()
  return apiRequest<RestaurantItem>(`/restaurants?${query}`, { method: 'POST', body: payload })
}

export function updateRestaurant(id: number, payload: RestaurantPayload) {
  return apiRequest<RestaurantItem>(`/restaurants/${id}`, { method: 'PUT', body: payload })
}

export function deleteRestaurant(id: number) {
  return apiRequest<null>(`/restaurants/${id}`, { method: 'DELETE' })
}

export async function searchPlaces(query: string, limit = 6) {
  if (query.trim().length < 2) return []
  return apiRequest<PlaceSearchResult[]>(`/places/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`)
}
