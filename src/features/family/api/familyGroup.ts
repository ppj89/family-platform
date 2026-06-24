import { apiRequest } from '../../../shared/api/client'
import type { FamilyGroup, FamilyInvitation, FamilyInvitePayload, FamilyMember, FamilyPermissionPayload } from '../types'

export function listFamilies() {
  return apiRequest<FamilyGroup[]>('/families')
}

export function createFamily(name: string) {
  return apiRequest<FamilyGroup>('/families', { method: 'POST', body: { name } })
}

export function listFamilyMembers(familyId: number) {
  return apiRequest<FamilyMember[]>(`/families/${familyId}/members`)
}

export function updateFamilyMember(familyId: number, memberId: number, payload: FamilyPermissionPayload) {
  return apiRequest<FamilyMember>(`/families/${familyId}/members/${memberId}`, { method: 'PUT', body: payload })
}

export function deleteFamilyMember(familyId: number, memberId: number) {
  return apiRequest<null>(`/families/${familyId}/members/${memberId}`, { method: 'DELETE' })
}

export function listReceivedInvitations() {
  return apiRequest<FamilyInvitation[]>('/family-invitations')
}

export function listSentInvitations(familyId: number) {
  return apiRequest<FamilyInvitation[]>(`/families/${familyId}/invitations`)
}

export function createFamilyInvitation(familyId: number, payload: FamilyInvitePayload) {
  return apiRequest<FamilyInvitation>(`/families/${familyId}/invitations`, { method: 'POST', body: payload })
}

export function cancelFamilyInvitation(invitationId: number) {
  return apiRequest<{ status: string }>(`/family-invitations/${invitationId}`, { method: 'DELETE' })
}

export function acceptFamilyInvitation(invitationId: number) {
  return apiRequest<{ familyId: number; status: string }>(`/family-invitations/${invitationId}/accept`, { method: 'POST' })
}

export function rejectFamilyInvitation(invitationId: number) {
  return apiRequest<{ status: string }>(`/family-invitations/${invitationId}/reject`, { method: 'POST' })
}
