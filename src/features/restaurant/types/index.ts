export interface RestaurantItem {
  id: number
  familyId: number
  name: string
  menu?: string | null
  price?: number | null
  rating?: number | null
  visitDate: string
  location?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  scope?: string | null
  memo?: string | null
  mediaUrls: string[]
  createdAt: string
}

export interface RestaurantPayload {
  name: string
  menu?: string | null
  price?: number | null
  rating?: number | null
  visitDate: string
  location?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  scope?: string | null
  memo?: string | null
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
