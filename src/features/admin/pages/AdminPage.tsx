import { type DragEvent, useEffect, useState } from 'react'
import { CgChevronDown, CgChevronUp } from 'react-icons/cg'
import { apiActionMessage } from '../../../shared/api/client'
import {
  createCommonCode,
  createCommonCodeGroup,
  deleteCommonCode,
  deleteCommonCodeGroup,
  listCommonCodeGroupsWithCodes,
  updateCommonCode,
  updateCommonCodeGroup,
  type CommonCode,
  type CommonCodeGroupWithCodes,
} from '../../../shared/api/commonCodes'
import { ConfirmDialog, ToastMessage } from '../../../shared/components'
import type { FamilyGroup } from '../../family/types'
import {
  getCurrentUserProfile,
  listAccountRecoveryInquiries,
  listAdminVisibleFamilies,
  replyAccountRecoveryInquiry,
  updateAccountRecoveryInquiryStatus,
  type AccountInquiryStatus,
  type AccountRecoveryInquiry,
  type CurrentUserProfile,
} from '../api/admin'
import './admin-page.css'

type AdminTab = 'menus' | 'codes' | 'home' | 'account-inquiries'

type AdminMenuItem = {
  key: string
  label: string
  description: string
  roles: string[]
  visible: boolean
}

