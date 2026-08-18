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
const currentFamilySnapshotKey = 'family-platform-current-family'

function cachedFamilyId() {
  return Number(window.localStorage.getItem(currentFamilyKey) || '')
}

function setCachedFamilyId(familyId: number) {
  window.localStorage.setItem(currentFamilyKey, String(familyId))
}

function clearCachedFamily() {
  window.localStorage.removeItem(currentFamilyKey)
  window.localStorage.removeItem(currentFamilySnapshotKey)
}

function setCachedFamily(family: FamilyGroup) {
  setCachedFamilyId(family.id)
  window.localStorage.setItem(currentFamilySnapshotKey, JSON.stringify(family))
}

/**
 * The last successfully verified family is kept only as a short-lived UI
 * fallback.  It prevents a transient empty/error response from replacing an
 * existing group-management screen with the "create group" screen.
 */
export function getCachedReadableFamily(): FamilyGroup | null {
  const raw = window.localStorage.getItem(currentFamilySnapshotKey)
  if (!raw) return null
  try {
    const family = JSON.parse(raw) as FamilyGroup
    if (!Number.isFinite(family.id) || family.id <= 0 || !family.name) return null
    return family
  } catch {
    return null
  }
}

export function selectReadableFamily<T extends { id: number; isMember?: boolean; canRead?: boolean }>(families: T[]) {
  if (!families.length) {
    return null
  }

  const cached = cachedFamilyId()
  const candidates = families.filter((family) => family.isMember && (family.canRead ?? true))
  if (!candidates.length) {
    return null
  }
  const selected = candidates.find((family) => family.id === cached) || candidates[0]
  setCachedFamily(selected as unknown as FamilyGroup)
  return selected
}

export async function listReadableFamilies() {
  return apiRequest<FamilyGroup[]>('/families')
}

export async function getReadableFamily() {
  try {
    const selected = selectReadableFamily(await listReadableFamilies())
    return selected
  } catch (error) {
    if (isAuthError(error)) {
      clearCachedFamily()
      return null
    }
    return getCachedReadableFamily()
  }
}

export async function getReadableFamilyId() {
  const family = await getReadableFamily()
  return family?.id || 0
}
