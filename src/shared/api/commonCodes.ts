import { apiRequest } from './client'
import type { CommonCodeGroupKey } from '../constants/commonCodes'

export interface CommonCodeGroup {
  id: number
  familyId: number
  menuKey: string
  code: string
  name: string
  active: boolean
  createdAt: string
}

export interface CommonCode {
  id: number
  groupId: number
  code: string
  name: string
  sortOrder: number
  active: boolean
  createdAt: string
}

export interface CommonCodeGroupWithCodes extends CommonCodeGroup {
  codes: CommonCode[]
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

export function listCommonCodeGroups(menuKey?: string) {
  const query = menuKey ? `?menuKey=${encodeURIComponent(menuKey)}` : ''
  return apiRequest<CommonCodeGroup[]>(`/common-code-groups${query}`)
}

export function listCommonCodes(groupId: number) {
  return apiRequest<CommonCode[]>(`/common-code-groups/${groupId}/codes`)
}

export async function listCommonCodeGroupsWithCodes() {
  const groups = await listCommonCodeGroups()
  const groupsWithCodes = await Promise.all(groups.map(async (group) => {
    try {
      return { ...group, codes: await listCommonCodes(group.id) }
    } catch {
      return { ...group, codes: [] }
    }
  }))
  return groupsWithCodes
}

export async function listCommonCodeOptionValues(groupKey: CommonCodeGroupKey, fallback: readonly string[]) {
  try {
    const groups = await listCommonCodeGroups(groupKey.menuKey)
    const group = groups.find((item) => item.active && item.code === groupKey.code)
    if (!group) return [...fallback]
    const codes = await listCommonCodes(group.id)
    const values = uniqueValues(
      codes
        .filter((item) => item.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map((item) => item.name),
    )
    return values.length ? values : [...fallback]
  } catch {
    return [...fallback]
  }
}
