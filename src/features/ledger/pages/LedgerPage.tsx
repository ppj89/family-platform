import { type CSSProperties, FormEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { apiActionMessage, isAuthError } from '../../../shared/api/client'
import { ConfirmDialog, DatePickerField, ToastMessage } from '../../../shared/components'
import { COMMON_CODE_GROUPS, FAMILY_MEMBER_OPTIONS, LEDGER_CATEGORIES, LEDGER_ENTRY_TYPE_OPTIONS, LEDGER_PAYMENT_METHODS } from '../../../shared/constants/commonCodes'
import { useCommonCodeOptions } from '../../../shared/hooks'
import { monthRange, parseDateKey, todayKey } from '../../../shared/utils/date'
import { formatNumberInput, normalizeAmount } from '../../../shared/utils/number'
import { createLedgerEntry, deleteLedgerEntry, getLedgerSummary, listLedgerEntries, updateLedgerEntry } from '../api/ledger'
import type { LedgerEntry, LedgerPayload, LedgerSummary } from '../types'
import './ledger-page.css'

type LedgerQueryMode = 'month' | 'period'
type ConfirmState = 'save' | 'detail-save' | 'delete' | null
type DetailMode = 'view' | 'edit'
type LedgerSelectOption = { label: string; value: string }
type QuickNavPosition = { x: number; y: number }

const quickNavPositionKey = 'family-platform-ledger-quick-nav-position'

function readQuickNavPosition() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(quickNavPositionKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<QuickNavPosition>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null
    return parsed as QuickNavPosition
  } catch {
    return null
  }
}

