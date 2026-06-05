import { apiRequest } from './client'

export type FamilyGroup = {
  id: number
  name: string
  createdAt: string
}

export type FamilyMember = {
  id: number
  familyId: number
  userId: number
  role: string
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  joinedAt: string
}

export type FamilyMemberPayload = Omit<FamilyMember, 'id' | 'familyId' | 'joinedAt'>

export function getFamilies() {
  return apiRequest<FamilyGroup[]>('/families')
}

export function getFamilyMembers(familyId = 1) {
  return apiRequest<FamilyMember[]>(`/families/${familyId}/members`)
}

export function addFamilyMember(payload: FamilyMemberPayload, familyId = 1) {
  return apiRequest<FamilyMember>(`/families/${familyId}/members`, {
    method: 'POST',
    body: payload,
  })
}

export function updateFamilyMember(memberId: number, payload: FamilyMemberPayload, familyId = 1) {
  return apiRequest<FamilyMember>(`/families/${familyId}/members/${memberId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function removeFamilyMember(memberId: number, familyId = 1) {
  return apiRequest<void>(`/families/${familyId}/members/${memberId}`, {
    method: 'DELETE',
  })
}
