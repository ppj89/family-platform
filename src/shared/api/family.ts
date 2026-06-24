import { apiRequest } from './client'

export interface FamilyGroup {
  id: number
  name: string
}

const currentFamilyKey = 'family-platform-current-family-id'

export async function getReadableFamilyId() {
  const cached = Number(window.localStorage.getItem(currentFamilyKey) || '')
  if (Number.isFinite(cached) && cached > 0) return cached

  try {
    const families = await apiRequest<FamilyGroup[]>('/families')
    const first = families[0]
    if (!first) {
      window.localStorage.removeItem(currentFamilyKey)
      return 0
    }
    window.localStorage.setItem(currentFamilyKey, String(first.id))
    return first.id
  } catch {
    return 0
  }
}
