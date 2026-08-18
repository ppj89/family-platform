import { FormEvent, useEffect, useMemo, useState } from 'react'
import { HiOutlineX } from 'react-icons/hi'
import { apiActionMessage } from '../../../shared/api/client'
import { getStoredUser, type StoredUser } from '../../../shared/api/auth'
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
type ShareMenuKey = 'calendar' | 'ledger' | 'travel' | 'baby' | 'diary' | 'restaurant' | 'community'
type ShareMenuValue = { sharedMenuKeys?: string[] }
type PendingAction =
  | { type: 'create-family' }
  | { type: 'invite' }
  | { type: 'member-update'; member: FamilyMember }
  | { type: 'member-delete'; member: FamilyMember; self: boolean; soleAdmin: boolean }
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

const shareMenuOptions: Array<{ key: ShareMenuKey; label: string }> = [
  { key: 'calendar', label: '캘린더' },
  { key: 'ledger', label: '가계부' },
  { key: 'travel', label: '여행' },
  { key: 'baby', label: '육아' },
  { key: 'diary', label: '일기' },
  { key: 'restaurant', label: '맛집' },
  { key: 'community', label: '커뮤니티' },
]

const defaultSharedMenuKeys = shareMenuOptions.map((item) => item.key)

const roleOptions = [
  { label: '구성원', value: 'MEMBER' },
  { label: '그룹관리자', value: 'FAMILY_ADMIN' },
]

const defaultInvite = (): FamilyInvitePayload => ({
  invite: '',
  role: 'MEMBER',
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: false,
  sharedMenuKeys: defaultSharedMenuKeys,
})

function roleText(role: string) {
  return role === 'FAMILY_ADMIN' ? '그룹관리자' : '구성원'
}

function permissionsText(item: PermissionValue) {
  const parts = permissionKeys.filter((key) => item[key]).map((key) => permissionLabels[key])
  return parts.length ? parts.join('/') : '권한 없음'
}

function sharedMenuKeys(item: ShareMenuValue) {
  const keys = item.sharedMenuKeys ?? defaultSharedMenuKeys
  return keys.filter((key): key is ShareMenuKey => shareMenuOptions.some((option) => option.key === key))
}

function sharedMenusText(item: ShareMenuValue) {
  const keys = sharedMenuKeys(item)
  if (!keys.length) return '공유 메뉴 없음'
  if (keys.length === shareMenuOptions.length) return '전체 메뉴 공유'
  return keys.map((key) => shareMenuOptions.find((option) => option.key === key)?.label || key).join('/')
}

function invitationTarget(invitation: FamilyInvitation) {
  return invitation.inviteeName || invitation.inviteeEmail || '초대 대상'
}

