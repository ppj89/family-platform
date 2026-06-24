import { FormEvent, useEffect, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import { ConfirmDialog } from '../../../shared/components'
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

type PendingAction =
  | { type: 'create-family' }
  | { type: 'invite' }
  | { type: 'member-update'; member: FamilyMember }
  | { type: 'member-delete'; member: FamilyMember }
  | { type: 'invite-cancel'; invitation: FamilyInvitation }
  | { type: 'invite-accept'; invitation: FamilyInvitation }
  | { type: 'invite-reject'; invitation: FamilyInvitation }

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

function permissionsText(item: Pick<FamilyMember | FamilyInvitation, 'canRead' | 'canCreate' | 'canUpdate' | 'canDelete'>) {
  const parts = []
  if (item.canRead) parts.push('조회')
  if (item.canCreate) parts.push('입력')
  if (item.canUpdate) parts.push('수정')
  if (item.canDelete) parts.push('삭제')
  return parts.length ? parts.join('/') : '권한 없음'
}

export default function FamilyPage() {
  const [families, setFamilies] = useState<FamilyGroup[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [receivedInvites, setReceivedInvites] = useState<FamilyInvitation[]>([])
  const [sentInvites, setSentInvites] = useState<FamilyInvitation[]>([])
  const [familyName, setFamilyName] = useState('')
  const [inviteForm, setInviteForm] = useState<FamilyInvitePayload>(() => defaultInvite())
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const family = families[0] || null
  async function reload() {
    setLoading(true)
    setMessage('')
    try {
      const [nextFamilies, nextReceived] = await Promise.all([listFamilies(), listReceivedInvitations().catch(() => [])])
      setFamilies(nextFamilies)
      setReceivedInvites(nextReceived)
      const nextFamily = nextFamilies[0]
      if (nextFamily) {
        window.localStorage.setItem('family-platform-current-family-id', String(nextFamily.id))
        const [nextMembers, nextSent] = await Promise.all([
          listFamilyMembers(nextFamily.id).catch(() => []),
          listSentInvitations(nextFamily.id).catch(() => []),
        ])
        setMembers(nextMembers)
        setSentInvites(nextSent)
      } else {
        window.localStorage.removeItem('family-platform-current-family-id')
        setMembers([])
        setSentInvites([])
      }
    } catch (error) {
      setMessage(apiActionMessage(error, '가족그룹 정보를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  function requestCreateFamily(event: FormEvent) {
    event.preventDefault()
    if (!familyName.trim()) {
      setMessage('가족그룹명을 입력해주세요.')
      return
    }
    setPending({ type: 'create-family' })
  }

  function requestInvite(event: FormEvent) {
    event.preventDefault()
    if (!inviteForm.invite.trim()) {
      setMessage('초대할 이메일 또는 닉네임을 입력해주세요.')
      return
    }
    setPending({ type: 'invite' })
  }

  function startMemberEdit(member: FamilyMember) {
    setEditingMember(member)
  }

  async function confirmAction() {
    if (!pending) return
    setLoading(true)
    setMessage('')
    try {
      if (pending.type === 'create-family') {
        const created = await createFamily(familyName.trim())
        setFamilyName('')
        window.localStorage.setItem('family-platform-current-family-id', String(created.id))
        setMessage('가족그룹을 생성했습니다.')
      }
      if (pending.type === 'invite' && family) {
        await createFamilyInvitation(family.id, { ...inviteForm, invite: inviteForm.invite.trim() })
        setInviteForm(defaultInvite())
        setMessage('초대를 보냈습니다.')
      }
      if (pending.type === 'member-update' && family) {
        await updateFamilyMember(family.id, pending.member.id, {
          userId: pending.member.userId,
          role: pending.member.role,
          canRead: pending.member.canRead,
          canCreate: pending.member.canCreate,
          canUpdate: pending.member.canUpdate,
          canDelete: pending.member.canDelete,
        })
        setEditingMember(null)
        setMessage('구성원 권한을 수정했습니다.')
      }
      if (pending.type === 'member-delete' && family) {
        await deleteFamilyMember(family.id, pending.member.id)
        setMessage('구성원을 내보냈습니다.')
      }
      if (pending.type === 'invite-cancel') {
        await cancelFamilyInvitation(pending.invitation.id)
        setMessage('보낸 초대를 취소했습니다.')
      }
      if (pending.type === 'invite-accept') {
        await acceptFamilyInvitation(pending.invitation.id)
        setMessage('초대를 수락했습니다.')
      }
      if (pending.type === 'invite-reject') {
        await rejectFamilyInvitation(pending.invitation.id)
        setMessage('초대를 거절했습니다.')
      }
      setPending(null)
      await reload()
    } catch (error) {
      setMessage(apiActionMessage(error, '가족그룹 작업에 실패했습니다.'))
      setPending(null)
    } finally {
      setLoading(false)
    }
  }

  function updateEditingMember(field: keyof FamilyMember, value: string | boolean) {
    setEditingMember((member) => (member ? { ...member, [field]: value } : member))
  }

  return (
    <section className="fp-family fp-card">
      {loading ? <div className="fp-loading-blocker">처리 중</div> : null}
      <header className="fp-family-header">
        <div>
          <h2>가족그룹</h2>
          <p>{family ? family.name : '그룹 없음'}</p>
        </div>
        <button className="fp-button fp-button-muted" type="button" onClick={reload}>새로고침</button>
      </header>
      {message ? <p className="fp-message">{message}</p> : null}

      {!family ? (
        <form className="fp-family-create" onSubmit={requestCreateFamily}>
          <label className="fp-field">
            가족그룹명
            <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
          </label>
          <button className="fp-button fp-button-primary" type="submit">가족그룹 생성</button>
        </form>
      ) : (
        <div className="fp-family-layout">
          <section className="fp-family-panel">
            <h3>구성원</h3>
            <div className="fp-family-list">
              {members.map((member) => {
                const editing = editingMember?.id === member.id ? editingMember : null
                return (
                  <article className="fp-family-row" key={member.id}>
                    <div>
                      <strong>{member.nickname || member.email || `사용자 ${member.userId}`}</strong>
                      <p>{member.email || '이메일 없음'}</p>
                      <small>{roleText(member.role)} · {permissionsText(member)}</small>
                    </div>
                    {editing ? (
                      <div className="fp-family-edit">
                        <select value={editing.role} onChange={(event) => updateEditingMember('role', event.target.value)}>
                          <option value="MEMBER">가족구성원</option>
                          <option value="FAMILY_ADMIN">가족관리자</option>
                        </select>
                        {(['canRead', 'canCreate', 'canUpdate', 'canDelete'] as const).map((key) => (
                          <label key={key}>
                            <input type="checkbox" checked={Boolean(editing[key])} onChange={(event) => updateEditingMember(key, event.target.checked)} />
                            {key === 'canRead' ? '조회' : key === 'canCreate' ? '입력' : key === 'canUpdate' ? '수정' : '삭제'}
                          </label>
                        ))}
                        <div className="fp-row-actions">
                          <button type="button" onClick={() => setPending({ type: 'member-update', member: editing })}>저장</button>
                          <button type="button" onClick={() => setEditingMember(null)}>취소</button>
                        </div>
                      </div>
                    ) : (
                      <div className="fp-row-actions">
                        <button type="button" onClick={() => startMemberEdit(member)}>권한</button>
                        <button type="button" className="danger" onClick={() => setPending({ type: 'member-delete', member })}>내보내기</button>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>

          <section className="fp-family-panel">
            <h3>초대</h3>
            <form className="fp-family-invite-form" onSubmit={requestInvite}>
              <label className="fp-field">
                이메일 또는 닉네임
                <input value={inviteForm.invite} onChange={(event) => setInviteForm((value) => ({ ...value, invite: event.target.value }))} />
              </label>
              <div className="fp-family-permissions">
                {(['canRead', 'canCreate', 'canUpdate', 'canDelete'] as const).map((key) => (
                  <label key={key}>
                    <input type="checkbox" checked={inviteForm[key]} onChange={(event) => setInviteForm((value) => ({ ...value, [key]: event.target.checked }))} />
                    {key === 'canRead' ? '조회' : key === 'canCreate' ? '입력' : key === 'canUpdate' ? '수정' : '삭제'}
                  </label>
                ))}
              </div>
              <button className="fp-button fp-button-primary" type="submit">초대 보내기</button>
            </form>

            <h4>보낸 초대</h4>
            <div className="fp-family-list compact">
              {sentInvites.length ? sentInvites.map((invite) => (
                <article className="fp-family-row" key={invite.id}>
                  <div>
                    <strong>{invite.inviteeName || invite.inviteeEmail || '초대 대상'}</strong>
                    <small>{permissionsText(invite)}</small>
                  </div>
                  <div className="fp-row-actions">
                    <button type="button" className="danger" onClick={() => setPending({ type: 'invite-cancel', invitation: invite })}>취소</button>
                  </div>
                </article>
              )) : <p className="fp-empty-text">대기 중인 보낸 초대가 없습니다.</p>}
            </div>
          </section>
        </div>
      )}

      <section className="fp-family-panel received">
        <h3>받은 초대</h3>
        <div className="fp-family-list compact">
          {receivedInvites.length ? receivedInvites.map((invite) => (
            <article className="fp-family-row" key={invite.id}>
              <div>
                <strong>{invite.familyName}</strong>
                <p>{invite.inviterName || '초대한 사람'} 님의 초대</p>
                <small>{permissionsText(invite)}</small>
              </div>
              <div className="fp-row-actions">
                <button type="button" onClick={() => setPending({ type: 'invite-accept', invitation: invite })}>수락</button>
                <button type="button" className="danger" onClick={() => setPending({ type: 'invite-reject', invitation: invite })}>거절</button>
              </div>
            </article>
          )) : <p className="fp-empty-text">받은 초대가 없습니다.</p>}
        </div>
      </section>

      {pending ? (
        <ConfirmDialog
          title="가족그룹 작업을 진행할까요?"
          body="확인하면 선택한 작업이 바로 반영됩니다."
          confirmLabel="확인"
          danger={pending.type.includes('delete') || pending.type.includes('reject') || pending.type.includes('cancel')}
          onCancel={() => setPending(null)}
          onConfirm={confirmAction}
        />
      ) : null}
    </section>
  )
}