type ConfirmState = {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

type AdminCodeGroup = {
  menuKey: string
  code: string
  name: string
  active: boolean
}

type AdminCodeDraft = {
  code: string
  name: string
}

const adminTabs: Array<{ key: AdminTab; label: string }> = [
  { key: 'menus', label: '메뉴관리' },
  { key: 'codes', label: '공통코드' },
  { key: 'home', label: '홈구성' },
  { key: 'account-inquiries', label: '계정 문의' },
]

const initialMenus: AdminMenuItem[] = [
  { key: 'home', label: '홈', description: '오늘의 가족 기록', roles: ['총괄관리자', '가족관리자', '가족구성원'], visible: true },
  { key: 'calendar', label: '캘린더', description: '가족 일정 관리', roles: ['가족관리자', '가족구성원'], visible: true },
  { key: 'ledger', label: '가계부', description: '수입, 지출, 카드 내역', roles: ['가족관리자', '가족구성원'], visible: true },
  { key: 'travel', label: '여행', description: '장소, 동선, 비용', roles: ['가족관리자', '가족구성원'], visible: true },
  { key: 'baby', label: '육아', description: '수유, 배변, 성장 기록', roles: ['가족관리자', '가족구성원'], visible: true },
  { key: 'diary', label: '일기', description: '사진, 날씨, 가족 일기', roles: ['가족관리자', '가족구성원'], visible: true },
  { key: 'family', label: '가족그룹', description: '공유와 권한 관리', roles: ['가족관리자'], visible: true },
  { key: 'restaurant', label: '맛집', description: '가족 맛집 공유 리스트', roles: ['가족관리자', '가족구성원'], visible: true },
  { key: 'community', label: '커뮤니티', description: '공지, 자유게시판, 문의사항', roles: ['총괄관리자', '가족관리자', '가족구성원'], visible: true },
  { key: 'admin', label: '관리자', description: '권한과 설정 관리', roles: ['총괄관리자', '가족관리자'], visible: true },
]

const roleOptions = ['총괄관리자', '가족관리자', '가족구성원']

const commonCodeMenus = [
  { key: 'calendar', label: '캘린더' },
  { key: 'ledger', label: '가계부' },
  { key: 'travel', label: '여행' },
  { key: 'baby', label: '육아' },
  { key: 'diary', label: '일기' },
  { key: 'family', label: '가족그룹' },
  { key: 'restaurant', label: '맛집' },
]

function providerLabel(provider?: string) {
  if (provider === 'naver') return '네이버'
  if (provider === 'kakao') return '카카오'
  if (provider === 'google') return '구글'
  if (provider === 'admin') return '관리자 ID'
  return '이메일'
}

const inquiryStatusLabels: Record<AccountInquiryStatus | 'ALL', string> = {
  ALL: '전체',
  OPEN: '대기',
  IN_PROGRESS: '처리중',
  REPLIED: '답변완료',
  CLOSED: '닫힘',
}

function formatInquiryDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function inquiryReplyTarget(item?: AccountRecoveryInquiry | null) {
  if (!item) return ''
  if (item.email) return item.email
  return item.contact?.includes('@') ? item.contact : ''
}

function moveItem(items: AdminMenuItem[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  return next
}

function moveItemToTarget(items: AdminMenuItem[], sourceKey: string, targetKey: string) {
  const sourceIndex = items.findIndex((item) => item.key === sourceKey)
  const targetIndex = items.findIndex((item) => item.key === targetKey)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items
  const next = [...items]
  const [item] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, item)
  return next
}

export default function AdminPage() {
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null)
  const [families, setFamilies] = useState<FamilyGroup[]>([])
  const [menus, setMenus] = useState<AdminMenuItem[]>(initialMenus)
  const [activeTab, setActiveTab] = useState<AdminTab>('menus')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<AdminMenuItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [toastMessage, setToastMessage] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [codeGroups, setCodeGroups] = useState<CommonCodeGroupWithCodes[]>([])
  const [selectedCodeMenuKey, setSelectedCodeMenuKey] = useState(commonCodeMenus[1].key)
  const [selectedCodeGroupId, setSelectedCodeGroupId] = useState<number | null>(null)
  const [groupDraft, setGroupDraft] = useState<AdminCodeGroup>({ menuKey: commonCodeMenus[1].key, code: '', name: '', active: true })
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editingGroupDraft, setEditingGroupDraft] = useState<AdminCodeGroup | null>(null)
  const [codeDraft, setCodeDraft] = useState<AdminCodeDraft>({ code: '', name: '' })
  const [editingCodeId, setEditingCodeId] = useState<number | null>(null)
  const [editingCodeDraft, setEditingCodeDraft] = useState<AdminCodeDraft | null>(null)
  const [commonCodeBusy, setCommonCodeBusy] = useState(false)
  const [accountInquiries, setAccountInquiries] = useState<AccountRecoveryInquiry[]>([])
  const [inquiryStatus, setInquiryStatus] = useState<AccountInquiryStatus | 'ALL'>('OPEN')
  const [inquiriesLoading, setInquiriesLoading] = useState(false)
  const [selectedInquiryId, setSelectedInquiryId] = useState<number | null>(null)
  const [replyMessage, setReplyMessage] = useState('')
  const [draggingMenuKey, setDraggingMenuKey] = useState<string | null>(null)
  const [dragOverMenuKey, setDragOverMenuKey] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      try {
        const [nextProfile, nextFamilies, nextCodeGroups] = await Promise.all([
          getCurrentUserProfile(),
          listAdminVisibleFamilies(),
          listCommonCodeGroupsWithCodes().catch(() => []),
        ])
        if (!alive) return
        setProfile(nextProfile)
        setFamilies(nextFamilies)
        setCodeGroups(nextCodeGroups)
        setSelectedCodeGroupId((current) => current ?? nextCodeGroups.find((group) => group.menuKey === selectedCodeMenuKey)?.id ?? null)
      } catch (error) {
        if (!alive) return
        setToastMessage(apiActionMessage(error, '관리자 정보를 불러오지 못했습니다.'))
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [])

  const visibleMenuCount = menus.filter((menu) => menu.visible).length
  const isPlatformAdmin = Boolean(profile?.platformAdmin)
  const visibleAdminTabs = adminTabs.filter((tab) => tab.key !== 'account-inquiries' || isPlatformAdmin)
  const filteredCodeGroups = codeGroups.filter((group) => group.menuKey === selectedCodeMenuKey)
  const selectedCodeGroup = codeGroups.find((group) => group.id === selectedCodeGroupId) ?? filteredCodeGroups[0] ?? null
  const selectedInquiry = accountInquiries.find((item) => item.id === selectedInquiryId) ?? accountInquiries[0] ?? null
  const selectedReplyTarget = inquiryReplyTarget(selectedInquiry)

  useEffect(() => {
    setGroupDraft((current) => ({ ...current, menuKey: selectedCodeMenuKey }))
    setSelectedCodeGroupId((current) => {
      if (current && codeGroups.some((group) => group.id === current && group.menuKey === selectedCodeMenuKey)) return current
      return codeGroups.find((group) => group.menuKey === selectedCodeMenuKey)?.id ?? null
    })
    setEditingGroupId(null)
    setEditingGroupDraft(null)
    setEditingCodeId(null)
    setEditingCodeDraft(null)
  }, [codeGroups, selectedCodeMenuKey])

  useEffect(() => {
    if (!loading && activeTab === 'account-inquiries' && !isPlatformAdmin) {
      setActiveTab('menus')
      setAccountInquiries([])
      setSelectedInquiryId(null)
    }
  }, [activeTab, isPlatformAdmin, loading])

  useEffect(() => {
    if (activeTab !== 'account-inquiries') return
    if (!isPlatformAdmin) return
    let alive = true
    async function loadInquiries() {
      setInquiriesLoading(true)
      try {
        const items = await listAccountRecoveryInquiries(inquiryStatus)
        if (!alive) return
        setAccountInquiries(items)
        setSelectedInquiryId((current) => (items.some((item) => item.id === current) ? current : items[0]?.id ?? null))
      } catch (error) {
        if (alive && isPlatformAdmin) setToastMessage(apiActionMessage(error, '계정 문의를 불러오지 못했습니다.'))
      } finally {
        if (alive) setInquiriesLoading(false)
      }
    }
    void loadInquiries()
    return () => {
      alive = false
    }
  }, [activeTab, inquiryStatus, isPlatformAdmin])

  function startEdit(menu: AdminMenuItem) {
    setEditingKey(menu.key)
    setDraft({ ...menu, roles: [...menu.roles] })
  }

  function cancelEdit() {
    setEditingKey(null)
    setDraft(null)
  }

  function saveEdit() {
    if (!draft) return
    setMenus((items) => items.map((item) => (item.key === draft.key ? { ...draft } : item)))
    setEditingKey(null)
    setDraft(null)
    setToastMessage('메뉴를 수정했습니다.')
  }

  function requestDelete(menu: AdminMenuItem) {
    setConfirm({
      title: '삭제',
      body: `${menu.label} 메뉴를 삭제하시겠습니까?`,
      confirmLabel: '삭제',
      danger: true,
      onConfirm: () => {
        setMenus((items) => items.filter((item) => item.key !== menu.key))
        if (editingKey === menu.key) cancelEdit()
        setConfirm(null)
        setToastMessage('메뉴를 삭제했습니다.')
      },
    })
  }

  function requestToggleVisible(menu: AdminMenuItem) {
    const nextVisible = !menu.visible
    setConfirm({
      title: nextVisible ? '표시' : '숨기기',
      body: `${menu.label} 메뉴를 ${nextVisible ? '표시하시겠습니까?' : '숨기시겠습니까?'}`,
      confirmLabel: nextVisible ? '표시' : '숨기기',
      onConfirm: () => {
        setMenus((items) => items.map((item) => (item.key === menu.key ? { ...item, visible: nextVisible } : item)))
        setConfirm(null)
        setToastMessage(nextVisible ? '메뉴를 표시했습니다.' : '메뉴를 숨겼습니다.')
      },
    })
  }

  function toggleRole(role: string) {
    if (!draft) return
    setDraft((current) => {
      if (!current) return current
      const exists = current.roles.includes(role)
      const roles = exists ? current.roles.filter((item) => item !== role) : [...current.roles, role]
      return { ...current, roles: roles.length ? roles : current.roles }
    })
  }

  function handleMenuDragStart(event: DragEvent<HTMLElement>, menu: AdminMenuItem) {
    if (editingKey) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', menu.key)
    setDraggingMenuKey(menu.key)
  }

  function handleMenuDragOver(event: DragEvent<HTMLElement>, menu: AdminMenuItem) {
    if (!draggingMenuKey || draggingMenuKey === menu.key) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverMenuKey(menu.key)
  }

  function handleMenuDrop(event: DragEvent<HTMLElement>, menu: AdminMenuItem) {
    event.preventDefault()
    const sourceKey = event.dataTransfer.getData('text/plain') || draggingMenuKey
    setDraggingMenuKey(null)
    setDragOverMenuKey(null)
    if (!sourceKey || sourceKey === menu.key) return
    setMenus((items) => moveItemToTarget(items, sourceKey, menu.key))
    setToastMessage('메뉴 순서를 변경했습니다.')
  }

  function handleMenuDragEnd() {
    setDraggingMenuKey(null)
    setDragOverMenuKey(null)
  }

  async function reloadCommonCodes() {
    const items = await listCommonCodeGroupsWithCodes()
    setCodeGroups(items)
    return items
  }

  async function submitCodeGroup() {
    if (commonCodeBusy) return
    const payload = {
      menuKey: groupDraft.menuKey,
      code: groupDraft.code.trim(),
      name: groupDraft.name.trim(),
      active: true,
    }
    if (!payload.code || !payload.name) {
      setToastMessage('그룹코드와 그룹명을 입력해주세요.')
      return
    }
    setCommonCodeBusy(true)
    try {
      const created = await createCommonCodeGroup(payload)
      const items = await reloadCommonCodes()
      setSelectedCodeGroupId(items.find((group) => group.id === created.id)?.id ?? created.id)
      setGroupDraft({ menuKey: groupDraft.menuKey, code: '', name: '', active: true })
      setToastMessage('코드그룹을 추가했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '코드그룹을 추가하지 못했습니다.'))
    } finally {
      setCommonCodeBusy(false)
    }
  }

  function startEditCodeGroup(group: CommonCodeGroupWithCodes) {
    setEditingGroupId(group.id)
    setEditingGroupDraft({ menuKey: group.menuKey, code: group.code, name: group.name, active: group.active })
  }

  async function saveCodeGroup(group: CommonCodeGroupWithCodes, override?: Partial<AdminCodeGroup>) {
    if (!editingGroupDraft && !override) return
    const source = { menuKey: group.menuKey, code: group.code, name: group.name, active: group.active, ...(editingGroupDraft ?? {}), ...override }
    const payload = {
      menuKey: source.menuKey,
      code: source.code.trim(),
      name: source.name.trim(),
      active: source.active,
    }
    if (!payload.code || !payload.name) {
      setToastMessage('그룹코드와 그룹명을 입력해주세요.')
      return
    }
    setCommonCodeBusy(true)
    try {
      await updateCommonCodeGroup(group.id, payload)
      await reloadCommonCodes()
      setEditingGroupId(null)
      setEditingGroupDraft(null)
      setToastMessage('코드그룹을 수정했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '코드그룹을 수정하지 못했습니다.'))
    } finally {
      setCommonCodeBusy(false)
    }
  }

  function requestDeleteCodeGroup(group: CommonCodeGroupWithCodes) {
    setConfirm({
      title: '코드그룹 삭제',
      body: `${group.name} 그룹과 하위 공통코드를 삭제하시겠습니까?`,
      confirmLabel: '삭제',
      danger: true,
      onConfirm: async () => {
        setCommonCodeBusy(true)
        try {
          await deleteCommonCodeGroup(group.id)
          const items = await reloadCommonCodes()
          setSelectedCodeGroupId(items.find((item) => item.menuKey === selectedCodeMenuKey)?.id ?? null)
          setConfirm(null)
          setToastMessage('코드그룹을 삭제했습니다.')
        } catch (error) {
          setToastMessage(apiActionMessage(error, '코드그룹을 삭제하지 못했습니다.'))
        } finally {
          setCommonCodeBusy(false)
        }
      },
    })
  }

  async function submitCommonCode() {
    if (!selectedCodeGroup || commonCodeBusy) return
    const name = codeDraft.name.trim()
    if (!name) {
      setToastMessage('코드명을 입력해주세요.')
      return
    }
    const code = codeDraft.code.trim() || name
    const nextSortOrder = Math.max(0, ...selectedCodeGroup.codes.map((item) => item.sortOrder)) + 1
    setCommonCodeBusy(true)
    try {
      await createCommonCode(selectedCodeGroup.id, { code, name, sortOrder: nextSortOrder, active: true })
      await reloadCommonCodes()
      setCodeDraft({ code: '', name: '' })
      setToastMessage('공통코드를 추가했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '공통코드를 추가하지 못했습니다.'))
    } finally {
      setCommonCodeBusy(false)
    }
  }

  function startEditCommonCode(code: CommonCode) {
    setEditingCodeId(code.id)
    setEditingCodeDraft({ code: code.code, name: code.name })
  }

  async function saveCommonCode(group: CommonCodeGroupWithCodes, code: CommonCode, override?: Partial<CommonCode>) {
    const source = { ...code, ...override }
    const payload = {
      code: (editingCodeDraft?.code ?? source.code).trim(),
      name: (editingCodeDraft?.name ?? source.name).trim(),
      sortOrder: source.sortOrder,
      active: source.active,
    }
    if (!payload.name) {
      setToastMessage('코드명을 입력해주세요.')
      return
    }
    if (!payload.code) payload.code = payload.name
    setCommonCodeBusy(true)
    try {
      await updateCommonCode(group.id, code.id, payload)
      await reloadCommonCodes()
      setEditingCodeId(null)
      setEditingCodeDraft(null)
      setToastMessage('공통코드를 수정했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '공통코드를 수정하지 못했습니다.'))
    } finally {
      setCommonCodeBusy(false)
    }
  }

  function requestDeleteCommonCode(group: CommonCodeGroupWithCodes, code: CommonCode) {
    setConfirm({
      title: '공통코드 삭제',
      body: `${code.name} 공통코드를 삭제하시겠습니까?`,
      confirmLabel: '삭제',
      danger: true,
      onConfirm: async () => {
        setCommonCodeBusy(true)
        try {
          await deleteCommonCode(group.id, code.id)
          await reloadCommonCodes()
          setConfirm(null)
          setToastMessage('공통코드를 삭제했습니다.')
        } catch (error) {
          setToastMessage(apiActionMessage(error, '공통코드를 삭제하지 못했습니다.'))
        } finally {
          setCommonCodeBusy(false)
        }
      },
    })
  }

  async function moveCommonCode(group: CommonCodeGroupWithCodes, code: CommonCode, direction: -1 | 1) {
    const sorted = [...group.codes].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    const index = sorted.findIndex((item) => item.id === code.id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) return
    const next = [...sorted]
    const [item] = next.splice(index, 1)
    next.splice(nextIndex, 0, item)
    setCommonCodeBusy(true)
    try {
      await Promise.all(next.map((nextCode, nextSortIndex) => updateCommonCode(group.id, nextCode.id, {
        code: nextCode.code,
        name: nextCode.name,
        sortOrder: nextSortIndex + 1,
        active: nextCode.active,
      })))
      await reloadCommonCodes()
      setToastMessage('공통코드 순서를 변경했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '공통코드 순서를 변경하지 못했습니다.'))
    } finally {
      setCommonCodeBusy(false)
    }
  }

  async function refreshAccountInquiries() {
    setInquiriesLoading(true)
    try {
      const items = await listAccountRecoveryInquiries(inquiryStatus)
      setAccountInquiries(items)
      setSelectedInquiryId((current) => (items.some((item) => item.id === current) ? current : items[0]?.id ?? null))
    } catch (error) {
      setToastMessage(apiActionMessage(error, '계정 문의를 불러오지 못했습니다.'))
    } finally {
      setInquiriesLoading(false)
    }
  }

  async function changeInquiryStatus(status: AccountInquiryStatus) {
    if (!selectedInquiry) return
    try {
      const updated = await updateAccountRecoveryInquiryStatus(selectedInquiry.id, status)
      setAccountInquiries((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setToastMessage('문의 상태를 변경했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '문의 상태를 변경하지 못했습니다.'))
    }
  }

  async function submitInquiryReply() {
    if (!selectedInquiry) return
    const message = replyMessage.trim()
    if (!message) {
      setToastMessage('답장 내용을 입력해주세요.')
      return
    }
    if (!selectedReplyTarget) {
      setToastMessage('답장을 보낼 이메일이 없습니다.')
      return
    }
    try {
      const updated = await replyAccountRecoveryInquiry(selectedInquiry.id, message)
      setAccountInquiries((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setReplyMessage('')
      setToastMessage('답장을 보냈습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '답장을 보내지 못했습니다.'))
    }
  }

  return (
    <section className="fp-admin">
      {loading ? <div className="fp-loading-blocker">관리자 정보 확인 중</div> : null}
      <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />

      <div className="fp-admin-tabs admin-tabs" role="tablist" aria-label="관리자 설정">
        {visibleAdminTabs.map((tab) => (
          <button
            className={activeTab === tab.key ? 'active' : ''}
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => {
              setActiveTab(tab.key)
              cancelEdit()
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'menus' ? (
        <section className="fp-card fp-admin-panel fp-admin-menu-panel">
          <header className="fp-admin-panel-header panel-header">
            <div>
              <h2>메뉴 관리</h2>
              <p>{visibleMenuCount}개 메뉴 표시 중</p>
            </div>
          </header>

          <div className="fp-admin-menu-list menu-edit-list">
            {menus.map((menu, index) => {
              const editing = editingKey === menu.key && draft
              const fixedAdmin = menu.key === 'admin'
              return (
                <article
                  className={`fp-admin-menu-row menu-edit-row${editing ? ' active' : ''}${!menu.visible ? ' muted' : ''}${draggingMenuKey === menu.key ? ' dragging' : ''}${dragOverMenuKey === menu.key ? ' drag-over' : ''}`}
                  draggable={!editing}
                  key={menu.key}
                  onDragEnd={handleMenuDragEnd}
                  onDragOver={(event) => handleMenuDragOver(event, menu)}
                  onDragStart={(event) => handleMenuDragStart(event, menu)}
                  onDrop={(event) => handleMenuDrop(event, menu)}
                >
                  <span className="fp-admin-drag" aria-hidden="true">::</span>

                  {editing ? (
                    <div className="fp-admin-menu-fields menu-edit-fields">
                      <label>
                        <span>메뉴명</span>
                        <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
                      </label>
                      <label>
                        <span>설명</span>
                        <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                      </label>
                      <div className="fp-admin-role-chips menu-role-chips" role="group" aria-label="권한">
                        {roleOptions.map((role) => (
                          <button className={draft.roles.includes(role) ? 'active' : ''} key={role} type="button" onClick={() => toggleRole(role)}>
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="fp-admin-menu-copy menu-readonly-fields">
                      <strong>{menu.label}</strong>
                      <span>{menu.description}</span>
                      <small>{menu.roles.join(', ')}</small>
                    </div>
                  )}

                  <div className="fp-admin-row-actions">
                    {editing ? (
                      <>
                        <button className="save-button" type="button" onClick={saveEdit}>저장</button>
                        <button className="cancel-button" type="button" onClick={cancelEdit}>취소</button>
                      </>
                    ) : (
                      <>
                        <button className="edit-button" type="button" onClick={() => startEdit(menu)}>수정</button>
                        <button type="button" onClick={() => requestToggleVisible(menu)} disabled={fixedAdmin}>
                          {menu.visible ? '숨기기' : '표시'}
                        </button>
                        <button className="danger-button" type="button" onClick={() => requestDelete(menu)} disabled={fixedAdmin}>삭제</button>
                        <button className="move-button" type="button" aria-label={`${menu.label} 위로 이동`} onClick={() => setMenus((items) => moveItem(items, index, -1))} disabled={index === 0}>
                          <CgChevronUp aria-hidden="true" />
                        </button>
                        <button className="move-button" type="button" aria-label={`${menu.label} 아래로 이동`} onClick={() => setMenus((items) => moveItem(items, index, 1))} disabled={index === menus.length - 1}>
                          <CgChevronDown aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {activeTab === 'codes' ? (
        <section className="fp-card fp-admin-panel fp-admin-common-panel">
          <header className="fp-admin-panel-header panel-header">
            <div>
              <h2>공통코드</h2>
              <p>입력 화면에서 공통으로 쓰는 선택값입니다.</p>
            </div>
            <button className="fp-admin-refresh-button" type="button" onClick={() => void reloadCommonCodes()} disabled={commonCodeBusy}>
              새로고침
            </button>
          </header>
          <div className="fp-admin-code-manager">
            <section className="fp-admin-code-form" aria-label="코드그룹 추가">
              <label className="span-2">
                <span>관리 메뉴</span>
                <select value={selectedCodeMenuKey} onChange={(event) => setSelectedCodeMenuKey(event.target.value)}>
                  {commonCodeMenus.map((menu) => (
                    <option key={menu.key} value={menu.key}>{menu.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>그룹코드</span>
                <input
                  value={groupDraft.code}
                  onChange={(event) => setGroupDraft((current) => ({ ...current, code: event.target.value }))}
                  placeholder="category"
                />
              </label>
              <label>
                <span>그룹명</span>
                <input
                  value={groupDraft.name}
                  onChange={(event) => setGroupDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="가계부 카테고리"
                />
              </label>
              <button className="save-button span-2" type="button" onClick={submitCodeGroup} disabled={commonCodeBusy}>
                코드그룹 추가
              </button>
            </section>

            <section className="fp-admin-code-groups" aria-label="코드그룹 목록">
              {filteredCodeGroups.length === 0 ? <p className="fp-admin-empty">등록된 코드그룹이 없습니다.</p> : null}
              {filteredCodeGroups.map((group) => {
                const editing = editingGroupId === group.id && editingGroupDraft
                return (
                  <article className={`${selectedCodeGroup?.id === group.id ? 'active' : ''}${!group.active ? ' muted' : ''}`} key={group.id}>
                    <button className="fp-admin-code-group-main" type="button" onClick={() => setSelectedCodeGroupId(group.id)}>
                      {editing ? (
                        <div className="fp-admin-code-inline-form">
                          <input
                            value={editingGroupDraft.code}
                            onChange={(event) => setEditingGroupDraft((current) => (current ? { ...current, code: event.target.value } : current))}
                            aria-label="그룹코드"
                          />
                          <input
                            value={editingGroupDraft.name}
                            onChange={(event) => setEditingGroupDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                            aria-label="그룹명"
                          />
                        </div>
                      ) : (
                        <>
                          <strong>{group.name}</strong>
                          <span>{group.code}</span>
                        </>
                      )}
                    </button>
                    <div className="fp-admin-row-actions fp-admin-code-actions">
                      {editing ? (
                        <>
                          <button className="save-button" type="button" onClick={() => void saveCodeGroup(group)} disabled={commonCodeBusy}>저장</button>
                          <button className="cancel-button" type="button" onClick={() => {
                            setEditingGroupId(null)
                            setEditingGroupDraft(null)
                          }}>취소</button>
                        </>
                      ) : (
                        <>
                          <button className="edit-button" type="button" onClick={() => startEditCodeGroup(group)}>수정</button>
                          <button type="button" onClick={() => void saveCodeGroup(group, { active: !group.active })} disabled={commonCodeBusy}>
                            {group.active ? '숨기기' : '표시'}
                          </button>
                          <button className="danger-button" type="button" onClick={() => requestDeleteCodeGroup(group)}>삭제</button>
                        </>
                      )}
                    </div>
                  </article>
                )
              })}
            </section>

            <section className="fp-admin-code-detail" aria-label="공통코드 목록">
              <header>
                <div>
                  <strong>{selectedCodeGroup?.name ?? '선택 그룹'}</strong>
                  <span>{selectedCodeGroup ? `${selectedCodeGroup.codes.length}개 코드` : '그룹을 선택해주세요.'}</span>
                </div>
                {selectedCodeGroup ? <span className="fp-admin-code-key">{selectedCodeGroup.code}</span> : null}
              </header>

              {selectedCodeGroup ? (
                <>
                  <div className="fp-admin-code-form compact">
                    <label>
                      <span>코드값</span>
                      <input value={codeDraft.code} onChange={(event) => setCodeDraft((current) => ({ ...current, code: event.target.value }))} placeholder="food" />
                    </label>
                    <label>
                      <span>코드명</span>
                      <input value={codeDraft.name} onChange={(event) => setCodeDraft((current) => ({ ...current, name: event.target.value }))} placeholder="식비" />
                    </label>
                    <button className="save-button span-2" type="button" onClick={submitCommonCode} disabled={commonCodeBusy}>
                      공통코드 추가
                    </button>
                  </div>

                  <div className="fp-admin-common-code-list">
                    {[...selectedCodeGroup.codes].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id).map((code, index, sortedCodes) => {
                      const editing = editingCodeId === code.id && editingCodeDraft
                      return (
                        <article className={!code.active ? 'muted' : ''} key={code.id}>
                          <span className="fp-admin-drag" aria-hidden="true">::</span>
                          <div className="fp-admin-code-copy">
                            {editing ? (
                              <div className="fp-admin-code-inline-form">
                                <input
                                  value={editingCodeDraft.code}
                                  onChange={(event) => setEditingCodeDraft((current) => (current ? { ...current, code: event.target.value } : current))}
                                  aria-label="코드값"
                                />
                                <input
                                  value={editingCodeDraft.name}
                                  onChange={(event) => setEditingCodeDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                                  aria-label="코드명"
                                />
                              </div>
                            ) : (
                              <>
                                <strong>{code.name}</strong>
                                <span>{code.code}</span>
                                <small>{code.active ? '사용 중' : '숨김'}</small>
                              </>
                            )}
                          </div>
                          <div className="fp-admin-row-actions fp-admin-code-actions">
                            {editing ? (
                              <>
                                <button className="save-button" type="button" onClick={() => void saveCommonCode(selectedCodeGroup, code)} disabled={commonCodeBusy}>저장</button>
                                <button className="cancel-button" type="button" onClick={() => {
                                  setEditingCodeId(null)
                                  setEditingCodeDraft(null)
                                }}>취소</button>
                              </>
                            ) : (
                              <>
                                <button className="edit-button" type="button" onClick={() => startEditCommonCode(code)}>수정</button>
                                <button type="button" onClick={() => void saveCommonCode(selectedCodeGroup, code, { active: !code.active })} disabled={commonCodeBusy}>
                                  {code.active ? '숨기기' : '표시'}
                                </button>
                                <button className="danger-button" type="button" onClick={() => requestDeleteCommonCode(selectedCodeGroup, code)}>삭제</button>
                                <button className="move-button" type="button" aria-label={`${code.name} 위로 이동`} onClick={() => void moveCommonCode(selectedCodeGroup, code, -1)} disabled={index === 0 || commonCodeBusy}>
                                  <CgChevronUp aria-hidden="true" />
                                </button>
                                <button className="move-button" type="button" aria-label={`${code.name} 아래로 이동`} onClick={() => void moveCommonCode(selectedCodeGroup, code, 1)} disabled={index === sortedCodes.length - 1 || commonCodeBusy}>
                                  <CgChevronDown aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </div>
                        </article>
                      )
                    })}
                    {selectedCodeGroup.codes.length === 0 ? <p className="fp-admin-empty">등록된 공통코드가 없습니다.</p> : null}
                  </div>
                </>
              ) : (
                <p className="fp-admin-empty">코드그룹을 먼저 추가해주세요.</p>
              )}
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === 'home' ? (
        <section className="fp-card fp-admin-panel">
          <header className="fp-admin-panel-header panel-header">
            <div>
              <h2>홈구성</h2>
              <p>홈 화면 카드와 바로가기 구성을 확인합니다.</p>
            </div>
          </header>
          <div className="fp-admin-home-grid">
            <article>
              <strong>상단 요약</strong>
              <span>이번 달 지출, 여행 누적, 육아 기록, 가족 멤버</span>
            </article>
            <article>
              <strong>바로가기</strong>
              <span>다크모드, 알림, 내 정보, 로그아웃</span>
            </article>
            <article>
              <strong>최근 기록</strong>
              <span>최근 가계부와 빈 상태 문구</span>
            </article>
            <article>
              <strong>관리자 계정</strong>
              <span>{providerLabel(profile?.loginProvider)} · {profile?.nickname || 'Admin'} · {isPlatformAdmin ? '플랫폼 관리자' : '일반 사용자'}</span>
            </article>
            <article>
              <strong>가족 그룹</strong>
              <span>{families.length.toLocaleString('ko-KR')}개 접근 가능</span>
            </article>
          </div>
        </section>
      ) : null}

      {activeTab === 'account-inquiries' ? (
        <section className="fp-card fp-admin-panel fp-admin-inquiry-panel">
          <header className="fp-admin-panel-header panel-header">
            <div>
              <h2>계정 문의</h2>
              <p>아이디/비밀번호 찾기에서 접수된 문의를 확인하고 답장합니다.</p>
            </div>
            <button className="fp-admin-refresh-button" type="button" onClick={refreshAccountInquiries}>
              새로고침
            </button>
          </header>

          <div className="fp-admin-inquiry-layout">
            <div className="fp-admin-inquiry-list">
              <div className="fp-admin-inquiry-toolbar" role="group" aria-label="문의 상태">
                {(Object.keys(inquiryStatusLabels) as Array<AccountInquiryStatus | 'ALL'>).map((status) => (
                  <button
                    className={inquiryStatus === status ? 'active' : ''}
                    key={status}
                    type="button"
                    onClick={() => setInquiryStatus(status)}
                  >
                    {inquiryStatusLabels[status]}
                  </button>
                ))}
              </div>

              {inquiriesLoading ? <p className="fp-admin-empty">계정 문의를 불러오는 중입니다.</p> : null}
              {!inquiriesLoading && accountInquiries.length === 0 ? (
                <p className="fp-admin-empty">접수된 계정 문의가 없습니다.</p>
              ) : null}

              {accountInquiries.map((item) => {
                const selected = selectedInquiry?.id === item.id
                return (
                  <button
                    className={`fp-admin-inquiry-card${selected ? ' active' : ''}`}
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedInquiryId(item.id)
                      setReplyMessage('')
                    }}
                  >
                    <span className={`fp-admin-status-pill status-${item.status.toLowerCase()}`}>
                      {inquiryStatusLabels[item.status]}
                    </span>
                    <strong>{item.email || item.nickname || item.contact || '연락처 없음'}</strong>
                    <span>{item.recoveryType || '계정 문의'} · {formatInquiryDate(item.createdAt)}</span>
                    <small>{item.message || '문의 내용 없음'}</small>
                  </button>
                )
              })}
            </div>

            <aside className="fp-admin-inquiry-detail">
              {selectedInquiry ? (
                <>
                  <header>
                    <div>
                      <h3>문의 상세</h3>
                      <p>{formatInquiryDate(selectedInquiry.createdAt)}</p>
                    </div>
                    <span className={`fp-admin-status-pill status-${selectedInquiry.status.toLowerCase()}`}>
                      {inquiryStatusLabels[selectedInquiry.status]}
                    </span>
                  </header>

                  <dl className="fp-admin-inquiry-meta">
                    <div>
                      <dt>이메일</dt>
                      <dd>{selectedInquiry.email || '-'}</dd>
                    </div>
                    <div>
                      <dt>닉네임</dt>
                      <dd>{selectedInquiry.nickname || '-'}</dd>
                    </div>
                    <div>
                      <dt>연락처</dt>
                      <dd>{selectedInquiry.contact || '-'}</dd>
                    </div>
                    <div>
                      <dt>문의 유형</dt>
                      <dd>{selectedInquiry.recoveryType || '-'}</dd>
                    </div>
                  </dl>

                  <div className="fp-admin-inquiry-message">
                    <strong>문의 내용</strong>
                    <p>{selectedInquiry.message || '문의 내용 없음'}</p>
                  </div>

                  {selectedInquiry.replyMessage ? (
                    <div className="fp-admin-inquiry-message">
                      <strong>기존 답변</strong>
                      <p>{selectedInquiry.replyMessage}</p>
                    </div>
                  ) : null}

                  <label className="fp-admin-reply-field">
                    <span>답장 내용</span>
                    <textarea
                      value={replyMessage}
                      onChange={(event) => setReplyMessage(event.target.value)}
                      placeholder={selectedReplyTarget ? `${selectedReplyTarget}로 보낼 답장을 입력하세요.` : '이메일이 없는 문의입니다.'}
                    />
                  </label>

                  {!selectedReplyTarget ? (
                    <p className="fp-admin-help-text">이메일이 없는 문의입니다. 상태만 변경하고 연락처로 직접 답변해야 합니다.</p>
                  ) : null}

                  <div className="fp-admin-detail-actions">
                    <button className="save-button" type="button" onClick={submitInquiryReply} disabled={!selectedReplyTarget}>
                      답장 보내기
                    </button>
                    <button type="button" onClick={() => changeInquiryStatus('IN_PROGRESS')}>처리중</button>
                    <button type="button" onClick={() => changeInquiryStatus('CLOSED')}>닫기</button>
                    <button type="button" onClick={() => changeInquiryStatus('OPEN')}>대기</button>
                  </div>
                </>
              ) : (
                <p className="fp-admin-empty">선택된 문의가 없습니다.</p>
              )}
            </aside>
          </div>
        </section>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      ) : null}
    </section>
  )
}
