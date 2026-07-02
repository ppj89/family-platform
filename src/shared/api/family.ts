import { apiRequest } from './client'

export interface FamilyGroup {
  id: number
  name: string
}

const currentFamilyKey = 'family-platform-current-family-id'

export async function getReadableFamilyId() {
  const cached = Number(window.localStorage.getItem(currentFamilyKey) || '')

  try {
    const families = await apiRequest<FamilyGroup[]>('/families')
    if (!families.length) {
      window.localStorage.removeItem(currentFamilyKey)
      return 0
    }

    const selected = families.find((family) => family.id === cached) || families[0]
    window.localStorage.setItem(currentFamilyKey, String(selected.id))
    return selected.id
  } catch {
    if (Number.isFinite(cached) && cached > 0) return cached
    return 0
  }
}