function pendingCopy(pending: PendingAction | null) {
  if (!pending) return { title: '', body: '', confirmLabel: '확인', danger: false }
  if (pending.type === 'create-family') return { title: '저장', body: '그룹을 생성하시겠습니까?', confirmLabel: '저장', danger: false }
  if (pending.type === 'invite') return { title: '초대', body: '그룹 초대를 보내시겠습니까?', confirmLabel: '초대', danger: false }
  if (pending.type === 'member-update') return { title: '수정', body: '구성원 권한을 수정하시겠습니까?', confirmLabel: '수정', danger: false }
  if (pending.type === 'member-delete' && pending.self && pending.soleAdmin) {
    return { title: '그룹 나가기', body: '관리자가 나가면 그룹은 해제됩니다. 진행하시겠습니까?', confirmLabel: '나가기', danger: true }
  }
  if (pending.type === 'member-delete' && pending.self) return { title: '그룹 나가기', body: '그룹에서 나가시겠습니까?', confirmLabel: '나가기', danger: true }
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

function ShareMenuChips({
  className = '',
  value,
  onChange,
}: {
  className?: string
  value: ShareMenuValue
  onChange: (key: ShareMenuKey, checked: boolean) => void
}) {
  const keys = sharedMenuKeys(value)
  const allChecked = shareMenuOptions.every((option) => keys.includes(option.key))

  return (
    <div className={`fp-family-share-menu ${className}`}>
      <span>공유 메뉴</span>
      <div className="fp-family-permission-chips">
        <button
          className={allChecked ? 'active' : ''}
          type="button"
          onClick={() => shareMenuOptions.forEach((option) => onChange(option.key, !allChecked))}
        >
          전체
        </button>
        {shareMenuOptions.map((option) => (
          <button className={keys.includes(option.key) ? 'active' : ''} key={option.key} type="button" onClick={() => onChange(option.key, !keys.includes(option.key))}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

type FamilyPageProps = {
  currentUser?: StoredUser | null
}

function fallbackFamilyFor(user: StoredUser | null | undefined): FamilyGroup | null {
  if (!user?.familyId || !user.familyName || user.familyCanRead === false) return null
  return {
    id: user.familyId,
    name: user.familyName,
    isMember: true,
    role: user.familyRole,
    canRead: true,
  }
}

export function FamilyPage({ currentUser }: FamilyPageProps) {
  const [families, setFamilies] = useState<FamilyGroup[]>(() => {
    const family = fallbackFamilyFor(currentUser || getStoredUser())
    return family ? [family] : []
  })
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [receivedInvites, setReceivedInvites] = useState<FamilyInvitation[]>([])
  const [sentInvites, setSentInvites] = useState<FamilyInvitation[]>([])
  const [familyName, setFamilyName] = useState('')
  const [inviteForm, setInviteForm] = useState<FamilyInvitePayload>(() => defaultInvite())
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const [, setLoading] = useState(false)

  const family = families[0]
  const confirm = pendingCopy(pending)
  const storedUser = currentUser || getStoredUser()
  const authenticatedUserId = currentUser?.id || getStoredUser()?.id || 0
  // App이 자동 로그인 복원 후 같은 사용자 ID로 권한/가족 정보를 갱신할 수 있습니다.
  // ID와 가족 ID만 의존하면 첫 요청 실패 뒤 갱신된 인증 컨텍스트로 다시 조회하지 않아
  // 그룹 카드가 기존 fallback(0명) 상태에 머물 수 있습니다.
  const familyAuthContextKey = [
    authenticatedUserId,
    storedUser?.familyId || 0,
    storedUser?.familyRole || '',
    storedUser?.familyName || '',
    storedUser?.familyCanRead === false ? 'denied' : 'readable',
    storedUser?.platformAdmin ? 'platform-admin' : 'member',
  ].join(':')
  const currentUserId = storedUser?.id
  const currentUserEmail = (storedUser?.email || storedUser?.loginEmail || '').toLowerCase()
  const isCurrentMember = (member: FamilyMember) => Boolean(
    (currentUserId && member.userId === currentUserId) ||
    (currentUserEmail && member.email?.toLowerCase() === currentUserEmail),
  )
  const currentMember = members.find(isCurrentMember) || null
  const canManageFamily = Boolean(storedUser?.platformAdmin || currentMember?.role === 'FAMILY_ADMIN' || storedUser?.familyRole === 'FAMILY_ADMIN')
  const familyAdminCount = members.filter((member) => member.role === 'FAMILY_ADMIN').length

  const memberCountText = useMemo(() => `${members.length}명`, [members.length])

  async function loadMembersWithRetry(familyId: number) {
    try {
      return await listFamilyMembers(familyId)
    } catch (firstError) {
      // 모바일 WebView가 자동 로그인 세션을 복원하는 순간에는 첫 요청만
      // 실패할 수 있으므로, 실제 빈 구성원으로 표시하기 전에 한 번 재시도한다.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 350))
      try {
        return await listFamilyMembers(familyId)
      } catch {
        throw firstError
      }
    }
  }

  async function loadAll() {
    setLoading(true)
    try {
      // `auth/me` already carries the active family context. Do not make the
      // member list depend on a second family-list request: a mobile resume
      // can cancel that request while the authenticated context remains valid.
      const storedFamily = fallbackFamilyFor(storedUser) || families[0] || null
      let familyList: FamilyGroup[] = []
      let familyListError: unknown = null
      try {
        familyList = await listFamilies()
      } catch (error) {
        familyListError = error
      }
      const selectedFamily = selectReadableFamily(familyList)
      const resolvedFamily = selectedFamily || storedFamily || null
      const orderedFamilies = selectedFamily
        ? [selectedFamily, ...familyList.filter((item) => item.id !== selectedFamily.id)]
        : (familyList.length ? familyList : (storedFamily ? [storedFamily] : []))
      setFamilies(orderedFamilies)

      // 초대 목록 조회가 일시적으로 실패해도 이미 확인한 그룹과 관리자 권한을 비우지 않습니다.
      try {
        setReceivedInvites(await listReceivedInvitations())
      } catch {
        setReceivedInvites([])
      }

      if (resolvedFamily) {
        const memberList = await loadMembersWithRetry(resolvedFamily.id)
        setMembers(memberList)
        const me = storedUser
        const ownMember = me?.id ? memberList.find((member) => member.userId === me.id) : null
        if (me?.platformAdmin || ownMember?.role === 'FAMILY_ADMIN') {
          // 초대 목록 실패가 이미 받아온 구성원 목록을 실패 상태로 만들면 안 된다.
          try {
            setSentInvites(await listSentInvitations(resolvedFamily.id))
          } catch {
            setSentInvites([])
          }
        } else {
          setSentInvites([])
        }
      } else {
        setMembers([])
        setSentInvites([])
        if (familyListError) throw familyListError
      }
    } catch (error) {
      setToastMessage(apiActionMessage(error, '그룹 정보를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [familyAuthContextKey])

  useEffect(() => {
    const fallbackFamily = fallbackFamilyFor(currentUser)
    if (!fallbackFamily) return
    // Auth hydration can finish after this page has mounted. Keep the group
    // visible immediately instead of retaining the create-group state.
    setFamilies((current) => current[0]?.id === fallbackFamily.id ? current : [fallbackFamily])
  }, [currentUser?.familyCanRead, currentUser?.familyId, currentUser?.familyName, currentUser?.familyRole])

  function updateInvitePermission(key: PermissionKey, checked: boolean) {
    setInviteForm((current) => ({ ...current, [key]: checked }))
  }

  function updateEditingPermission(key: PermissionKey, checked: boolean) {
    setEditingMember((current) => (current ? { ...current, [key]: checked } : current))
  }

  function updateInviteSharedMenu(key: ShareMenuKey, checked: boolean) {
    setInviteForm((current) => {
      const keys = sharedMenuKeys(current)
      const next = checked ? Array.from(new Set([...keys, key])) : keys.filter((item) => item !== key)
      return { ...current, sharedMenuKeys: next }
    })
  }

  function updateEditingSharedMenu(key: ShareMenuKey, checked: boolean) {
    setEditingMember((current) => {
      if (!current) return current
      const keys = sharedMenuKeys(current)
      const next = checked ? Array.from(new Set([...keys, key])) : keys.filter((item) => item !== key)
      return { ...current, sharedMenuKeys: next }
    })
  }

  async function runPending() {
    if (!pending) return
    try {
      if (pending.type === 'create-family') {
        const name = familyName.trim()
        if (!name) return
        await createFamily(name)
        setFamilyName('')
        setToastMessage('그룹을 생성했습니다.')
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
          sharedMenuKeys: sharedMenuKeys(editingMember),
        })
        setEditingMember(null)
        setToastMessage('권한을 수정했습니다.')
      } else if (pending.type === 'member-delete' && family) {
        await deleteFamilyMember(family.id, pending.member.id)
        setToastMessage(pending.self ? (pending.soleAdmin ? '그룹이 해제되었습니다.' : '그룹에서 나갔습니다.') : '구성원을 내보냈습니다.')
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

  function requestMemberDelete(member: FamilyMember) {
    const self = isCurrentMember(member)
    setPending({
      type: 'member-delete',
      member,
      self,
      soleAdmin: self && member.role === 'FAMILY_ADMIN' && familyAdminCount <= 1,
    })
  }

  return (
    <section className="fp-family fp-card">
      <header className="fp-family-header">
        <div>
          <h2>그룹관리</h2>
          <p>{family?.name || '공유 운영'}</p>
        </div>
      </header>

      {!family ? (
        <div className="fp-family-layout single">
          <form className="fp-family-panel fp-family-create-panel" onSubmit={submitCreateFamily}>
            <h3>그룹 만들기</h3>
            <label className="fp-field">
              <span>그룹 이름 <em className="fp-required-mark">*</em></span>
              <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} required />
            </label>
            <button className="fp-button fp-button-primary" type="submit">저장</button>
          </form>
          <ReceivedInvites invites={receivedInvites} onAccept={(invitation) => setPending({ type: 'invite-accept', invitation })} onReject={(invitation) => setPending({ type: 'invite-reject', invitation })} />
        </div>
      ) : family ? (
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
                        <div>
                          <strong className={`fp-family-member-name${isSelf ? ' self' : ''}`}>
                            <span>{member.nickname || member.email || `사용자 ${member.userId}`}</span>
                            {isSelf ? <em>(본인)</em> : null}
                          </strong>
                          <p>{member.email || '이메일 없음'}</p>
                          <small>{roleText(member.role)} · {permissionsText(member)} · {sharedMenusText(member)}</small>
                        </div>
                        <div className="fp-row-actions">
                          {canManageFamily ? (
                            <button className="fp-button fp-button-muted fp-button-small" type="button" onClick={() => setEditingMember(member)}>
                              권한
                            </button>
                          ) : null}
                          {isSelf || canManageFamily ? (
                            <button className="fp-button fp-button-danger fp-button-small fp-family-export-button" type="button" onClick={() => requestMemberDelete(member)}>
                              {isSelf ? '그룹 나가기' : '내보내기'}
                            </button>
                          ) : null}
                        </div>
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
                  <ShareMenuChips value={inviteForm} onChange={updateInviteSharedMenu} />
                  <button className="fp-button fp-button-primary fp-family-invite-submit" type="submit">초대 보내기</button>
                </form>
              ) : (
                <div className="fp-family-readonly-note">
                  <strong>{roleText(currentMember?.role || 'MEMBER')}</strong>
                  <p>{currentMember ? `${permissionsText(currentMember)} · ${sharedMenusText(currentMember)}` : '관리자가 부여한 권한으로 이용할 수 있습니다.'}</p>
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
                            <p>{roleText(invitation.role)} · {permissionsText(invitation)} · {sharedMenusText(invitation)}</p>
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
      ) : (
        <div className="fp-family-layout single">
          <div className="fp-family-panel fp-family-create-panel">
            <h3>그룹 정보를 불러오는 중입니다.</h3>
          </div>
        </div>
      )}

      {editingMember ? (
        <div className="fp-family-permission-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEditingMember(null)
        }}>
          <section className="fp-family-permission-dialog" role="dialog" aria-modal="true" aria-labelledby="fp-family-permission-title">
            <header>
              <div>
                <h2 id="fp-family-permission-title">권한 수정</h2>
                <p>{editingMember.nickname || editingMember.email || `사용자 ${editingMember.userId}`}</p>
              </div>
              <button type="button" aria-label="닫기" onClick={() => setEditingMember(null)}><HiOutlineX aria-hidden="true" /></button>
            </header>
            <div className="fp-family-edit-fields">
              <CustomSelect
                className="fp-family-role-select"
                label="역할"
                options={roleOptions}
                value={editingMember.role}
                onChange={(value) => setEditingMember((current) => (current ? { ...current, role: value } : current))}
              />
              <PermissionChips value={editingMember} onChange={updateEditingPermission} />
              <ShareMenuChips value={editingMember} onChange={updateEditingSharedMenu} />
            </div>
            <div className="fp-family-permission-actions">
              <button className="fp-button fp-button-muted" type="button" onClick={() => setEditingMember(null)}>취소</button>
              <button className="fp-button fp-button-primary" type="button" onClick={() => setPending({ type: 'member-update', member: editingMember })}>저장</button>
            </div>
          </section>
        </div>
      ) : null}

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
                <small>{roleText(invitation.role)} · {permissionsText(invitation)} · {sharedMenusText(invitation)}</small>
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
