import { useEffect, useMemo, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import { ConfirmDialog, ToastMessage } from '../../../shared/components'
import { LEDGER_CATEGORIES, LEDGER_PAYMENT_METHODS, TRAVEL_COST_CATEGORIES } from '../../../shared/constants/commonCodes'
import type { FamilyGroup } from '../../family/types'
import { getCurrentUserProfile, listAdminVisibleFamilies, type CurrentUserProfile } from '../api/admin'
import './admin-page.css'

type AdminTab = 'menus' | 'codes' | 'home'

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

const adminTabs: Array<{ key: AdminTab; label: string }> = [
  { key: 'menus', label: '메뉴관리' },
  { key: 'codes', label: '공통코드' },
  { key: 'home', label: '홈구성' },
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

function providerLabel(provider?: string) {
  if (provider === 'naver') return '네이버'
  if (provider === 'kakao') return '카카오'
  if (provider === 'google') return '구글'
  if (provider === 'admin') return '관리자 ID'
  return '이메일'
}

function moveItem(items: AdminMenuItem[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
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

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      try {
        const [nextProfile, nextFamilies] = await Promise.all([
          getCurrentUserProfile(),
          listAdminVisibleFamilies(),
        ])
        if (!alive) return
        setProfile(nextProfile)
        setFamilies(nextFamilies)
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

  const codeGroups = useMemo(() => [
    { title: '가계부 카테고리', description: '수입/지출 입력 카테고리', values: LEDGER_CATEGORIES },
    { title: '결제수단', description: '가계부 결제수단', values: LEDGER_PAYMENT_METHODS },
    { title: '여행 비용 구분', description: '여행 기록 비용 분류', values: TRAVEL_COST_CATEGORIES },
    { title: '가족 사용자', description: '기본 사용자 선택값', values: ['아빠', '엄마', '가족'] },
  ], [])

  const visibleMenuCount = menus.filter((menu) => menu.visible).length
  const isPlatformAdmin = Boolean(profile?.platformAdmin)

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

  return (
    <section className="fp-admin">
      {loading ? <div className="fp-loading-blocker">관리자 정보 확인 중</div> : null}
      <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />

      <div className="fp-admin-tabs admin-tabs" role="tablist" aria-label="관리자 설정">
        {adminTabs.map((tab) => (
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
                <article className={`fp-admin-menu-row menu-edit-row${editing ? ' active' : ''}${!menu.visible ? ' muted' : ''}`} key={menu.key}>
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
                        <button className="move-button" type="button" aria-label={`${menu.label} 위로 이동`} onClick={() => setMenus((items) => moveItem(items, index, -1))} disabled={index === 0}>⌃</button>
                        <button className="move-button" type="button" aria-label={`${menu.label} 아래로 이동`} onClick={() => setMenus((items) => moveItem(items, index, 1))} disabled={index === menus.length - 1}>⌄</button>
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
        <section className="fp-card fp-admin-panel">
          <header className="fp-admin-panel-header panel-header">
            <div>
              <h2>공통코드</h2>
              <p>입력 화면에서 공통으로 쓰는 선택값입니다.</p>
            </div>
          </header>
          <div className="fp-admin-code-grid">
            {codeGroups.map((group) => (
              <article className="fp-admin-code-card" key={group.title}>
                <header>
                  <strong>{group.title}</strong>
                  <span>{group.values.length}개</span>
                </header>
                <p>{group.description}</p>
                <div>
                  {group.values.map((value) => <span key={value}>{value}</span>)}
                </div>
              </article>
            ))}
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
