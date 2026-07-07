import { apiRequest, isAuthError } from './client'

export interface FamilyGroup {
  id: number
  name: string
  isMember?: boolean
  role?: string
  canRead?: boolean
  canCreate?: boolean
  canUpdate?: boolean
  canDelete?: boolean
}

const currentFamilyKey = 'family-platform-current-family-id'

function cachedFamilyId() {
  return Number(window.localStorage.getItem(currentFamilyKey) || '')
}

function setCachedFamilyId(familyId: number) {
  window.localStorage.setItem(currentFamilyKey, String(familyId))
}

export function selectReadableFamily<T extends { id: number; isMember?: boolean }>(families: T[]) {
  if (!families.length) {
    window.localStorage.removeItem(currentFamilyKey)
    return null
  }

  const cached = cachedFamilyId()
  const memberFamilies = families.filter((family) => family.isMember)
  const candidates = memberFamilies.length ? memberFamilies : families
  const selected = candidates.find((family) => family.id === cached) || candidates[0]
  setCachedFamilyId(selected.id)
  return selected
}

export async function listReadableFamilies() {
  return apiRequest<FamilyGroup[]>('/families')
}

export async function getReadableFamily() {
  const cached = Number(window.localStorage.getItem(currentFamilyKey) || '')

  try {
    const selected = selectReadableFamily(await listReadableFamilies())
    return selected
  } catch (error) {
    if (isAuthError(error)) {
      window.localStorage.removeItem(currentFamilyKey)
      return null
    }
    if (Number.isFinite(cached) && cached > 0) return { id: cached, name: '' }
    return null
  }
}

export async function getReadableFamilyId() {
  const family = await getReadableFamily()
  return family?.id || 0
}
