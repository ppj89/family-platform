import { apiRequest } from './client'

export type CommonCodeGroup = {
  id: number
  familyId: number
  menuKey: string
  code: string
  name: string
  active: boolean
  createdAt: string
}

export type CommonCode = {
  id: number
  groupId: number
  code: string
  name: string
  sortOrder?: number
  active: boolean
  createdAt: string
}

export type CommonCodeGroupPayload = Omit<CommonCodeGroup, 'id' | 'familyId' | 'createdAt'>
export type CommonCodePayload = Omit<CommonCode, 'id' | 'groupId' | 'createdAt'>

export function getCommonCodeGroups(menuKey: string, familyId = 1) {
  return apiRequest<CommonCodeGroup[]>(`/common-code-groups?familyId=${familyId}&menuKey=${menuKey}`)
}

export function createCommonCodeGroup(payload: CommonCodeGroupPayload, familyId = 1) {
  return apiRequest<CommonCodeGroup>(`/common-code-groups?familyId=${familyId}`, {
    method: 'POST',
    body: payload,
  })
}

export function updateCommonCodeGroup(groupId: number, payload: CommonCodeGroupPayload) {
  return apiRequest<CommonCodeGroup>(`/common-code-groups/${groupId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteCommonCodeGroup(groupId: number) {
  return apiRequest<void>(`/common-code-groups/${groupId}`, {
    method: 'DELETE',
  })
}

export function getCommonCodes(groupId: number) {
  return apiRequest<CommonCode[]>(`/common-code-groups/${groupId}/codes`)
}

export function createCommonCode(groupId: number, payload: CommonCodePayload) {
  return apiRequest<CommonCode>(`/common-code-groups/${groupId}/codes`, {
    method: 'POST',
    body: payload,
  })
}

export function updateCommonCode(groupId: number, codeId: number, payload: CommonCodePayload) {
  return apiRequest<CommonCode>(`/common-code-groups/${groupId}/codes/${codeId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteCommonCode(groupId: number, codeId: number) {
  return apiRequest<void>(`/common-code-groups/${groupId}/codes/${codeId}`, {
    method: 'DELETE',
  })
}
