export interface FamilyGroup {
  id: number
  createdAt?: string
  name: string
  isMember?: boolean
  role?: string
  canRead?: boolean
  canCreate?: boolean
  canUpdate?: boolean
  canDelete?: boolean
}

export interface FamilyMember {
  id: number
  familyId: number
  userId: number
  email?: string
  nickname?: string
  role: string
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  joinedAt: string
}

export interface FamilyInvitation {
  id: number
  familyId: number
  familyName: string
  inviterUserId: number
  inviterName?: string
  inviteeUserId: number
  inviteeEmail?: string
  inviteeName?: string
  role: string
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  status: string
  createdAt: string
  respondedAt?: string
}

export interface FamilyPermissionPayload {
  userId: number
  role: string
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}

export interface FamilyInvitePayload {
  invite: string
  role: string
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}
