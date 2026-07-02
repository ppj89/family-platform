import { apiRequest } from './client'
import type { CommonCodeGroupKey, CommonCodeOption } from '../constants/commonCodes'

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

function uniqueOptions(options: CommonCodeOption[]) {
  const seen = new Set<string>()
  const nextOptions: CommonCodeOption[] = []
  options.forEach((option) => {
    const value = option.value.trim()
    const label = option.label.trim()
    if (!value || seen.has(value)) return
    seen.add(value)
    nextOptions.push({ value, label: label || value })
  })
  return nextOptions
}

function queryValue(value: string) {
  return encodeURIComponent(value)
}

function pathId(id: number) {
  return encodeURIComponent(String(id))
}

export function listCommonCodeGroups(menuKey?: string) {
  const query = menuKey ? `?menuKey=${queryValue(menuKey)}` : ''
  return apiRequest<CommonCodeGroup[]>(`/common-code-groups${query}`)
}

export function listCommonCodes(groupId: number) {
  return apiRequest<CommonCode[]>(`/common-code-groups/${pathId(groupId)}/codes`)
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

export async function listCommonCodeOptions(groupKey: CommonCodeGroupKey, fallback: readonly CommonCodeOption[]) {
  try {
    const groups = await listCommonCodeGroups(groupKey.menuKey)
    const group = groups.find((item) => item.active && item.code === groupKey.code)
    if (!group) return [...fallback]
    const codes = await listCommonCodes(group.id)
    const options = uniqueOptions(
      codes
        .filter((item) => item.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map((item) => ({
          label: item.name || item.code,
          value: item.code || item.name,
        })),
    )
    return options.length ? options : [...fallback]
  } catch {
    return [...fallback]
  }
}
