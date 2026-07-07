import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import { getStoredUser } from '../../../shared/api/auth'
import { selectReadableFamily } from '../../../shared/api/family'
import { ConfirmDialog, CustomSelect, ToastMessage } from '../../../shared/components'
import {
  acceptFamilyInvitation,
  cancelFamilyInvitation,
  createFamily,
  createFamilyInvitation,
  deleteFamilyMember,
  listFamilies,
  listFamilyMembers,
  listReceivedInvitations,
  listSentInvitations,
  rejectFamilyInvitation,
  updateFamilyMember,
} from '../api/familyGroup'
import type { FamilyGroup, FamilyInvitation, FamilyInvitePayload, FamilyMember } from '../types'
import './family-page.css'

type PermissionKey = 'canRead' | 'canCreate' | 'canUpdate' | 'canDelete'
type PermissionValue = Record<PermissionKey, boolean>
type PendingAction =
  | { type: 'create-family' }
  | { type: 'invite' }
  | { type: 'member-update'; member: FamilyMember }
  | { type: 'member-delete'; member: FamilyMember }
  | { type: 'invite-cancel'; invitation: FamilyInvitation }
  | { type: 'invite-accept'; invitation: FamilyInvitation }
  | { type: 'invite-reject'; invitation: FamilyInvitation }

const permissionKeys: PermissionKey[] = ['canRead', 'canCreate', 'canUpdate', 'canDelete']
const permissionLabels: Record<PermissionKey, string> = {
  canRead: '조회',
  canCreate: '입력',
  canUpdate: '수정',
  canDelete: '삭제',
}

const roleOptions = [
  { label: '가족구성원', value: 'MEMBER' },
  { label: '가족관리자', value: 'FAMILY_ADMIN' },
]

const defaultInvite = (): FamilyInvitePayload => ({
  invite: '',
  role: 'MEMBER',
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: false,
})

function roleText(role: string) {
  return role === 'FAMILY_ADMIN' ? '가족관리자' : '가족구성원'
}

function permissionsText(item: PermissionValue) {
  const parts = permissionKeys.filter((key) => item[key]).map((key) => permissionLabels[key])
  return parts.length ? parts.join('/') : '권한 없음'
}

function invitationTarget(invitation: FamilyInvitation) {
  return invitation.inviteeName || invitation.inviteeEmail || '초대 대상'
}

function pendingCopy(pending: PendingAction | null) {
  if (!pending) return { title: '', body: '', confirmLabel: '확인', danger: false }
  if (pending.type === 'create-family') return { title: '저장', body: '가족그룹을 생성하시겠습니까?', confirmLabel: '저장', danger: false }
  if (pending.type === 'invite') return { title: '초대', body: '가족 초대를 보내시겠습니까?', confirmLabel: '초대', danger: false }
  if (pending.type === 'member-update') return { title: '수정', body: '구성원 권한을 수정하시겠습니까?', confirmLabel: '수정', danger: false }
  if (pending.type === 'member-delete') return { title: '삭제', body: '구성원을 내보내시겠습니까?', confirmLabel: '삭제', danger: true }
  if (pending.type === 'invite-cancel') return { title: '취소', body: '보낸 초대를 취소하시겠습니까?', confirmLabel: '취소', danger: true }
  if (pending.type === 'invite-accept') return { title: '수락', body: '받은 초대를 수락하시겠습니까?', confirmLabel: '수락', danger: false }
  return { title: '거절', body: '받은 초대를 거절하시겠습니까?', confirmLabel: '거절', danger: true }
}

