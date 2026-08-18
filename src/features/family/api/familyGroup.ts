import { apiRequest } from '../../../shared/api/client'
import type { FamilyGroup, FamilyInvitation, FamilyInvitePayload, FamilyMember, FamilyPermissionPayload } from '../types'

function pathId(id: number) {
  return encodeURIComponent(String(id))
}

export function listFamilies() {
  return apiRequest<FamilyGroup[]>('/families')
}

export function createFamily(name: string) {
  return apiRequest<FamilyGroup>('/families', { method: 'POST', body: { name } })
}

export function listFamilyMembers(familyId: number) {
  return apiRequest<FamilyMember[]>(`/families/${pathId(familyId)}/members`)
}

export function updateFamilyMember(familyId: number, memberId: number, payload: FamilyPermissionPayload) {
  return apiRequest<FamilyMember>(`/families/${pathId(familyId)}/members/${pathId(memberId)}`, { method: 'PUT', body: payload })
}

export function deleteFamilyMember(familyId: number, memberId: number) {
  return apiRequest<null>(`/families/${pathId(familyId)}/members/${pathId(memberId)}`, { method: 'DELETE' })
}

export function listReceivedInvitations() {
  return apiRequest<FamilyInvitation[]>('/family-invitations')
}

export function listSentInvitations(familyId: number) {
  return apiRequest<FamilyInvitation[]>(`/families/${pathId(familyId)}/invitations`)
}

export function createFamilyInvitation(familyId: number, payload: FamilyInvitePayload) {
  return apiRequest<FamilyInvitation>(`/families/${pathId(familyId)}/invitations`, { method: 'POST', body: payload })
}

export function cancelFamilyInvitation(invitationId: number) {
  return apiRequest<{ status: string }>(`/family-invitations/${pathId(invitationId)}`, { method: 'DELETE' })
}

export function acceptFamilyInvitation(invitationId: number) {
  return apiRequest<{ familyId: number; status: string }>(`/family-invitations/${pathId(invitationId)}/accept`, { method: 'POST' })
}

export function rejectFamilyInvitation(invitationId: number) {
  return apiRequest<{ status: string }>(`/family-invitations/${pathId(invitationId)}/reject`, { method: 'POST' })
}
