import { type DragEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { CgChevronDown, CgChevronUp } from 'react-icons/cg'
import { HiOutlineX } from 'react-icons/hi'
import { apiActionMessage } from '../../../shared/api/client'
import {
  createCommonCode,
  createCommonCodeGroup,
  deleteCommonCode,
  listCommonCodeGroupsWithCodes,
  updateCommonCode,
  updateCommonCodeGroup,
  type CommonCode,
  type CommonCodeGroupWithCodes,
} from '../../../shared/api/commonCodes'
import { getReadableFamily } from '../../../shared/api/family'
import { ConfirmDialog, CustomSelect, ToastMessage } from '../../../shared/components'
import {
  BABY_GENDER_OPTIONS,
  BABY_RECORD_TYPES,
  CALENDAR_CATEGORIES,
  COMMON_CODE_GROUPS,
  DIARY_MOODS,
  DIARY_WEATHER_OPTIONS,
  FAMILY_MEMBER_OPTIONS,
  LEDGER_CATEGORIES,
  LEDGER_ENTRY_TYPE_OPTIONS,
  LEDGER_PAYMENT_METHODS,
  RESTAURANT_PRICE_OPTIONS,
  RESTAURANT_RATING_OPTIONS,
  TRAVEL_COST_CATEGORIES,
  type CommonCodeOption,
} from '../../../shared/constants/commonCodes'
import {
  defaultHomeSettings,
  homeWidgetLabels,
  loadHomeSettings,
  saveHomeSettings,
  type HomeSettings,
  type HomeWidgetKey,
} from '../../../shared/homeSettings'
import {
  getCurrentUserProfile,
  listAccountRecoveryInquiries,
  listManagedBatches,
  replyAccountRecoveryInquiry,
  runManagedBatch,
  updateAccountRecoveryInquiryStatus,
  type AccountInquiryStatus,
  type AccountRecoveryInquiry,
  type CurrentUserProfile,
  type ManagedBatchItem,
} from '../api/admin'
import { AnalyticsDashboard } from '../components/AnalyticsDashboard'
import { AdminUserDataLookup } from '../components/AdminUserDataLookup'
import { ModerationPanel } from '../components/ModerationPanel'
import './admin-page.css'

type AdminTab = 'analytics' | 'user-data' | 'moderation' | 'menus' | 'codes' | 'home' | 'batches' | 'account-inquiries'

type AdminMenuItem = {
  key: string
  label: string
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

type AdminCodeDraft = {
  code: string
  name: string
}

type CommonCodeBatchRow = Pick<CommonCode, 'id' | 'code' | 'name' | 'sortOrder' | 'active'>

const adminTabs: Array<{ key: AdminTab; label: string }> = [
  { key: 'analytics', label: '대시보드' },
  { key: 'user-data', label: '회원조회' },
  { key: 'moderation', label: '정지' },
  { key: 'menus', label: '메뉴관리' },
  { key: 'codes', label: '공통코드' },
  { key: 'home', label: '홈화면' },
  { key: 'batches', label: '배치관리' },
  { key: 'account-inquiries', label: '계정 문의' },
]

const initialMenus: AdminMenuItem[] = [
  { key: 'home', label: '홈', roles: ['그룹관리자', '구성원'], visible: true },
  { key: 'calendar', label: '캘린더', roles: ['그룹관리자', '구성원'], visible: true },
  { key: 'ledger', label: '가계부', roles: ['그룹관리자', '구성원'], visible: true },
  { key: 'travel', label: '여행', roles: ['그룹관리자', '구성원'], visible: true },
  { key: 'baby', label: '육아', roles: ['그룹관리자', '구성원'], visible: true },
  { key: 'diary', label: '일기', roles: ['그룹관리자', '구성원'], visible: true },
  { key: 'family', label: '그룹관리', roles: ['그룹관리자'], visible: true },
  { key: 'restaurant', label: '맛집', roles: ['그룹관리자', '구성원'], visible: true },
  { key: 'community', label: '커뮤니티', roles: ['그룹관리자', '구성원'], visible: true },
  { key: 'hotdeal', label: '특가', roles: ['그룹관리자', '구성원'], visible: true },
  { key: 'admin', label: '설정', roles: ['그룹관리자', '구성원'], visible: true },
]

const roleOptions = ['그룹관리자', '구성원']

const commonCodeMenus = [
  { key: 'calendar', label: '캘린더' },
  { key: 'ledger', label: '가계부' },
  { key: 'travel', label: '여행' },
  { key: 'baby', label: '육아' },
  { key: 'diary', label: '일기' },
  { key: 'family', label: '그룹관리' },
  { key: 'restaurant', label: '맛집' },
]

type DefaultCommonCodeGroup = {
  menuKey: string
  code: string
  name: string
  codes: Array<{ code: string; name: string }>
}

function stringCodes(values: readonly string[]) {
  return values.map((value) => ({ code: value, name: value }))
}

function optionCodes(options: readonly CommonCodeOption[]) {
  return options
    .filter((option) => option.value)
    .map((option) => ({ code: option.value, name: option.label || option.value }))
}

function autoCommonCodeValue(name: string, group: CommonCodeGroupWithCodes) {
  const trimmed = name.trim()
  if (!trimmed) return ''
  if (group.code === 'entryType') {
    if (trimmed.includes('수입')) return 'income'
    if (trimmed.includes('지출')) return 'expense'
  }
  const ascii = trimmed
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
  const base = ascii || trimmed
  const used = new Set(group.codes.map((item) => item.code))
  if (!used.has(base)) return base
  let index = 2
  while (used.has(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

function menuRoles(roles: string[]) {
  const allowedRoles = roles.filter((role) => roleOptions.includes(role))
  return allowedRoles.length ? allowedRoles : ['구성원']
}

function menuRoleChipLabel(role: string) {
  return role === '그룹관리자' ? '관리자' : role
}

const defaultCommonCodeGroups: DefaultCommonCodeGroup[] = [
  { ...COMMON_CODE_GROUPS.ledgerEntryTypes, name: '구분', codes: optionCodes(LEDGER_ENTRY_TYPE_OPTIONS) },
  { ...COMMON_CODE_GROUPS.ledgerCategories, name: '카테고리', codes: stringCodes(LEDGER_CATEGORIES) },
  { ...COMMON_CODE_GROUPS.ledgerPaymentMethods, name: '결제수단', codes: stringCodes(LEDGER_PAYMENT_METHODS) },
  { ...COMMON_CODE_GROUPS.ledgerMembers, name: '사용자', codes: stringCodes(FAMILY_MEMBER_OPTIONS) },
  { ...COMMON_CODE_GROUPS.familyMembers, name: '사용자', codes: stringCodes(FAMILY_MEMBER_OPTIONS) },
  { ...COMMON_CODE_GROUPS.calendarCategories, name: '캘린더 카테고리', codes: stringCodes(CALENDAR_CATEGORIES) },
  { ...COMMON_CODE_GROUPS.travelCostCategories, name: '여행 비용 카테고리', codes: stringCodes(TRAVEL_COST_CATEGORIES) },
  { ...COMMON_CODE_GROUPS.babyRecordTypes, name: '육아 기록 유형', codes: stringCodes(BABY_RECORD_TYPES) },
  { ...COMMON_CODE_GROUPS.babyGenders, name: '성별', codes: optionCodes(BABY_GENDER_OPTIONS) },
  { ...COMMON_CODE_GROUPS.diaryMoods, name: '일기 기분', codes: stringCodes(DIARY_MOODS) },
  { ...COMMON_CODE_GROUPS.diaryWeather, name: '일기 날씨', codes: stringCodes(DIARY_WEATHER_OPTIONS) },
  { ...COMMON_CODE_GROUPS.restaurantPrices, name: '맛집 가격대', codes: optionCodes(RESTAURANT_PRICE_OPTIONS) },
  { ...COMMON_CODE_GROUPS.restaurantRatings, name: '맛집 평점', codes: optionCodes(RESTAURANT_RATING_OPTIONS) },
]

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

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
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

function sortedCommonCodes(codes: CommonCode[]) {
  return [...codes].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
}

function commonCodeBatchRows(group: CommonCodeGroupWithCodes): CommonCodeBatchRow[] {
  return sortedCommonCodes(group.codes).map(({ id, code, name, sortOrder, active }) => ({ id, code, name, sortOrder, active }))
}

function canManageFamilySettings(role?: string) {
  return role === 'FAMILY_ADMIN'
}

function moveCodeRowToTarget(rows: CommonCodeBatchRow[], sourceId: number, targetId: number) {
  const sourceIndex = rows.findIndex((item) => item.id === sourceId)
  const targetIndex = rows.findIndex((item) => item.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return rows
  const next = [...rows]
  const [item] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, item)
  return next
}

export default function AdminPage({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null)
  const [currentFamilyRole, setCurrentFamilyRole] = useState('')
  const [menus, setMenus] = useState<AdminMenuItem[]>(initialMenus)
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics')
  const [isMenuBatchEditing, setIsMenuBatchEditing] = useState(false)
  const [menuBatchRows, setMenuBatchRows] = useState<AdminMenuItem[]>([])
  const [menuDeleteKeys, setMenuDeleteKeys] = useState<string[]>([])
  const [homeSettings, setHomeSettings] = useState<HomeSettings>(() => loadHomeSettings())
  const [loading, setLoading] = useState(true)
  const [toastMessage, setToastMessage] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [codeGroups, setCodeGroups] = useState<CommonCodeGroupWithCodes[]>([])
  const [selectedCodeMenuKey, setSelectedCodeMenuKey] = useState(commonCodeMenus[1].key)
  const [selectedCodeGroupId, setSelectedCodeGroupId] = useState<number | null>(null)
  const [isCodeDetailDialogOpen, setIsCodeDetailDialogOpen] = useState(false)
  const [isCodeAddDialogOpen, setIsCodeAddDialogOpen] = useState(false)
  const [codeDraft, setCodeDraft] = useState<AdminCodeDraft>({ code: '', name: '' })
  const [isCodeBatchEditing, setIsCodeBatchEditing] = useState(false)
  const [codeBatchRows, setCodeBatchRows] = useState<CommonCodeBatchRow[]>([])
  const [codeDeleteIds, setCodeDeleteIds] = useState<number[]>([])
  const [commonCodeBusy, setCommonCodeBusy] = useState(false)
  const [managedBatches, setManagedBatches] = useState<ManagedBatchItem[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [runningBatchKey, setRunningBatchKey] = useState<string | null>(null)
  const [accountInquiries, setAccountInquiries] = useState<AccountRecoveryInquiry[]>([])
  const [inquiryStatus, setInquiryStatus] = useState<AccountInquiryStatus | 'ALL'>('OPEN')
  const [inquiriesLoading, setInquiriesLoading] = useState(false)
  const [selectedInquiryId, setSelectedInquiryId] = useState<number | null>(null)
  const [replyMessage, setReplyMessage] = useState('')
  const [draggingMenuKey, setDraggingMenuKey] = useState<string | null>(null)
  const [dragOverMenuKey, setDragOverMenuKey] = useState<string | null>(null)
  const [draggingCodeId, setDraggingCodeId] = useState<number | null>(null)
  const [dragOverCodeId, setDragOverCodeId] = useState<number | null>(null)
  const pointerDraggingMenuKey = useRef<string | null>(null)
  const pointerPendingMenuDrag = useRef<{ key: string; x: number; y: number } | null>(null)
  const menuAutoScrollTimer = useRef<number | null>(null)
  const menuAutoScrollStep = useRef(0)
  const pointerDraggingCodeId = useRef<number | null>(null)
  const pointerPendingCodeDrag = useRef<{ id: number; x: number; y: number } | null>(null)
  const codeAutoScrollTimer = useRef<number | null>(null)
  const codeAutoScrollStep = useRef(0)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      try {
        const [nextProfile, nextCodeGroups] = await Promise.all([
          getCurrentUserProfile(),
          listCommonCodeGroupsWithCodes().catch(() => []),
        ])
        const nextFamily = await getReadableFamily()
        if (!alive) return
        setProfile(nextProfile)
        const resolvedFamilyRole = nextFamily?.role || nextProfile.familyRole || ''
        setCurrentFamilyRole(resolvedFamilyRole)
        const canManageCodes = canManageFamilySettings(resolvedFamilyRole)
        const syncedCodeGroups = canManageCodes
          ? await syncMissingDefaultCommonCodes(nextCodeGroups, { silent: true })
          : nextCodeGroups
        if (!alive) return
        setCodeGroups(syncedCodeGroups)
        setSelectedCodeGroupId((current) => current ?? syncedCodeGroups.find((group) => group.menuKey === selectedCodeMenuKey)?.id ?? null)
      } catch (error) {
        if (!alive) return
        setToastMessage(apiActionMessage(error, '설정 정보를 불러오지 못했습니다.'))
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
  const canManageCommonCodes = canManageFamilySettings(currentFamilyRole)
  const canManageSharedMenus = canManageFamilySettings(currentFamilyRole)
  function canAccessAdminTab(tab: AdminTab) {
    if (tab === 'analytics' || tab === 'user-data' || tab === 'moderation' || tab === 'batches' || tab === 'account-inquiries') return isPlatformAdmin
    if (tab === 'menus') return canManageSharedMenus
    if (tab === 'codes') return canManageCommonCodes
    return true
  }
  const visibleAdminTabs = adminTabs.filter((tab) => canAccessAdminTab(tab.key))
  const filteredCodeGroups = codeGroups.filter((group) => group.menuKey === selectedCodeMenuKey)
  const selectedCodeGroup = codeGroups.find((group) => group.id === selectedCodeGroupId) ?? filteredCodeGroups[0] ?? null
  const selectedInquiry = accountInquiries.find((item) => item.id === selectedInquiryId) ?? accountInquiries[0] ?? null
  const selectedReplyTarget = inquiryReplyTarget(selectedInquiry)
  const homeSettingItems: HomeWidgetKey[] = ['expense', 'travel', 'baby', 'family', 'recentLedger']

  useEffect(() => {
    setSelectedCodeGroupId((current) => {
      if (current && codeGroups.some((group) => group.id === current && group.menuKey === selectedCodeMenuKey)) return current
      return codeGroups.find((group) => group.menuKey === selectedCodeMenuKey)?.id ?? null
    })
  }, [codeGroups, selectedCodeMenuKey])

  useEffect(() => {
    setIsCodeDetailDialogOpen(false)
    setIsCodeBatchEditing(false)
    setCodeDeleteIds([])
  }, [selectedCodeMenuKey])

  useEffect(() => {
    if (!selectedCodeGroup || isCodeBatchEditing) return
    setCodeBatchRows(commonCodeBatchRows(selectedCodeGroup))
    setCodeDeleteIds([])
  }, [isCodeBatchEditing, selectedCodeGroup])

  useEffect(() => {
    if (!loading && !canAccessAdminTab(activeTab)) {
      setActiveTab('home')
      setAccountInquiries([])
      setSelectedInquiryId(null)
      setIsCodeDetailDialogOpen(false)
      setIsCodeBatchEditing(false)
      setCodeDeleteIds([])
      cancelMenuBatchEdit()
    }
  }, [activeTab, canManageCommonCodes, canManageSharedMenus, isPlatformAdmin, loading, onUnauthorized])

  useEffect(() => {
    if (activeTab !== 'batches' || !isPlatformAdmin) return
    let alive = true
    setBatchesLoading(true)
    void listManagedBatches()
      .then((items) => {
        if (alive) setManagedBatches(items)
      })
      .catch((error) => {
        if (alive) setToastMessage(apiActionMessage(error, '배치 목록을 불러오지 못했습니다.'))
      })
      .finally(() => {
        if (alive) setBatchesLoading(false)
      })
    return () => {
      alive = false
    }
  }, [activeTab, isPlatformAdmin])

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

  function startMenuBatchEdit() {
    setMenuBatchRows(menus.map((menu) => ({ ...menu, roles: menuRoles(menu.roles) })))
    setMenuDeleteKeys([])
    setIsMenuBatchEditing(true)
  }

  function cancelMenuBatchEdit() {
    setMenuBatchRows([])
    setMenuDeleteKeys([])
    setIsMenuBatchEditing(false)
    handleMenuDragEnd()
  }

  function updateMenuBatchRow(key: string, patch: Partial<AdminMenuItem>) {
    setMenuBatchRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function toggleMenuBatchRole(key: string, role: string) {
    setMenuBatchRows((rows) => rows.map((row) => {
      if (row.key !== key) return row
      const exists = row.roles.includes(role)
      const roles = exists ? row.roles.filter((item) => item !== role) : [...row.roles, role]
      return { ...row, roles: roles.length ? roles : row.roles }
    }))
  }

  function toggleMenuDelete(key: string) {
    if (key === 'admin') return
    setMenuDeleteKeys((keys) => (keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]))
  }

  function applySelectedMenuDelete() {
    const deleteKeys = new Set(menuDeleteKeys)
    const deleteCount = menuBatchRows.filter((row) => deleteKeys.has(row.key)).length
    if (deleteCount === 0) {
      setToastMessage('삭제할 메뉴를 선택해주세요.')
      return
    }
    setMenuBatchRows((rows) => rows.filter((row) => !deleteKeys.has(row.key)))
    setToastMessage('선택한 메뉴를 삭제 대상으로 표시했습니다. 저장을 눌러 반영해주세요.')
  }

  function moveMenuBatchRow(index: number, direction: -1 | 1) {
    setMenuBatchRows((rows) => moveItem(rows, index, direction))
  }

  function saveMenuBatchEdit() {
    const deleteKeys = new Set(menuDeleteKeys)
    const rowsToSave = menuBatchRows.filter((row) => !deleteKeys.has(row.key))
    if (rowsToSave.some((row) => !row.label.trim())) {
      setToastMessage('메뉴명을 입력해주세요.')
      return
    }
    if (rowsToSave.some((row) => row.roles.length === 0)) {
      setToastMessage('메뉴 권한은 1개 이상 선택해주세요.')
      return
    }
    setMenus(rowsToSave.map((row) => ({
      ...row,
      label: row.label.trim(),
      roles: menuRoles(row.roles),
    })))
    setMenuBatchRows([])
    setMenuDeleteKeys([])
    setIsMenuBatchEditing(false)
    handleMenuDragEnd()
    setToastMessage('메뉴 관리를 저장했습니다.')
  }

  function handleMenuDragStart(event: DragEvent<HTMLElement>, menu: AdminMenuItem) {
    if (!isMenuBatchEditing) {
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
    scrollMenuDragViewport(event.clientY)
    event.dataTransfer.dropEffect = 'move'
    setDragOverMenuKey(menu.key)
  }

  function handleMenuDrop(event: DragEvent<HTMLElement>, menu: AdminMenuItem) {
    event.preventDefault()
    const sourceKey = event.dataTransfer.getData('text/plain') || draggingMenuKey
    setDraggingMenuKey(null)
    setDragOverMenuKey(null)
    if (!sourceKey || sourceKey === menu.key) return
    setMenuBatchRows((items) => moveItemToTarget(items, sourceKey, menu.key))
  }

  function handleMenuDragEnd() {
    stopMenuAutoScroll()
    pointerPendingMenuDrag.current = null
    pointerDraggingMenuKey.current = null
    setDraggingMenuKey(null)
    setDragOverMenuKey(null)
  }

  function menuKeyFromPoint(x: number, y: number) {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-menu-key]')
    return target?.dataset.menuKey || null
  }

  function stopMenuAutoScroll() {
    if (menuAutoScrollTimer.current !== null) {
      window.clearInterval(menuAutoScrollTimer.current)
      menuAutoScrollTimer.current = null
    }
    menuAutoScrollStep.current = 0
  }

  function startMenuAutoScroll(step: number) {
    menuAutoScrollStep.current = step
    window.scrollBy({ top: step, behavior: 'auto' })
    if (menuAutoScrollTimer.current !== null) return
    menuAutoScrollTimer.current = window.setInterval(() => {
      if (menuAutoScrollStep.current) window.scrollBy({ top: menuAutoScrollStep.current, behavior: 'auto' })
    }, 45)
  }

  function scrollMenuDragViewport(clientY: number) {
    const edgeSize = 110
    const maxStep = 28
    if (clientY < edgeSize) {
      startMenuAutoScroll(-Math.max(10, maxStep * (1 - clientY / edgeSize)))
      return
    }
    if (clientY > window.innerHeight - edgeSize) {
      const distance = window.innerHeight - clientY
      startMenuAutoScroll(Math.max(10, maxStep * (1 - distance / edgeSize)))
      return
    }
    stopMenuAutoScroll()
  }

  function handleMenuPointerDown(event: ReactPointerEvent<HTMLElement>, menu: AdminMenuItem) {
    if (!isMenuBatchEditing) return
    const target = event.target
    if (target instanceof HTMLElement && target.closest('button, input, label')) return
    pointerPendingMenuDrag.current = { key: menu.key, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleMenuPointerMove(event: ReactPointerEvent<HTMLElement>) {
    let sourceKey = pointerDraggingMenuKey.current
    const pending = pointerPendingMenuDrag.current
    if (!sourceKey && pending) {
      const distance = Math.hypot(event.clientX - pending.x, event.clientY - pending.y)
      if (distance < 8) return
      sourceKey = pending.key
      pointerDraggingMenuKey.current = sourceKey
      setDraggingMenuKey(sourceKey)
    }
    if (!sourceKey) return
    event.preventDefault()
    scrollMenuDragViewport(event.clientY)
    const targetKey = menuKeyFromPoint(event.clientX, event.clientY)
    if (!targetKey || targetKey === sourceKey) return
    setDragOverMenuKey(targetKey)
    setMenuBatchRows((items) => moveItemToTarget(items, sourceKey, targetKey))
  }

  function handleMenuPointerEnd() {
    handleMenuDragEnd()
  }

  async function reloadCommonCodes() {
    const items = await listCommonCodeGroupsWithCodes()
    setCodeGroups(items)
    return items
  }

  async function syncMissingDefaultCommonCodes(
    currentGroups = codeGroups,
    options: { silent?: boolean; menuKey?: string } = {},
  ) {
    if (commonCodeBusy && !options.silent) return currentGroups
    const targets = defaultCommonCodeGroups.filter((group) => !options.menuKey || group.menuKey === options.menuKey)
    let nextGroups = [...currentGroups]
    let changed = false

    if (!options.silent) setCommonCodeBusy(true)
    try {
      for (const defaultGroup of targets) {
        let group = nextGroups.find((item) => item.menuKey === defaultGroup.menuKey && item.code === defaultGroup.code)
        if (!group) {
          const created = await createCommonCodeGroup({
            menuKey: defaultGroup.menuKey,
            code: defaultGroup.code,
            name: defaultGroup.name,
            active: true,
          })
          group = { ...created, codes: [] }
          nextGroups = [...nextGroups, group]
          changed = true
        }

        if (group.name !== defaultGroup.name || !group.active) {
          const updated = await updateCommonCodeGroup(group.id, {
            menuKey: defaultGroup.menuKey,
            code: defaultGroup.code,
            name: defaultGroup.name,
            active: true,
          })
          group = { ...updated, codes: group.codes }
          nextGroups = nextGroups.map((item) => (item.id === group?.id ? group as CommonCodeGroupWithCodes : item))
          changed = true
        }

        const existingCodes = new Set(group.codes.map((code) => code.code))
        for (const [index, defaultCode] of defaultGroup.codes.entries()) {
          if (existingCodes.has(defaultCode.code)) continue
          const createdCode = await createCommonCode(group.id, {
            code: defaultCode.code,
            name: defaultCode.name,
            sortOrder: Math.max(index + 1, group.codes.length + 1),
            active: true,
          })
          group = { ...group, codes: [...group.codes, createdCode] }
          nextGroups = nextGroups.map((item) => (item.id === group?.id ? group as CommonCodeGroupWithCodes : item))
          existingCodes.add(defaultCode.code)
          changed = true
        }
      }

      if (!changed) {
        if (!options.silent) setToastMessage('추가할 기본 공통코드가 없습니다.')
        return nextGroups
      }

      const reloaded = await listCommonCodeGroupsWithCodes()
      setCodeGroups(reloaded)
      if (!options.silent) setToastMessage('기본 공통코드를 반영했습니다.')
      return reloaded
    } catch (error) {
      if (!options.silent) setToastMessage(apiActionMessage(error, '기본 공통코드를 반영하지 못했습니다.'))
      return currentGroups
    } finally {
      if (!options.silent) setCommonCodeBusy(false)
    }
  }

  async function refreshManagedBatches() {
    if (!isPlatformAdmin) return
    setBatchesLoading(true)
    try {
      setManagedBatches(await listManagedBatches())
    } catch (error) {
      setToastMessage(apiActionMessage(error, '배치 목록을 불러오지 못했습니다.'))
    } finally {
      setBatchesLoading(false)
    }
  }

  async function executeManagedBatch(batch: ManagedBatchItem) {
    if (runningBatchKey) return
    setRunningBatchKey(batch.key)
    try {
      const result = await runManagedBatch(batch.key)
      setManagedBatches((items) => items.map((item) => (item.key === batch.key ? { ...item, lastRun: result } : item)))
      setToastMessage(result.status === 'SKIPPED' ? (result.message || `${batch.label}을 실행하지 않았습니다.`) : `${batch.label} 실행을 완료했습니다.`)
    } catch (error) {
      setToastMessage(apiActionMessage(error, `${batch.label}을 실행하지 못했습니다.`))
    } finally {
      setRunningBatchKey(null)
    }
  }

  async function submitCommonCode() {
    if (!selectedCodeGroup || commonCodeBusy) return
    const name = codeDraft.name.trim()
    if (!name) {
      setToastMessage('코드명을 입력해주세요.')
      return
    }
    const code = codeDraft.code.trim() || autoCommonCodeValue(name, selectedCodeGroup)
    const nextSortOrder = Math.max(0, ...selectedCodeGroup.codes.map((item) => item.sortOrder)) + 1
    setCommonCodeBusy(true)
    try {
      await createCommonCode(selectedCodeGroup.id, { code, name, sortOrder: nextSortOrder, active: true })
      await reloadCommonCodes()
      setCodeDraft({ code: '', name: '' })
      setIsCodeAddDialogOpen(false)
      setIsCodeBatchEditing(false)
      setCodeDeleteIds([])
      setToastMessage('공통코드를 추가했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '공통코드를 추가하지 못했습니다.'))
    } finally {
      setCommonCodeBusy(false)
    }
  }

  function openCommonCodeAddDialog() {
    setCodeDraft({ code: '', name: '' })
    setIsCodeAddDialogOpen(true)
  }

  function startCommonCodeBatchEdit(group: CommonCodeGroupWithCodes) {
    setIsCodeAddDialogOpen(false)
    setCodeBatchRows(commonCodeBatchRows(group))
    setCodeDeleteIds([])
    setIsCodeBatchEditing(true)
  }

  function cancelCommonCodeBatchEdit(group: CommonCodeGroupWithCodes) {
    setCodeBatchRows(commonCodeBatchRows(group))
    setCodeDeleteIds([])
    setIsCodeBatchEditing(false)
  }

  function closeCommonCodeDetailDialog(group: CommonCodeGroupWithCodes) {
    setIsCodeAddDialogOpen(false)
    if (isCodeBatchEditing) {
      cancelCommonCodeBatchEdit(group)
      return
    }
    setIsCodeDetailDialogOpen(false)
  }

  function updateCommonCodeBatchName(id: number, name: string) {
    setCodeBatchRows((rows) => rows.map((row) => (row.id === id ? { ...row, name } : row)))
  }

  function toggleCommonCodeDelete(id: number) {
    setCodeDeleteIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]))
  }

  function applySelectedCommonCodeDelete() {
    const deleteIds = new Set(codeDeleteIds)
    const visibleDeleteCount = codeBatchRows.filter((row) => deleteIds.has(row.id)).length
    if (visibleDeleteCount === 0) {
      setToastMessage('삭제할 공통코드를 선택해주세요.')
      return
    }
    setCodeBatchRows((rows) => rows.filter((row) => !deleteIds.has(row.id)))
    setToastMessage('선택한 공통코드를 삭제 대상으로 표시했습니다. 저장을 눌러 반영해주세요.')
  }

  function moveCommonCodeBatchRow(index: number, direction: -1 | 1) {
    setCodeBatchRows((rows) => moveItem(rows, index, direction))
  }

  async function saveCommonCodeBatch(group: CommonCodeGroupWithCodes) {
    const deleteIds = new Set(codeDeleteIds)
    const rowsToSave = codeBatchRows.filter((row) => !deleteIds.has(row.id))
    if (rowsToSave.some((row) => !row.name.trim())) {
      setToastMessage('코드명을 입력해주세요.')
      return
    }
    setCommonCodeBusy(true)
    try {
      await Promise.all([
        ...Array.from(deleteIds).map((id) => deleteCommonCode(group.id, id)),
        ...rowsToSave.map((row, index) => updateCommonCode(group.id, row.id, {
          code: row.code.trim() || autoCommonCodeValue(row.name, group),
          name: row.name.trim(),
          sortOrder: index + 1,
          active: row.active,
        })),
      ])
      await reloadCommonCodes()
      setIsCodeBatchEditing(false)
      setCodeDeleteIds([])
      setToastMessage('공통코드를 저장했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '공통코드를 저장하지 못했습니다.'))
    } finally {
      setCommonCodeBusy(false)
    }
  }

  function reorderCommonCodeByTarget(sourceId: number, targetId: number) {
    if (sourceId === targetId || commonCodeBusy) return
    setCodeBatchRows((rows) => moveCodeRowToTarget(rows, sourceId, targetId))
  }

  function handleCommonCodeDragEnd() {
    stopCommonCodeAutoScroll()
    pointerPendingCodeDrag.current = null
    pointerDraggingCodeId.current = null
    setDraggingCodeId(null)
    setDragOverCodeId(null)
  }

  function codeIdFromPoint(x: number, y: number) {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-common-code-id]')
    const id = Number(target?.dataset.commonCodeId)
    return Number.isFinite(id) ? id : null
  }

  function scrollCommonCodeBy(top: number) {
    const scrollTarget = document.querySelector<HTMLElement>('.fp-admin-code-dialog-body')
    if (scrollTarget && scrollTarget.scrollHeight > scrollTarget.clientHeight) {
      scrollTarget.scrollBy({ top, behavior: 'auto' })
      return
    }
    window.scrollBy({ top, behavior: 'auto' })
  }

  function stopCommonCodeAutoScroll() {
    if (codeAutoScrollTimer.current !== null) {
      window.clearInterval(codeAutoScrollTimer.current)
      codeAutoScrollTimer.current = null
    }
    codeAutoScrollStep.current = 0
  }

  function startCommonCodeAutoScroll(step: number) {
    codeAutoScrollStep.current = step
    scrollCommonCodeBy(step)
    if (codeAutoScrollTimer.current !== null) return
    codeAutoScrollTimer.current = window.setInterval(() => {
      if (codeAutoScrollStep.current) scrollCommonCodeBy(codeAutoScrollStep.current)
    }, 45)
  }

  function scrollCommonCodeDragViewport(clientY: number) {
    const edgeSize = 110
    const maxStep = 26
    const scrollTarget = document.querySelector<HTMLElement>('.fp-admin-code-dialog-body')
    if (scrollTarget && scrollTarget.scrollHeight > scrollTarget.clientHeight) {
      const rect = scrollTarget.getBoundingClientRect()
      if (clientY < rect.top + edgeSize) {
        startCommonCodeAutoScroll(-Math.max(10, maxStep * (1 - (clientY - rect.top) / edgeSize)))
        return
      }
      if (clientY > rect.bottom - edgeSize) {
        startCommonCodeAutoScroll(Math.max(10, maxStep * (1 - (rect.bottom - clientY) / edgeSize)))
        return
      }
    }
    if (clientY < edgeSize) {
      startCommonCodeAutoScroll(-Math.max(10, maxStep * (1 - clientY / edgeSize)))
      return
    }
    if (clientY > window.innerHeight - edgeSize) {
      const distance = window.innerHeight - clientY
      startCommonCodeAutoScroll(Math.max(10, maxStep * (1 - distance / edgeSize)))
      return
    }
    stopCommonCodeAutoScroll()
  }

  function handleCommonCodePointerDown(event: ReactPointerEvent<HTMLElement>, code: CommonCodeBatchRow) {
    if (!isCodeBatchEditing || commonCodeBusy) return
    const target = event.target
    if (target instanceof HTMLElement && target.closest('button, label, input, select, textarea')) return
    pointerPendingCodeDrag.current = { id: code.id, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleCommonCodeDragHandlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, code: CommonCodeBatchRow) {
    if (!isCodeBatchEditing || commonCodeBusy) return
    event.preventDefault()
    event.stopPropagation()
    pointerPendingCodeDrag.current = { id: code.id, x: event.clientX, y: event.clientY }
    event.currentTarget.closest<HTMLElement>('[data-common-code-id]')?.setPointerCapture(event.pointerId)
  }

  function handleCommonCodePointerMove(event: ReactPointerEvent<HTMLElement>) {
    let sourceId = pointerDraggingCodeId.current
    const pending = pointerPendingCodeDrag.current
    if (!sourceId && pending) {
      const distance = Math.hypot(event.clientX - pending.x, event.clientY - pending.y)
      if (distance < 8) return
      sourceId = pending.id
      pointerDraggingCodeId.current = pending.id
      setDraggingCodeId(pending.id)
    }
    if (!sourceId) return
    event.preventDefault()
    scrollCommonCodeDragViewport(event.clientY)
    const targetId = codeIdFromPoint(event.clientX, event.clientY)
    if (targetId && targetId !== sourceId) {
      setDragOverCodeId(targetId)
      reorderCommonCodeByTarget(sourceId, targetId)
    }
  }

  function handleCommonCodePointerUp() {
    handleCommonCodeDragEnd()
  }

  function updateHomeSetting(key: HomeWidgetKey, checked: boolean) {
    setHomeSettings((current) => ({ ...current, [key]: checked }))
  }

  function resetHomeSettings() {
    setHomeSettings({ ...defaultHomeSettings })
    saveHomeSettings(defaultHomeSettings)
    setToastMessage('홈화면 설정을 기본값으로 되돌렸습니다.')
  }

  function submitHomeSettings() {
    saveHomeSettings(homeSettings)
    setToastMessage('홈화면 설정을 저장했습니다.')
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
      {loading ? <div className="fp-loading-blocker">설정 정보 확인 중</div> : null}
      <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />

      <div className="fp-admin-tabs admin-tabs" role="tablist" aria-label="설정">
        {visibleAdminTabs.map((tab) => (
          <button
            className={activeTab === tab.key ? 'active' : ''}
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => {
              if (!canAccessAdminTab(tab.key)) {
                onUnauthorized?.()
                return
              }
              setActiveTab(tab.key)
              cancelMenuBatchEdit()
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'analytics' && isPlatformAdmin ? <AnalyticsDashboard /> : null}

      {activeTab === 'user-data' && isPlatformAdmin ? <AdminUserDataLookup /> : null}

      {activeTab === 'moderation' && isPlatformAdmin ? <ModerationPanel onToast={setToastMessage} /> : null}

      {activeTab === 'batches' && isPlatformAdmin ? (
        <section className="fp-card fp-admin-panel fp-admin-batch-panel">
          <header className="fp-admin-panel-header panel-header">
            <div>
              <h2>배치관리</h2>
              <p>모든 자동 배치를 여기서 수동 실행할 수 있으며, 같은 배치는 20분 간격으로만 다시 실행할 수 있습니다.</p>
            </div>
            <button className="fp-admin-refresh-button" type="button" onClick={() => void refreshManagedBatches()} disabled={batchesLoading || Boolean(runningBatchKey)}>
              새로고침
            </button>
          </header>

          <div className="fp-admin-batch-list" aria-busy={batchesLoading}>
            {managedBatches.map((batch) => {
              const lastRun = batch.lastRun
              const lastRunText = lastRun
                ? `${new Date(lastRun.startedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' })} · ${lastRun.processedCount}건 · ${lastRun.status === 'COMPLETED' ? '완료' : lastRun.status === 'SKIPPED' ? '건너뜀' : lastRun.status === 'FAILED' ? '실패' : '실행 중'}`
                : '실행 이력이 없습니다.'
              return (
                <article className="fp-admin-batch-row" key={batch.key}>
                  <div className="fp-admin-batch-copy">
                    <div>
                      <strong>{batch.label}</strong>
                      <span>{batch.schedule}</span>
                    </div>
                    <p>{batch.description}</p>
                    <small>{lastRunText}</small>
                  </div>
                  <button
                    className="save-button"
                    type="button"
                    disabled={Boolean(runningBatchKey)}
                    onClick={() => void executeManagedBatch(batch)}
                  >
                    {runningBatchKey === batch.key ? '실행 중' : '실행'}
                  </button>
                </article>
              )
            })}
            {!batchesLoading && managedBatches.length === 0 ? <p className="fp-admin-empty">등록된 배치가 없습니다.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'menus' ? (
        <section className="fp-card fp-admin-panel fp-admin-menu-panel">
          <header className="fp-admin-panel-header panel-header">
            <div>
              <h2>메뉴 관리</h2>
              <p>{visibleMenuCount}개 메뉴 표시 중</p>
            </div>
            {isMenuBatchEditing ? (
              <button
                className="fp-admin-code-delete-selected-button"
                type="button"
                onClick={applySelectedMenuDelete}
                disabled={menuBatchRows.every((row) => !menuDeleteKeys.includes(row.key))}
              >
                선택 삭제
              </button>
            ) : (
              <button className="edit-button" type="button" onClick={startMenuBatchEdit}>
                수정
              </button>
            )}
          </header>

          <div className="fp-admin-menu-list menu-edit-list">
            {(isMenuBatchEditing ? menuBatchRows : menus).map((menu, index, rows) => {
              const fixedAdmin = menu.key === 'admin'
              const checkedForDelete = menuDeleteKeys.includes(menu.key)
              return (
                <article
                  className={`fp-admin-menu-row menu-edit-row${isMenuBatchEditing ? ' batch-editing' : ' viewing'}${!menu.visible ? ' muted' : ''}${checkedForDelete ? ' delete-selected' : ''}${draggingMenuKey === menu.key ? ' dragging' : ''}${dragOverMenuKey === menu.key ? ' drag-over' : ''}`}
                  data-menu-key={menu.key}
                  draggable={isMenuBatchEditing}
                  key={menu.key}
                  onDragEnd={handleMenuDragEnd}
                  onDragOver={(event) => handleMenuDragOver(event, menu)}
                  onDragStart={(event) => handleMenuDragStart(event, menu)}
                  onDrop={(event) => handleMenuDrop(event, menu)}
                  onPointerCancel={handleMenuPointerEnd}
                  onPointerDown={(event) => handleMenuPointerDown(event, menu)}
                  onPointerMove={handleMenuPointerMove}
                  onPointerUp={handleMenuPointerEnd}
                >
                  {isMenuBatchEditing ? (
                    <label className="fp-admin-code-select-check" aria-label={`${menu.label} 삭제 선택`}>
                      <input
                        type="checkbox"
                        checked={checkedForDelete}
                        disabled={fixedAdmin}
                        onChange={() => toggleMenuDelete(menu.key)}
                      />
                    </label>
                  ) : null}

                  {isMenuBatchEditing ? (
                    <div className="fp-admin-menu-fields menu-edit-fields">
                      <div className="fp-admin-menu-name-static">
                        <span>{menu.label}</span>
                      </div>
                      <button
                        className={`fp-admin-menu-visible-toggle${menu.visible ? ' active' : ''}`}
                        type="button"
                        aria-pressed={menu.visible}
                        aria-label={menu.visible ? '메뉴 사용 중' : '메뉴 숨김'}
                        disabled={fixedAdmin || checkedForDelete}
                        onClick={() => updateMenuBatchRow(menu.key, { visible: !menu.visible })}
                      >
                        <span>{menu.visible ? '메뉴 사용' : '메뉴 숨김'}</span>
                      </button>
                      <div className="fp-admin-role-chips menu-role-chips" role="group" aria-label="권한">
                        {roleOptions.map((role) => (
                          <button
                            className={menu.roles.includes(role) ? 'active' : ''}
                            key={role}
                            type="button"
                            onClick={() => toggleMenuBatchRole(menu.key, role)}
                            disabled={checkedForDelete}
                          >
                            {menuRoleChipLabel(role)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="fp-admin-menu-copy menu-readonly-fields">
                      <strong>{menu.label}</strong>
                      <small>{menuRoles(menu.roles).join(', ')}</small>
                    </div>
                  )}

                  {isMenuBatchEditing ? (
                    <div className="fp-admin-row-actions">
                      <>
                        <button
                          className="move-button"
                          type="button"
                          aria-label={`${menu.label} 위로 이동`}
                          onClick={(event) => {
                            event.stopPropagation()
                            moveMenuBatchRow(index, -1)
                          }}
                          disabled={index === 0 || checkedForDelete}
                        >
                          <CgChevronUp aria-hidden="true" />
                        </button>
                        <button
                          className="move-button"
                          type="button"
                          aria-label={`${menu.label} 아래로 이동`}
                          onClick={(event) => {
                            event.stopPropagation()
                            moveMenuBatchRow(index, 1)
                          }}
                          disabled={index === rows.length - 1 || checkedForDelete}
                        >
                          <CgChevronDown aria-hidden="true" />
                        </button>
                      </>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>

          {isMenuBatchEditing ? (
            <div className="fp-admin-menu-batch-footer">
              <button className="cancel-button" type="button" onClick={cancelMenuBatchEdit}>
                취소
              </button>
              <button className="save-button" type="button" onClick={saveMenuBatchEdit}>
                저장
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'codes' ? (
        <section className="fp-card fp-admin-panel fp-admin-common-panel">
          <header className="fp-admin-panel-header panel-header">
            <div>
              <h2>공통코드</h2>
              <p>입력 화면에 있는 선택 항목의 옵션값입니다.</p>
            </div>
          </header>
          <div className="fp-admin-code-toolbar">
            <CustomSelect
              className="fp-admin-code-menu-select"
              label="관리 메뉴"
              options={commonCodeMenus.map((menu) => ({ label: menu.label, value: menu.key }))}
              value={selectedCodeMenuKey}
              onChange={setSelectedCodeMenuKey}
            />
          </div>

          <div className="fp-admin-code-manager">
            <section className="fp-admin-code-groups" aria-label="코드그룹 목록">
              <header className="fp-admin-code-section-title">
                <strong>코드그룹</strong>
                <span>{filteredCodeGroups.length}개 그룹</span>
              </header>
              {filteredCodeGroups.length === 0 ? <p className="fp-admin-empty">등록된 코드그룹이 없습니다.</p> : null}
              {filteredCodeGroups.map((group) => (
                <article className={`${selectedCodeGroup?.id === group.id ? 'active' : ''}${!group.active ? ' muted' : ''}`} key={group.id}>
                  <button className="fp-admin-code-group-main" type="button" onClick={() => {
                    setSelectedCodeGroupId(group.id)
                    setCodeDraft({ code: '', name: '' })
                    setCodeBatchRows(commonCodeBatchRows(group))
                    setCodeDeleteIds([])
                    setIsCodeBatchEditing(false)
                    setIsCodeAddDialogOpen(false)
                    setIsCodeDetailDialogOpen(true)
                  }}>
                    <strong>{group.name}</strong>
                    <span>{group.codes.length}개 코드</span>
                  </button>
                </article>
              ))}
            </section>

            {isCodeDetailDialogOpen && selectedCodeGroup ? (
              <div className="fp-admin-code-dialog-backdrop" role="presentation" onClick={() => {
                closeCommonCodeDetailDialog(selectedCodeGroup)
              }}>
                <section className="fp-admin-code-detail fp-admin-code-detail-dialog" role="dialog" aria-modal="true" aria-label={`${selectedCodeGroup.name} 공통코드`} onClick={(event) => event.stopPropagation()}>
                  <header>
                    <div>
                      <strong>{selectedCodeGroup.name}</strong>
                      <span>{selectedCodeGroup.codes.length}개 코드</span>
                    </div>
                    <button className="fp-admin-code-dialog-close" type="button" aria-label="닫기" onClick={() => closeCommonCodeDetailDialog(selectedCodeGroup)}>
                      <HiOutlineX aria-hidden="true" />
                    </button>
                  </header>

                  <div className="fp-admin-code-dialog-body">
                  <div className="fp-admin-code-batch-toolbar">
                    {isCodeBatchEditing ? (
                      <>
                        <span>수정, 삭제, 순서 변경 후 저장해주세요.</span>
                        <button
                          className="fp-admin-code-delete-selected-button"
                          type="button"
                          onClick={applySelectedCommonCodeDelete}
                          disabled={commonCodeBusy || codeBatchRows.every((row) => !codeDeleteIds.includes(row.id))}
                        >
                          선택 삭제
                        </button>
                      </>
                    ) : (
                      <div className="fp-admin-code-toolbar-actions">
                        <button className="edit-button" type="button" onClick={openCommonCodeAddDialog} disabled={commonCodeBusy}>
                          추가
                        </button>
                        <button className="edit-button" type="button" onClick={() => startCommonCodeBatchEdit(selectedCodeGroup)} disabled={commonCodeBusy || selectedCodeGroup.codes.length === 0}>
                          수정
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="fp-admin-common-code-list">
                    {(isCodeBatchEditing ? codeBatchRows : commonCodeBatchRows(selectedCodeGroup)).map((code, index, rows) => {
                      const checkedForDelete = codeDeleteIds.includes(code.id)
                      return (
                        <article
                          className={`${isCodeBatchEditing ? 'batch-editing ' : ''}${!code.active ? 'muted' : ''}${checkedForDelete ? ' delete-selected' : ''}${draggingCodeId === code.id ? ' dragging' : ''}${dragOverCodeId === code.id ? ' drag-over' : ''}`}
                          data-common-code-id={code.id}
                          key={code.id}
                          onPointerDown={(event) => handleCommonCodePointerDown(event, code)}
                          onPointerMove={handleCommonCodePointerMove}
                          onPointerUp={handleCommonCodePointerUp}
                          onPointerCancel={handleCommonCodeDragEnd}
                        >
                          {isCodeBatchEditing ? (
                            <label className="fp-admin-code-select-check" aria-label={`${code.name} 삭제 선택`}>
                              <input
                                type="checkbox"
                                checked={checkedForDelete}
                                onChange={() => toggleCommonCodeDelete(code.id)}
                              />
                            </label>
                          ) : null}
                          <div className="fp-admin-code-copy">
                            {isCodeBatchEditing ? (
                              <div className="fp-admin-code-inline-form">
                                <input
                                  value={code.name}
                                  onChange={(event) => updateCommonCodeBatchName(code.id, event.target.value)}
                                  aria-label="코드명"
                                  disabled={checkedForDelete}
                                />
                                <button
                                  className="fp-admin-code-drag-handle"
                                  type="button"
                                  aria-label={`${code.name} 순서 변경`}
                                  onPointerDown={(event) => handleCommonCodeDragHandlePointerDown(event, code)}
                                >
                                  ⋮⋮
                                </button>
                              </div>
                            ) : (
                              <strong>{code.name}</strong>
                            )}
                          </div>
                          {isCodeBatchEditing ? (
                            <div className="fp-admin-code-row-controls">
                              <div className="fp-admin-code-order-buttons">
                                <button
                                  className="move-button"
                                  type="button"
                                  aria-label={`${code.name} 위로 이동`}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    moveCommonCodeBatchRow(index, -1)
                                  }}
                                  disabled={index === 0 || commonCodeBusy}
                                >
                                  <CgChevronUp aria-hidden="true" />
                                </button>
                                <button
                                  className="move-button"
                                  type="button"
                                  aria-label={`${code.name} 아래로 이동`}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    moveCommonCodeBatchRow(index, 1)
                                  }}
                                  disabled={index === rows.length - 1 || commonCodeBusy}
                                >
                                  <CgChevronDown aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                    {selectedCodeGroup.codes.length === 0 ? <p className="fp-admin-empty">등록된 공통코드가 없습니다.</p> : null}
                  </div>

                  {isCodeBatchEditing ? (
                    <div className="fp-admin-code-batch-footer">
                      <button className="cancel-button" type="button" onClick={() => cancelCommonCodeBatchEdit(selectedCodeGroup)} disabled={commonCodeBusy}>
                        취소
                      </button>
                      <button className="save-button" type="button" onClick={() => void saveCommonCodeBatch(selectedCodeGroup)} disabled={commonCodeBusy}>
                        저장
                      </button>
                    </div>
                  ) : null}

                  {isCodeAddDialogOpen ? (
                    <div className="fp-admin-code-add-dialog-backdrop" role="presentation" onClick={() => setIsCodeAddDialogOpen(false)}>
                      <form
                        className="fp-admin-code-add-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-label="공통코드 추가"
                        onClick={(event) => event.stopPropagation()}
                        onSubmit={(event) => {
                          event.preventDefault()
                          void submitCommonCode()
                        }}
                      >
                        <header>
                          <strong>공통코드 추가</strong>
                          <button className="fp-admin-code-dialog-close" type="button" aria-label="닫기" onClick={() => setIsCodeAddDialogOpen(false)}>
                            <HiOutlineX aria-hidden="true" />
                          </button>
                        </header>
                        <label>
                          <span>코드명</span>
                          <input
                            value={codeDraft.name}
                            onChange={(event) => setCodeDraft((current) => ({ ...current, name: event.target.value }))}
                            placeholder="식비"
                            autoFocus
                          />
                        </label>
                        <button className="save-button" type="submit" disabled={commonCodeBusy}>
                          저장
                        </button>
                      </form>
                    </div>
                  ) : null}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'home' ? (
        <section className="fp-card fp-admin-panel">
          <header className="fp-admin-panel-header panel-header">
            <div>
              <h2>홈화면</h2>
              <p>내 홈 화면에 보여줄 카드와 목록을 선택합니다.</p>
            </div>
          </header>
          <div className="fp-admin-home-settings">
            {homeSettingItems.map((key) => (
              <label className="fp-admin-home-setting-row" key={key}>
                <input
                  type="checkbox"
                  checked={homeSettings[key]}
                  onChange={(event) => updateHomeSetting(key, event.target.checked)}
                />
                <span>
                  <strong>{homeWidgetLabels[key]}</strong>
                  <small>{key === 'recentLedger' ? '최근 가계부 목록 표시' : '홈 상단 요약 카드 표시'}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="fp-admin-home-actions">
            <button className="cancel-button" type="button" onClick={resetHomeSettings}>
              기본값
            </button>
            <button className="save-button" type="button" onClick={submitHomeSettings}>
              저장
            </button>
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