type ParsedLedgerSms = {
  amount: number
  title: string
  entryType: LedgerPayload['entryType']
  category?: string
  paymentMethod?: string
  transactionDate?: string
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const smsCardWords =
  /국민|KB|신한|삼성|현대|롯데|우리|하나|BC|비씨|NH|농협|카카오뱅크|토스|체크카드|카드|승인|이용|사용|일시불|취소|결제|알림|ARS|고객|누적|잔액|한도|포인트|원|KRW|출금|입금|오전|오후|온라인|모바일/gi
const smsNoiseLine =
  /잔액|누적|한도|포인트|승인번호|카드번호|문의|고객센터|할부|월\s*\d+회|URL|http|www/i

const emptyPayload = (): LedgerPayload => ({
  title: '',
  entryType: 'expense',
  category: '식비',
  paymentMethod: '카드',
  memberName: '아빠',
  amount: 0,
  transactionDate: todayKey(),
  memo: '',
})

const emptySummary: LedgerSummary = { expense: 0, income: 0, total: 0 }

function money(value: number) {
  return `${Math.round(value || 0).toLocaleString('ko-KR')}원`
}

function signedMoney(item: LedgerEntry) {
  return `${item.entryType === 'income' ? '+' : '-'}${money(item.amount)}`
}

function signedTotalMoney(value: number) {
  if (value === 0) return money(0)
  return `${value > 0 ? '+' : '-'}${money(Math.abs(value))}`
}

function dailyTotal(items: LedgerEntry[]) {
  return items.reduce((sum, item) => sum + (item.entryType === 'income' ? item.amount : -item.amount), 0)
}

function sortEntries(items: LedgerEntry[]) {
  return [...items].sort((a, b) => `${b.transactionDate} ${b.createdAt}`.localeCompare(`${a.transactionDate} ${a.createdAt}`))
}

function formatDisplayDate(value: string) {
  const date = parseDateKey(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} (${weekdays[date.getDay()]})`
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-')
  return `${year}년 ${Number(month)}월`
}

function groupEntriesByDate(items: LedgerEntry[]) {
  return sortEntries(items).reduce<Array<{ date: string; items: LedgerEntry[] }>>((groups, item) => {
    const found = groups.find((group) => group.date === item.transactionDate)
    if (found) found.items.push(item)
    else groups.push({ date: item.transactionDate, items: [item] })
    return groups
  }, [])
}

function toDateKey(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseSmsDate(text: string) {
  const fullDate = text.match(/(20\d{2})\s*[년./-]\s*(\d{1,2})\s*[월./-]\s*(\d{1,2})\s*일?/)
  if (fullDate) return toDateKey(Number(fullDate[1]), Number(fullDate[2]), Number(fullDate[3]))

  const year = new Date().getFullYear()
  const koreanDate = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (koreanDate) return toDateKey(year, Number(koreanDate[1]), Number(koreanDate[2]))

  const shortDate = text.match(/(?:^|[^\d])(\d{1,2})\s*[./-]\s*(\d{1,2})(?:[^\d]|$)/)
  if (shortDate) return toDateKey(year, Number(shortDate[1]), Number(shortDate[2]))

  return ''
}

function extractSmsAmount(text: string) {
  const matches = Array.from(text.matchAll(/(?:₩|KRW\s*)?(-?\d{1,3}(?:,\d{3})+|-?\d{4,}|-?\d+)\s*(원|KRW|￦)?/gi))
  const candidates = matches
    .map((match) => {
      const start = match.index ?? 0
      const end = start + match[0].length
      const context = text.slice(Math.max(0, start - 16), Math.min(text.length, end + 16))
      const amount = Math.abs(normalizeAmount(match[1]))
      const hasCurrency = Boolean(match[2]) || /[₩￦]/.test(match[0])
      const score =
        (hasCurrency ? 4 : 0) +
        (/승인|이용|사용|결제|출금|입금|지출|수입|금액/.test(context) ? 2 : 0) -
        (smsNoiseLine.test(context) ? 4 : 0) -
        (/^\d{1,2}$/.test(match[1].replace(/,/g, '')) ? 3 : 0)
      return { amount, score, hasCurrency }
    })
    .filter((candidate) => candidate.amount >= 100 && (candidate.hasCurrency || candidate.score > 0))
    .sort((a, b) => b.score - a.score || b.amount - a.amount)

  return candidates[0]?.amount || 0
}

function cleanSmsMerchantCandidate(value: string) {
  return value
    .replace(/\[[^\]]+]/g, ' ')
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/\d{4}\s*[년./-]\s*\d{1,2}\s*[월./-]\s*\d{1,2}\s*일?/g, ' ')
    .replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g, ' ')
    .replace(/\d{1,2}\s*[:시]\s*\d{1,2}\s*분?/g, ' ')
    .replace(/(?:₩|KRW\s*)?-?\d{1,3}(?:,\d{3})+\s*(?:원|KRW|￦)?/gi, ' ')
    .replace(/-?\d{4,}\s*(?:원|KRW|￦)/gi, ' ')
    .replace(smsCardWords, ' ')
    .replace(/[^\w가-힣\s&().+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSmsTitle(text: string) {
  const lineCandidates = text
    .split(/\r?\n|[|]/)
    .map((line) => line.trim())
    .filter((line) => line && !smsNoiseLine.test(line))
    .map(cleanSmsMerchantCandidate)
    .filter((candidate) => /[가-힣A-Za-z]/.test(candidate) && candidate.length >= 2)

  if (lineCandidates[0]) return lineCandidates[0].slice(0, 40)

  const collapsed = cleanSmsMerchantCandidate(text)
  const token = collapsed.split(' ').find((part) => /[가-힣A-Za-z]/.test(part) && part.length >= 2)
  return token ? token.slice(0, 40) : ''
}

function guessLedgerPaymentMethod(text: string) {
  if (/현금/.test(text)) return '현금'
  if (/카카오페이|네이버페이|토스페이|페이코|삼성페이|애플페이|간편결제/.test(text)) return '간편결제'
  if (/계좌|이체|송금|입금|출금/.test(text)) return '계좌이체'
  if (/카드|체크|승인|일시불/.test(text)) return '카드'
  return ''
}

function guessLedgerCategory(text: string) {
  const value = text.toLowerCase()
  if (/병원|약국|의원|치과|의료/.test(value)) return '의료'
  if (/학원|교육|학교|도서|문구/.test(value)) return '교육'
  if (/여행|숙박|호텔|항공|기차|ktx|펜션|리조트/.test(value)) return '여행'
  if (/교통|택시|버스|지하철|주차|주유|기름|하이패스|차량/.test(value)) return '교통'
  if (/마트|편의점|다이소|쿠팡|생활|슈퍼|올리브영/.test(value)) return '생활'
  if (/식비|식당|카페|커피|치킨|피자|버거|롯데리아|맥도날드|스타벅스|빽다방|이디야|빵|분식|김밥|밥|저녁|점심|아침|분유/.test(value)) {
    return '식비'
  }
  return ''
}

function parseSmsText(text: string): ParsedLedgerSms {
  const isIncome = /입금|급여|환급|수입|이자|캐시백|환불/.test(text) && !/출금|결제|승인|사용|이용/.test(text)
  return {
    amount: extractSmsAmount(text),
    title: extractSmsTitle(text),
    entryType: isIncome ? 'income' : 'expense',
    category: guessLedgerCategory(text),
    paymentMethod: guessLedgerPaymentMethod(text),
    transactionDate: parseSmsDate(text),
  }
}

function LedgerCustomSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: LedgerSelectOption[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLLabelElement>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    function closeOnOutside(event: MouseEvent | FocusEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('focusin', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('focusin', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <label className={`fp-field ledger-custom-select custom-select-field ${open ? 'open' : ''}`} ref={rootRef}>
      <span>{label}</span>
      <div className={`custom-select${open ? ' open' : ''}`}>
        <button className={`custom-select-trigger${open ? ' open' : ''}`} type="button" onClick={() => setOpen((current) => !current)}>
          <span>{selected?.label || '선택'}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
        <div className="custom-select-list" hidden={!open}>
          {options.map((option) => (
            <button
              className={option.value === selected?.value ? 'selected' : ''}
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </label>
  )
}

export default function LedgerPage() {
  const today = todayKey()
  const currentMonth = today.slice(0, 7)
  const quickNavRef = useRef<HTMLElement | null>(null)
  const quickNavDragRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  })
  const suppressQuickNavClickRef = useRef(false)
  const ledgerTopRef = useRef<HTMLElement | null>(null)
  const ledgerListEndRef = useRef<HTMLDivElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [queryMode, setQueryMode] = useState<LedgerQueryMode>('month')
  const [monthValue, setMonthValue] = useState(currentMonth)
  const [periodStart, setPeriodStart] = useState(`${currentMonth}-01`)
  const [periodEnd, setPeriodEnd] = useState(today)
  const [isSmsParserOpen, setIsSmsParserOpen] = useState(false)
  const [smsText, setSmsText] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [summary, setSummary] = useState<LedgerSummary>(emptySummary)
  const [form, setForm] = useState<LedgerPayload>(() => emptyPayload())
  const [isEntryDialogOpen, setIsEntryDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null)
  const [detailMode, setDetailMode] = useState<DetailMode>('view')
  const [detailForm, setDetailForm] = useState<LedgerPayload>(() => emptyPayload())
  const [loading, setLoading] = useState(false)
  const [ledgerActionLoading, setLedgerActionLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false)
  const [isQuickNavDragging, setIsQuickNavDragging] = useState(false)
  const [quickNavPosition, setQuickNavPosition] = useState<QuickNavPosition | null>(() => readQuickNavPosition())
  const [confirmAction, setConfirmAction] = useState<ConfirmState>(null)
  const [pendingDelete, setPendingDelete] = useState<LedgerEntry | null>(null)
  const ledgerCategoryOptions = useCommonCodeOptions(COMMON_CODE_GROUPS.ledgerCategories, LEDGER_CATEGORIES)
  const ledgerPaymentMethodOptions = useCommonCodeOptions(COMMON_CODE_GROUPS.ledgerPaymentMethods, LEDGER_PAYMENT_METHODS)
  const familyMemberOptions = useCommonCodeOptions(COMMON_CODE_GROUPS.familyMembers, FAMILY_MEMBER_OPTIONS)

  const range = useMemo(() => {
    if (queryMode === 'period') return { startDate: periodStart, endDate: periodEnd }
    return monthRange(parseDateKey(`${monthValue}-01`))
  }, [monthValue, periodEnd, periodStart, queryMode])
  const groupedEntries = useMemo(() => groupEntriesByDate(entries), [entries])
  const isLedgerActionLoading = ledgerActionLoading
  const quickNavStyle = quickNavPosition
    ? ({ left: `${quickNavPosition.x}px`, top: `${quickNavPosition.y}px` } satisfies CSSProperties)
    : undefined

  function clampQuickNavPosition(x: number, y: number) {
    const rect = quickNavRef.current?.getBoundingClientRect()
    const width = rect?.width || 44
    const height = rect?.height || 44
    const margin = 8
    return {
      x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - width - margin)),
      y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - height - margin)),
    }
  }

  function storeQuickNavPosition(position: QuickNavPosition) {
    try {
      window.localStorage.setItem(quickNavPositionKey, JSON.stringify(position))
    } catch {
      // Dragging should still work if storage is unavailable.
    }
  }

  function startQuickNavDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    const rect = quickNavRef.current?.getBoundingClientRect()
    if (!rect) return
    quickNavDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsQuickNavDragging(true)
  }

  function moveQuickNav(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = quickNavDragRef.current
    if (drag.pointerId !== event.pointerId) return
    const diffX = event.clientX - drag.startX
    const diffY = event.clientY - drag.startY
    if (Math.abs(diffX) + Math.abs(diffY) > 4) {
      drag.moved = true
      suppressQuickNavClickRef.current = true
    }
    if (!drag.moved) return
    setQuickNavPosition(clampQuickNavPosition(drag.originX + diffX, drag.originY + diffY))
  }

  function stopQuickNavDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = quickNavDragRef.current
    if (drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setIsQuickNavDragging(false)
    quickNavDragRef.current.pointerId = -1
    if (!drag.moved) return
    const rect = quickNavRef.current?.getBoundingClientRect()
    if (!rect) return
    const position = clampQuickNavPosition(rect.left, rect.top)
    setQuickNavPosition(position)
    storeQuickNavPosition(position)
  }

  useEffect(() => {
    function clampOnResize() {
      setQuickNavPosition((current) => {
        if (!current) return current
        const position = clampQuickNavPosition(current.x, current.y)
        storeQuickNavPosition(position)
        return position
      })
    }

    window.addEventListener('resize', clampOnResize)
    return () => window.removeEventListener('resize', clampOnResize)
  }, [])

  useEffect(() => {
    if (!quickNavPosition) return
    const frame = window.requestAnimationFrame(() => {
      setQuickNavPosition((current) => {
        if (!current) return current
        const position = clampQuickNavPosition(current.x, current.y)
        storeQuickNavPosition(position)
        return position
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isQuickNavOpen])

  async function reloadLedger() {
    setLoading(true)
    setMessage('')
    try {
      const [nextSummary, nextEntries] = await Promise.all([
        getLedgerSummary(range.startDate, range.endDate),
        listLedgerEntries(range.startDate, range.endDate),
      ])
      setSummary(nextSummary)
      setEntries(sortEntries(nextEntries))
    } catch (error) {
      if (isAuthError(error)) {
        setSummary(emptySummary)
        setEntries([])
        return
      }
      setMessage(apiActionMessage(error, '가계부 내역을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadLedger()
  }, [range.startDate, range.endDate])

  function focusForm() {
    window.setTimeout(() => {
      titleInputRef.current?.focus({ preventScroll: true })
    }, 0)
  }

  function scrollLedgerTop() {
    ledgerTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setIsQuickNavOpen(false)
  }

  function scrollLedgerListEnd() {
    ledgerListEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    setIsQuickNavOpen(false)
  }

  function startCreateEntry() {
    if (editingId) {
      setEditingId(null)
      setForm(emptyPayload())
    }
    setIsQuickNavOpen(false)
    setIsEntryDialogOpen(true)
    focusForm()
  }

  function closeEntryDialog() {
    if (isLedgerActionLoading) return
    if (editingId) resetForm()
    setIsEntryDialogOpen(false)
  }

  function payloadFromEntry(item: LedgerEntry): LedgerPayload {
    return {
      title: item.title,
      entryType: item.entryType,
      category: item.category || ledgerCategoryOptions[0] || '기타',
      paymentMethod: item.paymentMethod || ledgerPaymentMethodOptions[0] || '기타',
      memberName: item.memberName || familyMemberOptions[0] || '아빠',
      amount: item.amount,
      transactionDate: item.transactionDate,
      memo: item.memo || '',
    }
  }

  function normalizePayload(payload: LedgerPayload): LedgerPayload {
    return {
      ...payload,
      title: payload.title.trim(),
      category: payload.category || null,
      paymentMethod: payload.paymentMethod || null,
      memberName: payload.memberName?.trim() || null,
      memo: payload.memo?.trim() || null,
    }
  }

  function openLedgerDetail(item: LedgerEntry) {
    setSelectedEntry(item)
    setDetailMode('view')
    setDetailForm(payloadFromEntry(item))
  }

  function closeLedgerDetail() {
    setSelectedEntry(null)
    setDetailMode('view')
  }

  function startDetailEdit() {
    if (!selectedEntry) return
    setDetailForm(payloadFromEntry(selectedEntry))
    setDetailMode('edit')
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyPayload())
  }

  function validatePayload(payload: LedgerPayload) {
    if (!payload.title.trim()) return '내용을 입력해주세요.'
    if (!payload.transactionDate) return '거래일을 선택해주세요.'
    if (!payload.amount) return '금액을 입력해주세요.'
    return ''
  }

  function validateForm() {
    return validatePayload(form)
  }

  function requestSave(event: FormEvent) {
    event.preventDefault()
    const validation = validateForm()
    if (validation) {
      setMessage(validation)
      return
    }
    setConfirmAction('save')
  }

  async function confirmSave() {
    setConfirmAction(null)
    setLedgerActionLoading(true)
    setLoading(true)
    setMessage('')
    const wasEditing = Boolean(editingId)
    try {
      const payload = normalizePayload(form)
      if (editingId) await updateLedgerEntry(editingId, payload)
      else await createLedgerEntry(payload)
      resetForm()
      await reloadLedger()
      setIsEntryDialogOpen(false)
      setMessage(wasEditing ? '가계부 내역을 수정했습니다.' : '가계부 내역을 추가했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, wasEditing ? '가계부 수정에 실패했습니다.' : '가계부 추가에 실패했습니다.'))
    } finally {
      setLedgerActionLoading(false)
      setLoading(false)
    }
  }

  function requestDetailSave(event: FormEvent) {
    event.preventDefault()
    if (!selectedEntry) return
    const validation = validatePayload(detailForm)
    if (validation) {
      setMessage(validation)
      return
    }
    setConfirmAction('detail-save')
  }

  async function confirmDetailSave() {
    if (!selectedEntry) return
    setConfirmAction(null)
    setLedgerActionLoading(true)
    setLoading(true)
    setMessage('')
    try {
      const payload = normalizePayload(detailForm)
      const updatedEntry = await updateLedgerEntry(selectedEntry.id, payload)
      await reloadLedger()
      setSelectedEntry(updatedEntry)
      setDetailForm(payloadFromEntry(updatedEntry))
      setDetailMode('view')
      setMessage('가계부 내역을 수정했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '가계부 수정에 실패했습니다.'))
    } finally {
      setLedgerActionLoading(false)
      setLoading(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setConfirmAction(null)
    setLedgerActionLoading(true)
    setLoading(true)
    setMessage('')
    try {
      await deleteLedgerEntry(pendingDelete.id)
      if (editingId === pendingDelete.id) resetForm()
      if (selectedEntry?.id === pendingDelete.id) closeLedgerDetail()
      await reloadLedger()
      setMessage('가계부 내역을 삭제했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '가계부 삭제에 실패했습니다.'))
    } finally {
      setPendingDelete(null)
      setLedgerActionLoading(false)
      setLoading(false)
    }
  }

  function requestDelete(item: LedgerEntry) {
    setPendingDelete(item)
    setConfirmAction('delete')
  }

  function autofillFromSms() {
    const parsed = parseSmsText(smsText)
    if (!parsed.title && !parsed.amount && !parsed.transactionDate) {
      setSmsMessage('추출할 금액이나 가맹점 후보를 찾지 못했습니다.')
      return
    }
    const category = parsed.category && ledgerCategoryOptions.includes(parsed.category) ? parsed.category : ''
    const paymentMethod =
      parsed.paymentMethod && ledgerPaymentMethodOptions.includes(parsed.paymentMethod) ? parsed.paymentMethod : ''
    setForm((current) => ({
      ...current,
      title: parsed.title || current.title,
      amount: parsed.amount || current.amount,
      entryType: parsed.entryType,
      category: category || current.category,
      paymentMethod: paymentMethod || current.paymentMethod || ledgerPaymentMethodOptions[0] || '카드',
      transactionDate: parsed.transactionDate || current.transactionDate,
    }))
    setSmsMessage('')
    setMessage('문자 내용을 기준으로 입력값을 채웠습니다.')
    setSmsText('')
    setIsSmsParserOpen(false)
    setIsEntryDialogOpen(true)
    focusForm()
  }

  function openSmsParser() {
    setSmsMessage('')
    setIsSmsParserOpen(true)
  }

  return (
    <>
      <section className="fp-ledger content-grid">
        {loading ? <div className="fp-loading-blocker">처리 중</div> : null}

        <article className="panel wide fp-ledger-panel" ref={ledgerTopRef}>
          <header className="panel-header fp-ledger-section-header">
            <h2>가계부 조회</h2>
            <button type="button" className="fp-ledger-input-jump" onClick={startCreateEntry}>입력</button>
          </header>

          <section className="filter-panel fp-ledger-filter">
            <div className={`fp-ledger-query-row ${queryMode === 'period' ? 'period-mode' : 'month-mode'}`}>
              <div className="fp-ledger-query-tabs" role="tablist" aria-label="가계부 조회 방식">
                <button className={queryMode === 'month' ? 'active' : ''} type="button" onClick={() => setQueryMode('month')}>월별</button>
                <button className={queryMode === 'period' ? 'active' : ''} type="button" onClick={() => setQueryMode('period')}>기간별</button>
              </div>
              {queryMode === 'month' ? (
                <DatePickerField
                  className="fp-ledger-month-picker"
                  displayValue={formatMonthLabel(monthValue)}
                  label="조회 월"
                  mode="month"
                  showCalendarIcon
                  value={monthValue}
                  onChange={setMonthValue}
                />
              ) : (
                <div className="fp-ledger-period-fields">
                  <DatePickerField label="시작일" value={periodStart} onChange={setPeriodStart} />
                  <DatePickerField label="종료일" value={periodEnd} onChange={setPeriodEnd} />
                </div>
              )}
            </div>
          </section>

          <div className="ledger-summary" aria-label="가계부 요약">
            <article className="metric coral">
              <span>총 지출</span>
              <strong>{money(summary.expense)}</strong>
            </article>
            <article className="metric green">
              <span>총 수입</span>
              <strong>{money(summary.income)}</strong>
            </article>
            <article className={`metric ${summary.total < 0 ? 'coral' : 'blue'}`}>
              <span>합계</span>
              <strong>{money(summary.total)}</strong>
            </article>
          </div>

          <div className="fp-ledger-auto-action">
            <button type="button" onClick={openSmsParser}>카드 붙여넣기</button>
          </div>

          <ToastMessage message={message} onClose={() => setMessage('')} />

          <section className="daily-ledger api-ledger-list-host" aria-label="가계부 내역">
            {groupedEntries.length ? groupedEntries.map((group) => (
              <section className="api-ledger-day" key={group.date}>
                <header>
                  <strong>{formatDisplayDate(group.date)}</strong>
                  <span className={dailyTotal(group.items) > 0 ? 'income' : dailyTotal(group.items) < 0 ? 'expense' : ''}>{signedTotalMoney(dailyTotal(group.items))}</span>
                </header>
                {group.items.map((item) => (
                  <article className="ledger-row api-ledger-row" key={item.id}>
                    <button type="button" className="ledger-row-main" onClick={() => openLedgerDetail(item)}>
                      <strong>{item.title}</strong>
                      <span>{item.category || '-'} · {item.memberName || '-'} · {item.paymentMethod || '-'}</span>
                    </button>
                    <b className={item.entryType}>{signedMoney(item)}</b>
                  </article>
                ))}
              </section>
            )) : <p className="fp-empty-text">해당 기간의 가계부 내역이 없습니다.</p>}
          </section>
          <div className="fp-ledger-list-end" ref={ledgerListEndRef} aria-hidden="true" />
        </article>

        <nav
          className={`fp-ledger-scroll-nav${isQuickNavOpen ? ' open' : ''}${quickNavPosition ? ' positioned' : ''}${isQuickNavDragging ? ' dragging' : ''}`}
          style={quickNavStyle}
          ref={quickNavRef}
          aria-label="가계부 빠른 이동"
        >
          {isQuickNavOpen ? (
            <div className="fp-ledger-scroll-menu">
              <button type="button" aria-label="위로 이동" onClick={scrollLedgerTop}>↑</button>
              <button type="button" aria-label="아래로 이동" onClick={scrollLedgerListEnd}>↓</button>
              <button type="button" onClick={startCreateEntry}>입력</button>
            </div>
          ) : null}
          <button
            type="button"
            className="fp-ledger-scroll-toggle"
            aria-label={isQuickNavOpen ? '빠른 이동 접기' : '빠른 이동 열기'}
            aria-expanded={isQuickNavOpen}
            onPointerDown={startQuickNavDrag}
            onPointerMove={moveQuickNav}
            onPointerUp={stopQuickNavDrag}
            onPointerCancel={stopQuickNavDrag}
            onClick={() => {
              if (suppressQuickNavClickRef.current) {
                suppressQuickNavClickRef.current = false
                return
              }
              setIsQuickNavOpen((value) => !value)
            }}
          >
            {isQuickNavOpen ? '-' : '+'}
          </button>
        </nav>
      </section>

      {isEntryDialogOpen ? (
        <div className="patch-ledger-detail-backdrop fp-ledger-entry-backdrop" role="presentation" onClick={closeEntryDialog}>
          <form
            className="patch-ledger-detail-dialog ledger-form fp-ledger-entry-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fp-ledger-entry-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={requestSave}
          >
            <button type="button" className="dialog-close" aria-label="닫기" onClick={closeEntryDialog}>×</button>
            <h2 id="fp-ledger-entry-title">{editingId ? '가계부 수정' : '가계부 입력'}</h2>

            <div className="ledger-form-grid">
              <label className="span-2">
                <span>내용 <em className="fp-required-mark">*</em></span>
                <input ref={titleInputRef} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} />
              </label>
              <label>
                <span>금액 <em className="fp-required-mark">*</em></span>
                <input
                  inputMode="numeric"
                  value={formatNumberInput(form.amount)}
                  onChange={(event) => setForm((value) => ({ ...value, amount: normalizeAmount(event.target.value) }))}
                />
              </label>
              <DatePickerField
                className="fp-ledger-form-date"
                label="날짜"
                required
                value={form.transactionDate}
                onChange={(value) => setForm((current) => ({ ...current, transactionDate: value }))}
              />
              <LedgerCustomSelect
                label="구분"
                options={[...LEDGER_ENTRY_TYPE_OPTIONS]}
                value={form.entryType}
                onChange={(value) => setForm((current) => ({ ...current, entryType: value as LedgerPayload['entryType'] }))}
              />
              <LedgerCustomSelect
                label="카테고리"
                options={ledgerCategoryOptions.map((item) => ({ label: item, value: item }))}
                value={form.category || ''}
                onChange={(value) => setForm((current) => ({ ...current, category: value || null }))}
              />
              <LedgerCustomSelect
                label="결제수단"
                options={ledgerPaymentMethodOptions.map((item) => ({ label: item, value: item }))}
                value={form.paymentMethod || ''}
                onChange={(value) => setForm((current) => ({ ...current, paymentMethod: value || null }))}
              />
              <LedgerCustomSelect
                label="사용자"
                options={familyMemberOptions.map((item) => ({ label: item, value: item }))}
                value={form.memberName || ''}
                onChange={(value) => setForm((current) => ({ ...current, memberName: value || null }))}
              />
              <label className="span-2">
                <span>메모</span>
                <textarea value={form.memo || ''} onChange={(event) => setForm((value) => ({ ...value, memo: event.target.value }))} />
              </label>
            </div>

            <div className="ledger-detail-actions">
              <button type="button" className="edit-button muted" disabled={isLedgerActionLoading} onClick={closeEntryDialog}>취소</button>
              <button
                className={`edit-button${isLedgerActionLoading ? ' fp-button-loading' : ''}`}
                type="submit"
                disabled={isLedgerActionLoading}
              >
                {isLedgerActionLoading ? '처리 중' : '저장'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {selectedEntry ? (
        <div className="patch-ledger-detail-backdrop" role="presentation" onClick={closeLedgerDetail}>
          {detailMode === 'edit' ? (
            <form
              className="patch-ledger-detail-dialog ledger-form ledger-detail-edit-dialog"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
              onSubmit={requestDetailSave}
            >
              <button type="button" className="dialog-close" aria-label="닫기" onClick={closeLedgerDetail}>×</button>
              <h2>가계부 수정</h2>
              <div className="ledger-form-grid ledger-detail-form-grid">
                <label className="span-2">
                  <span>내용 <em className="fp-required-mark">*</em></span>
                  <input value={detailForm.title} onChange={(event) => setDetailForm((value) => ({ ...value, title: event.target.value }))} />
                </label>
                <label>
                  <span>금액 <em className="fp-required-mark">*</em></span>
                  <input
                    inputMode="numeric"
                    value={formatNumberInput(detailForm.amount)}
                    onChange={(event) => setDetailForm((value) => ({ ...value, amount: normalizeAmount(event.target.value) }))}
                  />
                </label>
                <DatePickerField
                  className="fp-ledger-form-date"
                  label="날짜"
                  required
                  value={detailForm.transactionDate}
                  onChange={(value) => setDetailForm((current) => ({ ...current, transactionDate: value }))}
                />
                <LedgerCustomSelect
                  label="구분"
                  options={[...LEDGER_ENTRY_TYPE_OPTIONS]}
                  value={detailForm.entryType}
                  onChange={(value) => setDetailForm((current) => ({ ...current, entryType: value as LedgerPayload['entryType'] }))}
                />
                <LedgerCustomSelect
                  label="카테고리"
                  options={ledgerCategoryOptions.map((item) => ({ label: item, value: item }))}
                  value={detailForm.category || ''}
                  onChange={(value) => setDetailForm((current) => ({ ...current, category: value || null }))}
                />
                <LedgerCustomSelect
                  label="결제수단"
                  options={ledgerPaymentMethodOptions.map((item) => ({ label: item, value: item }))}
                  value={detailForm.paymentMethod || ''}
                  onChange={(value) => setDetailForm((current) => ({ ...current, paymentMethod: value || null }))}
                />
                <LedgerCustomSelect
                  label="사용자"
                  options={familyMemberOptions.map((item) => ({ label: item, value: item }))}
                  value={detailForm.memberName || ''}
                  onChange={(value) => setDetailForm((current) => ({ ...current, memberName: value || null }))}
                />
                <label className="span-2">
                  <span>메모</span>
                  <textarea value={detailForm.memo || ''} onChange={(event) => setDetailForm((value) => ({ ...value, memo: event.target.value }))} />
                </label>
              </div>
              <div className="ledger-detail-actions">
                <button type="button" className="edit-button muted" onClick={() => setDetailMode('view')}>취소</button>
                <button type="submit" className={`edit-button${isLedgerActionLoading ? ' fp-button-loading' : ''}`} disabled={isLedgerActionLoading}>
                  {isLedgerActionLoading ? '처리 중' : '저장'}
                </button>
              </div>
            </form>
          ) : (
            <section className="patch-ledger-detail-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="dialog-close" aria-label="닫기" onClick={closeLedgerDetail}>×</button>
              <span className="ledger-detail-chip">{selectedEntry.entryType === 'income' ? '수입' : '지출'}</span>
              <h2>{selectedEntry.title || '내역 없음'}</h2>
              <strong className={`ledger-detail-amount ${selectedEntry.entryType}`}>{signedMoney(selectedEntry)}</strong>
              <dl>
                <div><dt>거래일</dt><dd>{selectedEntry.transactionDate.replace(/-/g, '.')}</dd></div>
                <div><dt>카테고리</dt><dd>{selectedEntry.category || '-'}</dd></div>
                <div><dt>결제수단</dt><dd>{selectedEntry.paymentMethod || '-'}</dd></div>
                <div><dt>사용자</dt><dd>{selectedEntry.memberName || '-'}</dd></div>
              </dl>
              <p>{selectedEntry.memo || '메모가 없습니다.'}</p>
              <div className="ledger-detail-actions">
                <button type="button" className="edit-button" onClick={startDetailEdit}>수정</button>
                <button type="button" className="danger-button" onClick={() => requestDelete(selectedEntry)}>삭제</button>
              </div>
            </section>
          )}
        </div>
      ) : null}

      {confirmAction === 'save' ? (
        <ConfirmDialog
          title={editingId ? '수정' : '저장'}
          body={editingId ? '가계부 내역을 수정하시겠습니까?' : '가계부 내역을 저장하시겠습니까?'}
          confirmLabel={editingId ? '수정' : '저장'}
          busy={isLedgerActionLoading}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmSave}
        />
      ) : null}
      {confirmAction === 'detail-save' ? (
        <ConfirmDialog
          title="수정"
          body="가계부 내역을 수정하시겠습니까?"
          confirmLabel="수정"
          busy={isLedgerActionLoading}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmDetailSave}
        />
      ) : null}
      {confirmAction === 'delete' && pendingDelete ? (
        <ConfirmDialog
          danger
          title="삭제"
          body="가계부 내역을 삭제하시겠습니까?"
          confirmLabel="삭제"
          busy={isLedgerActionLoading}
          onCancel={() => {
            setPendingDelete(null)
            setConfirmAction(null)
          }}
          onConfirm={confirmDelete}
        />
      ) : null}
      {isSmsParserOpen ? (
        <div className="fp-ledger-autofill-backdrop" role="presentation" onClick={() => setIsSmsParserOpen(false)}>
          <section
            className="fp-ledger-autofill-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fp-ledger-autofill-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2 id="fp-ledger-autofill-title">카드 붙여넣기</h2>
              <button type="button" aria-label="닫기" onClick={() => setIsSmsParserOpen(false)}>x</button>
            </header>
            <p className="fp-ledger-autofill-help">카드 문자나 앱 알림 내용을 붙여넣으면 금액과 가맹점 후보를 추출합니다.</p>
            <textarea
              aria-label="카드 문자 또는 앱 알림 내용"
              value={smsText}
              onChange={(event) => {
                setSmsText(event.target.value)
                setSmsMessage('')
              }}
              autoFocus
            />
            {smsMessage ? <p className="fp-ledger-autofill-message">{smsMessage}</p> : null}
            <div className="fp-ledger-autofill-actions">
              <button className="fp-button fp-button-muted" type="button" onClick={() => setIsSmsParserOpen(false)}>취소</button>
              <button className="fp-button fp-button-primary" type="button" onClick={autofillFromSms}>자동 입력</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