function PermissionChips({
  className = '',
  value,
  onChange,
}: {
  className?: string
  value: PermissionValue
  onChange: (key: PermissionKey, checked: boolean) => void
}) {
  const allChecked = permissionKeys.every((key) => value[key])

  return (
    <div className={`fp-family-permission-chips ${className}`}>
      <button
        className={allChecked ? 'active' : ''}
        type="button"
        onClick={() => permissionKeys.forEach((key) => onChange(key, !allChecked))}
      >
        전체
      </button>
      {permissionKeys.map((key) => (
        <button className={value[key] ? 'active' : ''} key={key} type="button" onClick={() => onChange(key, !value[key])}>
          {permissionLabels[key]}
        </button>
      ))}
    </div>
  )
}

export function FamilyPage() {
  const [families, setFamilies] = useState<FamilyGroup[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [receivedInvites, setReceivedInvites] = useState<FamilyInvitation[]>([])
  const [sentInvites, setSentInvites] = useState<FamilyInvitation[]>([])
  const [familyName, setFamilyName] = useState('')
  const [inviteForm, setInviteForm] = useState<FamilyInvitePayload>(() => defaultInvite())
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const family = families[0]
  const confirm = pendingCopy(pending)
  const storedUser = getStoredUser()
  const currentUserId = storedUser?.id
  const currentUserEmail = (storedUser?.email || storedUser?.loginEmail || '').toLowerCase()
  const isCurrentMember = (member: FamilyMember) => Boolean(
    (currentUserId && member.userId === currentUserId) ||
    (currentUserEmail && member.email?.toLowerCase() === currentUserEmail),
  )
  const currentMember = members.find(isCurrentMember) || null
  const canManageFamily = Boolean(storedUser?.platformAdmin || currentMember?.role === 'FAMILY_ADMIN')

  const memberCountText = useMemo(() => `${members.length}명`, [members.length])

  async function loadAll() {
    setLoading(true)
    try {
      const [familyList, incoming] = await Promise.all([listFamilies(), listReceivedInvitations()])
      const selectedFamily = selectReadableFamily(familyList)
      const orderedFamilies = selectedFamily
        ? [selectedFamily, ...familyList.filter((item) => item.id !== selectedFamily.id)]
        : familyList
      setFamilies(orderedFamilies)
      setReceivedInvites(incoming)

      if (selectedFamily) {
        const memberList = await listFamilyMembers(selectedFamily.id)
        setMembers(memberList)
        const me = getStoredUser()
        const ownMember = me?.id ? memberList.find((member) => member.userId === me.id) : null
        if (me?.platformAdmin || ownMember?.role === 'FAMILY_ADMIN') {
          setSentInvites(await listSentInvitations(selectedFamily.id))
        } else {
          setSentInvites([])
        }
      } else {
        setMembers([])
        setSentInvites([])
      }
    } catch (error) {
      setToastMessage(apiActionMessage(error, '가족그룹 정보를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  function updateInvitePermission(key: PermissionKey, checked: boolean) {
    setInviteForm((current) => ({ ...current, [key]: checked }))
  }

  function updateEditingPermission(key: PermissionKey, checked: boolean) {
    setEditingMember((current) => (current ? { ...current, [key]: checked } : current))
  }

  async function runPending() {
    if (!pending) return
    try {
      if (pending.type === 'create-family') {
        const name = familyName.trim()
        if (!name) return
        await createFamily(name)
        setFamilyName('')
        setToastMessage('가족그룹을 생성했습니다.')
      } else if (pending.type === 'invite' && family) {
        await createFamilyInvitation(family.id, inviteForm)
        setInviteForm(defaultInvite())
        setToastMessage('초대를 보냈습니다.')
      } else if (pending.type === 'member-update' && family && editingMember) {
        await updateFamilyMember(family.id, pending.member.id, {
          userId: editingMember.userId,
          role: editingMember.role,
          canRead: editingMember.canRead,
          canCreate: editingMember.canCreate,
          canUpdate: editingMember.canUpdate,
          canDelete: editingMember.canDelete,
        })
        setEditingMember(null)
        setToastMessage('권한을 수정했습니다.')
      } else if (pending.type === 'member-delete' && family) {
        await deleteFamilyMember(family.id, pending.member.id)
        setToastMessage('구성원을 내보냈습니다.')
      } else if (pending.type === 'invite-cancel') {
        await cancelFamilyInvitation(pending.invitation.id)
        setToastMessage('초대를 취소했습니다.')
      } else if (pending.type === 'invite-accept') {
        await acceptFamilyInvitation(pending.invitation.id)
        setToastMessage('초대를 수락했습니다.')
      } else if (pending.type === 'invite-reject') {
        await rejectFamilyInvitation(pending.invitation.id)
        setToastMessage('초대를 거절했습니다.')
      }
      await loadAll()
      window.dispatchEvent(new CustomEvent('family-platform-notifications-refresh'))
    } catch (error) {
      setToastMessage(apiActionMessage(error, '처리하지 못했습니다.'))
    } finally {
      setPending(null)
    }
  }

  function submitCreateFamily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending({ type: 'create-family' })
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending({ type: 'invite' })
  }

  return (
    <section className="fp-family fp-card">
      <header className="fp-family-header">
        <div>
          <h2>가족그룹</h2>
          <p>{family?.name || '가족 공유 운영'}</p>
        </div>
        <button className="fp-button fp-button-muted fp-family-refresh" type="button" disabled={loading} onClick={loadAll}>
          새로고침
        </button>
      </header>

      {!family ? (
        <div className="fp-family-layout single">
          <form className="fp-family-panel fp-family-create-panel" onSubmit={submitCreateFamily}>
            <h3>가족그룹 만들기</h3>
            <label className="fp-field">
              <span>가족그룹 이름 <em className="fp-required-mark">*</em></span>
              <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} required />
            </label>
            <button className="fp-button fp-button-primary" type="submit">저장</button>
          </form>
          <ReceivedInvites invites={receivedInvites} onAccept={(invitation) => setPending({ type: 'invite-accept', invitation })} onReject={(invitation) => setPending({ type: 'invite-reject', invitation })} />
        </div>
      ) : (
        <>
          <div className="fp-family-layout">
            <section className="fp-family-panel fp-family-members">
              <div className="fp-family-panel-title">
                <h3>구성원</h3>
                <span>{memberCountText}</span>
              </div>

              <div className="fp-family-list">
                {members.length ? (
                  members.map((member) => {
                    const isSelf = isCurrentMember(member)
                    return (
                      <article className="fp-family-row" key={member.id}>
                        {editingMember?.id === member.id ? (
                          <>
                            <div className="fp-family-edit-fields">
                              <CustomSelect
                                className="fp-family-role-select"
                                label="역할"
                                options={roleOptions}
                                value={editingMember.role}
                                onChange={(value) => setEditingMember((current) => (current ? { ...current, role: value } : current))}
                              />
                              <PermissionChips value={editingMember} onChange={updateEditingPermission} />
                            </div>
                            <div className="fp-row-actions">
                              <button className="fp-button fp-button-primary fp-button-small" type="button" onClick={() => setPending({ type: 'member-update', member })}>
                                저장
                              </button>
                              <button className="fp-button fp-button-muted fp-button-small" type="button" onClick={() => setEditingMember(null)}>
                                취소
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <strong className={`fp-family-member-name${isSelf ? ' self' : ''}`}>
                                <span>{member.nickname || member.email || `사용자 ${member.userId}`}</span>
                                {isSelf ? <em>(본인)</em> : null}
                              </strong>
                              <p>{member.email || '이메일 없음'}</p>
                              <small>{roleText(member.role)} · {permissionsText(member)}</small>
                            </div>
                            <div className="fp-row-actions">
                              {canManageFamily ? (
                                <>
                                  <button className="fp-button fp-button-muted fp-button-small" type="button" onClick={() => setEditingMember(member)}>
                                    권한
                                  </button>
                                  <button className="fp-button fp-button-danger fp-button-small" type="button" onClick={() => setPending({ type: 'member-delete', member })}>
                                    내보내기
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </>
                        )}
                      </article>
                    )
                  })
                ) : (
                  <p className="fp-empty-text">등록된 구성원이 없습니다.</p>
                )}
              </div>
            </section>

            <section className="fp-family-panel fp-family-invite">
              <h3>{canManageFamily ? '초대' : '내 권한'}</h3>
              {canManageFamily ? (
                <form className="fp-family-invite-form" onSubmit={submitInvite}>
                  <label className="fp-field">
                    <span>이메일 또는 닉네임 <em className="fp-required-mark">*</em></span>
                    <input value={inviteForm.invite} onChange={(event) => setInviteForm((current) => ({ ...current, invite: event.target.value }))} required />
                  </label>
                  <CustomSelect
                    className="fp-family-role-select"
                    label="역할"
                    options={roleOptions}
                    value={inviteForm.role}
                    onChange={(value) => setInviteForm((current) => ({ ...current, role: value }))}
                  />
                  <PermissionChips value={inviteForm} onChange={updateInvitePermission} />
                  <button className="fp-button fp-button-primary fp-family-invite-submit" type="submit">초대 보내기</button>
                </form>
              ) : (
                <div className="fp-family-readonly-note">
                  <strong>{roleText(currentMember?.role || 'MEMBER')}</strong>
                  <p>{currentMember ? permissionsText(currentMember) : '가족관리자가 부여한 권한으로 이용할 수 있습니다.'}</p>
                </div>
              )}

              {canManageFamily ? (
                <section className="fp-family-subsection">
                  <h4>보낸 초대</h4>
                  <div className="fp-family-list">
                    {sentInvites.length ? (
                      sentInvites.map((invitation) => (
                        <article className="fp-family-row compact" key={invitation.id}>
                          <div>
                            <strong>{invitationTarget(invitation)}</strong>
                            <p>{roleText(invitation.role)} · {permissionsText(invitation)}</p>
                          </div>
                          <div className="fp-row-actions">
                            <button className="fp-button fp-button-danger fp-button-small" type="button" onClick={() => setPending({ type: 'invite-cancel', invitation })}>
                              취소
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="fp-empty-text">대기 중인 보낸 초대가 없습니다.</p>
                    )}
                  </div>
                </section>
              ) : null}
            </section>
          </div>

          <ReceivedInvites invites={receivedInvites} onAccept={(invitation) => setPending({ type: 'invite-accept', invitation })} onReject={(invitation) => setPending({ type: 'invite-reject', invitation })} />
        </>
      )}

      {pending ? (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onCancel={() => setPending(null)}
          onConfirm={runPending}
        />
      ) : null}

      <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />
    </section>
  )
}

function ReceivedInvites({
  invites,
  onAccept,
  onReject,
}: {
  invites: FamilyInvitation[]
  onAccept: (invitation: FamilyInvitation) => void
  onReject: (invitation: FamilyInvitation) => void
}) {
  return (
    <section className="fp-family-panel fp-family-received">
      <h3>받은 초대</h3>
      <div className="fp-family-list">
        {invites.length ? (
          invites.map((invitation) => (
            <article className="fp-family-row" key={invitation.id}>
              <div>
                <strong>{invitation.familyName}</strong>
                <p>{invitation.inviterName || '초대한 사용자'}</p>
                <small>{roleText(invitation.role)} · {permissionsText(invitation)}</small>
              </div>
              <div className="fp-row-actions">
                <button className="fp-button fp-button-primary fp-button-small" type="button" onClick={() => onAccept(invitation)}>
                  수락
                </button>
                <button className="fp-button fp-button-danger fp-button-small" type="button" onClick={() => onReject(invitation)}>
                  거절
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="fp-empty-text">받은 초대가 없습니다.</p>
        )}
      </div>
    </section>
  )
}

export default FamilyPage
