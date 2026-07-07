import { type CSSProperties, FormEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { apiActionMessage, isAuthError } from '../../../shared/api/client'
import { ConfirmDialog, DatePickerField, ToastMessage } from '../../../shared/components'
import { CALENDAR_CATEGORIES, COMMON_CODE_GROUPS, FAMILY_MEMBER_OPTIONS } from '../../../shared/constants/commonCodes'
import { useCommonCodeOptions } from '../../../shared/hooks/useCommonCodeOptions'
import {
  addDays,
  currentTimeText,
  formatDateKey,
  formatKoreanDate,
  monthRange,
  parseDateKey,
  todayKey,
  weekRange,
} from '../../../shared/utils/date'
import { createSchedule, createScheduleException, deleteSchedule, listSchedules, updateSchedule } from '../api/schedules'
import type { ScheduleItem, SchedulePayload } from '../types'
import { expandScheduleInstances, isRepeatRule, type CalendarScheduleInstance } from '../utils/repeat'
import './calendar-page.css'

type CalendarView = 'day' | 'week' | 'month' | 'year'
type YearDisplayMode = 'calendar' | 'list'
type QuickNavPosition = { x: number; y: number }

const quickNavPositionKey = 'family-platform-calendar-quick-nav-position'

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

const shortWeekdays = ['일', '월', '화', '수', '목', '금', '토']

type ConfirmState =
  | { kind: 'save'; title: string; body: string; danger?: boolean }
  | { kind: 'delete'; item: CalendarScheduleInstance; title: string; body: string; danger?: boolean }
  | { kind: 'repeat-save'; title: string; body: string }
  | { kind: 'repeat-delete'; item: CalendarScheduleInstance; title: string; body: string; danger?: boolean }

type CalendarSelectOption = {
  label: string
  value: string
}

const scheduleStartDate = '2000-01-01'

const emptyPayload = (date: string): SchedulePayload => ({
  title: '',
  calendarBasis: 'solar',
  scheduleDate: date,
  scheduleTime: currentTimeText(),
  category: '일정',
  memberName: '아빠',
  repeatRule: 'none',
  memo: '',
})

const holidayNames: Record<string, string> = {
  '2026-01-01': '신정',
  '2026-02-16': '설연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설연휴',
  '2026-03-01': '3·1절',
  '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일',
  '2026-06-03': '지방선거',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일',
  '2026-09-24': '추석연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
}
const lunarFormatter = new Intl.DateTimeFormat('ko-KR-u-ca-chinese', { month: 'numeric', day: 'numeric' })

function scheduleTime(item: Pick<ScheduleItem, 'scheduleTime'>) {
  return item.scheduleTime ? item.scheduleTime.slice(0, 5) : '시간 미정'
}

function normalizeTimeInput(value: string) {
  const digits = value.replace(/[^\d]/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function isCompleteTime(value: string | null | undefined) {
  return !value || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function repeatLabel(rule?: string | null) {
  if (rule === 'weekly') return '매주'
  if (rule === 'monthly') return '매월'
  if (rule === 'yearly') return '매년'
  return '반복 없음'
}

function rangeForView(view: CalendarView, dayDate: string, weekDate: string, monthDate: Date) {
  if (view === 'day') return { startDate: dayDate, endDate: dayDate }
  if (view === 'week') return weekRange(weekDate)
  if (view === 'year') {
    const year = monthDate.getFullYear()
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` }
  }
  return monthRange(monthDate)
}

function clampDate(year: number, monthIndex: number, day: number) {
  const lastDate = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(day, lastDate))
}

function dateKeyInMonth(monthValue: string, anchorDateKey: string) {
  const [year, month] = monthValue.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return anchorDateKey
  return formatDateKey(clampDate(year, month - 1, parseDateKey(anchorDateKey).getDate()))
}

function dateKeyInYear(yearValue: string, anchorDateKey: string) {
  const year = Number(yearValue)
  if (!Number.isFinite(year)) return anchorDateKey
  const anchorDate = parseDateKey(anchorDateKey)
  return formatDateKey(clampDate(year, anchorDate.getMonth(), anchorDate.getDate()))
}

function addMonthsKeepingDay(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey)
  return formatDateKey(clampDate(date.getFullYear(), date.getMonth() + amount, date.getDate()))
}

function monthCells(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const start = new Date(firstDay)
  start.setDate(firstDay.getDate() - firstDay.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      key: formatDateKey(date),
      dateKey: formatDateKey(date),
      inMonth: date.getMonth() === monthDate.getMonth(),
    }
  })
}

function lunarLabel(date: Date) {
  if (date.getDate() % 5 !== 0) return ''
  const parts = lunarFormatter.format(date).match(/\d+/g)
  if (!parts || parts.length < 2) return ''
  return `음 ${Number(parts[0])}월 ${Number(parts[1])}일`
}

function weekDays(weekDate: string) {
  const range = weekRange(weekDate)
  const days = []
  let cursor = range.startDate
  while (cursor <= range.endDate) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}

function yearMonths(year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    return {
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: `${month}월`,
      month,
    }
  })
}

function yearMiniCells(year: number, month: number, eventDays: number[]) {
  const first = new Date(year, month - 1, 1)
  const lastDate = new Date(year, month, 0).getDate()
  return [
    ...Array.from({ length: first.getDay() }, (_, index) => ({ key: `blank-${index}`, day: 0, dateKey: '', hasEvent: false })),
    ...Array.from({ length: lastDate }, (_, index) => {
      const day = index + 1
      return {
        key: `${month}-${day}`,
        day,
        dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        hasEvent: eventDays.includes(day),
      }
    }),
  ]
}

function CalendarNavChevron({ direction }: { direction: 'previous' | 'next' }) {
  return (
    <svg className="fp-calendar-nav-chevron" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d={direction === 'previous' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

function formatShortKoreanDate(value: string) {
  const date = parseDateKey(value)
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${shortWeekdays[date.getDay()]})`
}

function formatWeekTitle(value: string) {
  const range = weekRange(value)
  return `${formatShortKoreanDate(range.startDate)} - ${formatShortKoreanDate(range.endDate)}`
}

function ScheduleDateBadge({ value }: { value: string }) {
  const date = parseDateKey(value)
  const day = date.getDay()
  const tone = day === 0 ? 'sunday' : day === 6 ? 'saturday' : 'weekday'
  return (
    <span className={`fp-schedule-date-pill schedule-date-badge ${tone}`}>
      <span className="schedule-date-day">{date.getDate()}일</span>
      <span className="schedule-date-weekday"> ({shortWeekdays[day]})</span>
    </span>
  )
}

function CalendarCustomSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: CalendarSelectOption[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
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
    <label className="fp-field">
      <span>{label}</span>
      <div className={`custom-select${open ? ' open' : ''}`} ref={rootRef}>
        <button
          className={`custom-select-trigger${open ? ' open' : ''}`}
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          <span>{selected.label}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
        <div className="custom-select-list" hidden={!open}>
          {options.map((option) => (
            <button
              className={option.value === selected.value ? 'selected' : ''}
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

export default function CalendarPage() {
  const categoryOptions = useCommonCodeOptions(COMMON_CODE_GROUPS.calendarCategories, CALENDAR_CATEGORIES)
  const memberOptions = useCommonCodeOptions(COMMON_CODE_GROUPS.familyMembers, FAMILY_MEMBER_OPTIONS)
  const today = todayKey()
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
  const calendarTopRef = useRef<HTMLElement | null>(null)
  const calendarListEndRef = useRef<HTMLDivElement | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<CalendarView>('month')
  const [yearMode, setYearMode] = useState<YearDisplayMode>('calendar')
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [weekDate, setWeekDate] = useState(today)
  const [dayDate, setDayDate] = useState(today)
  const [selectedDate, setSelectedDate] = useState(today)
  const [yearSelectedDate, setYearSelectedDate] = useState<string | null>(null)
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [form, setForm] = useState<SchedulePayload>(() => emptyPayload(today))
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingSource, setEditingSource] = useState<ScheduleItem | null>(null)
  const [editingOccurrenceDate, setEditingOccurrenceDate] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [dayDialog, setDayDialog] = useState<{ date: string; items: CalendarScheduleInstance[] } | null>(null)
  const [monthDialog, setMonthDialog] = useState<{ label: string; items: CalendarScheduleInstance[] } | null>(null)
  const [scheduleDetail, setScheduleDetail] = useState<CalendarScheduleInstance | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false)
  const [isQuickNavDragging, setIsQuickNavDragging] = useState(false)
  const [quickNavPosition, setQuickNavPosition] = useState<QuickNavPosition | null>(() => readQuickNavPosition())
  const quickNavStyle = quickNavPosition
    ? ({ left: `${quickNavPosition.x}px`, top: `${quickNavPosition.y}px` } satisfies CSSProperties)
    : undefined

  const range = useMemo(() => rangeForView(view, dayDate, weekDate, monthDate), [dayDate, monthDate, view, weekDate])
  const visibleItems = useMemo(() => expandScheduleInstances(items, range.startDate, range.endDate), [items, range.endDate, range.startDate])
  const selectedItems = useMemo(
    () => visibleItems.filter((item) => item.occurrenceDate === selectedDate),
    [selectedDate, visibleItems],
  )
  const selectedYearMonthKey = formatDateKey(monthDate).slice(0, 7)
  const selectedYearMonthLabel = `${monthDate.getMonth() + 1}월`
  const yearAgendaItems = useMemo(
    () => visibleItems.filter((item) => item.occurrenceDate.startsWith(selectedYearMonthKey)),
    [selectedYearMonthKey, visibleItems],
  )
  const agendaItems = view === 'year' ? yearAgendaItems : view === 'month' ? visibleItems : selectedItems
  const monthAgendaGroups = useMemo(() => {
    const groups = new Map<string, CalendarScheduleInstance[]>()
    visibleItems.forEach((item) => {
      const groupItems = groups.get(item.occurrenceDate)
      if (groupItems) groupItems.push(item)
      else groups.set(item.occurrenceDate, [item])
    })
    return Array.from(groups.entries()).map(([dateKey, groupItems]) => ({
      dateKey,
      items: groupItems,
    }))
  }, [visibleItems])
  const agendaTitle = view === 'year' ? `${selectedYearMonthLabel} 일정표` : view === 'month' ? '월간 일정표' : view === 'week' ? '주간 일정표' : '일간 일정표'
  const cells = useMemo(() => monthCells(monthDate), [monthDate])
  const weekDateKeys = useMemo(() => weekDays(weekDate), [weekDate])
  const yearMonthItems = useMemo(() => yearMonths(monthDate.getFullYear()), [monthDate])

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

  function scrollCalendarTop() {
    calendarTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function scrollCalendarListEnd() {
    calendarListEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  function syncSelectedDate(dateKey: string, options: { updateForm?: boolean; yearSelected?: boolean } = {}) {
    const nextDate = parseDateKey(dateKey)
    setSelectedDate(dateKey)
    setDayDate(dateKey)
    setWeekDate(dateKey)
    setMonthDate(nextDate)
    if (options.yearSelected !== undefined) setYearSelectedDate(options.yearSelected ? dateKey : null)
    if (options.updateForm !== false && !editingId) {
      setForm((current) => ({ ...current, scheduleDate: dateKey, scheduleTime: currentTimeText() }))
    }
  }

  function changeDayDate(value: string) {
    syncSelectedDate(value, { yearSelected: false })
  }

  function changeWeekDate(value: string) {
    syncSelectedDate(value, { yearSelected: false })
  }

  function changeMonth(value: string) {
    syncSelectedDate(dateKeyInMonth(value, selectedDate), { yearSelected: false })
  }

  function changeYear(value: string) {
    syncSelectedDate(dateKeyInYear(value, selectedDate), { yearSelected: false })
  }

  function moveCalendarRange(amount: number) {
    if (view === 'day') {
      changeDayDate(addDays(dayDate, amount))
      return
    }
    if (view === 'week') {
      changeWeekDate(addDays(weekDate, amount * 7))
      return
    }
    if (view === 'year') {
      syncSelectedDate(addMonthsKeepingDay(selectedDate, amount * 12), { yearSelected: true })
      return
    }
    syncSelectedDate(addMonthsKeepingDay(selectedDate, amount), { yearSelected: false })
  }

  function changeView(nextView: CalendarView) {
    setView(nextView)
    setDayDate(selectedDate)
    setWeekDate(selectedDate)
    setMonthDate(parseDateKey(selectedDate))
    setYearSelectedDate(nextView === 'year' ? selectedDate : null)
  }

  async function reloadSchedules() {
    setLoading(true)
    setMessage('')
    try {
      const nextItems = await listSchedules(scheduleStartDate, range.endDate)
      setItems(nextItems)
    } catch (error) {
      if (isAuthError(error)) return
      setMessage(apiActionMessage(error, '일정을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadSchedules()
  }, [range.endDate])

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

  function setActiveDate(dateKey: string) {
    syncSelectedDate(dateKey, { yearSelected: view === 'year' })
  }

  function selectYearMonth(monthKey: string) {
    syncSelectedDate(dateKeyInMonth(monthKey, selectedDate), { yearSelected: false })
  }

  function openYearMonth(monthKey: string, monthSchedules: CalendarScheduleInstance[], label: string) {
    selectYearMonth(monthKey)
    setMonthDialog(monthSchedules.length > 0 ? { label, items: monthSchedules } : null)
  }

  function selectYearDay(dateKey: string, dayItems: CalendarScheduleInstance[]) {
    if (!dateKey) return
    syncSelectedDate(dateKey, { yearSelected: true })
    if (dayItems.length > 0) setDayDialog({ date: dateKey, items: dayItems })
  }

  function openMonthDay(dateKey: string, dayItems: CalendarScheduleInstance[]) {
    syncSelectedDate(dateKey, { yearSelected: false })
    if (dayItems.length > 0) setDayDialog({ date: dateKey, items: dayItems })
  }

  function focusScheduleTitleInput() {
    window.setTimeout(() => {
      titleInputRef.current?.focus({ preventScroll: true })
    }, 0)
  }

  function startCreate(dateKey = selectedDate, options?: { focus?: boolean }) {
    setEditingId(null)
    setEditingSource(null)
    setEditingOccurrenceDate(null)
    setForm(emptyPayload(dateKey))
    if (options?.focus) {
      setIsFormDialogOpen(true)
      focusScheduleTitleInput()
    }
  }

  function closeFormDialog() {
    setIsFormDialogOpen(false)
    if (editingId) startCreate(form.scheduleDate)
  }

  function startEdit(item: CalendarScheduleInstance) {
    const source = items.find((candidate) => candidate.id === item.id) || item
    setEditingId(source.id)
    setEditingSource(source)
    setEditingOccurrenceDate(item.occurrenceDate)
    setSelectedDate(item.occurrenceDate)
    setForm({
      title: source.title,
      calendarBasis: source.calendarBasis === 'lunar' ? 'lunar' : 'solar',
      scheduleDate: item.occurrenceDate,
      scheduleTime: source.scheduleTime ? source.scheduleTime.slice(0, 5) : '',
      category: source.category || '일정',
      memberName: source.memberName || '아빠',
      repeatRule: source.repeatRule || 'none',
      memo: source.memo || '',
    })
    setDayDialog(null)
    setScheduleDetail(null)
    setIsFormDialogOpen(true)
    focusScheduleTitleInput()
  }

  function requestSave(event: FormEvent) {
    event.preventDefault()
    if (!form.title.trim()) {
      setMessage('일정명을 입력해주세요.')
      return
    }
    if (!isCompleteTime(form.scheduleTime)) {
      setMessage('시간은 HH:mm 형식으로 입력해주세요.')
      return
    }
    setConfirm({
      kind: 'save',
      title: editingId ? '수정' : '저장',
      body: editingId ? '일정을 수정하시겠습니까?' : '일정을 저장하시겠습니까?',
    })
  }

  async function saveSchedule() {
    setLoading(true)
    setMessage('')
    try {
      const payload = { ...form, scheduleTime: form.scheduleTime || null }
      if (editingId) await updateSchedule(editingId, payload)
      else await createSchedule(payload)
      await reloadSchedules()
      const savedDate = form.scheduleDate
      startCreate(savedDate)
      setSelectedDate(savedDate)
      setIsFormDialogOpen(false)
      setMessage(editingId ? '일정을 수정했습니다.' : '일정을 저장했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '일정을 저장하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  async function saveSingleOccurrence() {
    if (!editingId || !editingSource) {
      await saveSchedule()
      return
    }
    setLoading(true)
    setMessage('')
    const hiddenDate = editingOccurrenceDate || form.scheduleDate
    const savedDate = form.scheduleDate
    try {
      const payload = { ...form, scheduleTime: form.scheduleTime || null, repeatRule: 'none' }
      await createSchedule(payload)
      await createScheduleException(editingSource.id, hiddenDate)
      await reloadSchedules()
      startCreate(savedDate)
      setSelectedDate(savedDate)
      setIsFormDialogOpen(false)
      setMessage('일정을 수정했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '일정을 수정하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  async function remove(item: CalendarScheduleInstance) {
    setLoading(true)
    setMessage('')
    try {
      await deleteSchedule(item.id)
      await reloadSchedules()
      setDayDialog(null)
      setMonthDialog(null)
      setScheduleDetail(null)
      setMessage('일정을 삭제했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '일정을 삭제하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  async function removeSingleOccurrence(item: CalendarScheduleInstance) {
    setLoading(true)
    setMessage('')
    try {
      await createScheduleException(item.id, item.occurrenceDate)
      await reloadSchedules()
      setDayDialog(null)
      setMonthDialog(null)
      setScheduleDetail(null)
      setMessage('일정을 삭제했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '일정을 삭제하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  function cancelConfirmAction(current: ConfirmState) {
    if (current.kind === 'repeat-save') {
      setConfirm(null)
      void saveSingleOccurrence()
      return
    }
    if (current.kind === 'repeat-delete') {
      const item = current.item
      setConfirm(null)
      void removeSingleOccurrence(item)
      return
    }
    setConfirm(null)
  }

  function confirmAction() {
    if (!confirm) return
    if (confirm.kind === 'save') {
      const hasRepeat = isRepeatRule(editingSource?.repeatRule) || isRepeatRule(form.repeatRule)
      if (editingId && hasRepeat) {
        setConfirm({
          kind: 'repeat-save',
          title: '수정',
          body: '반복 일정을 같이 수정하시겠습니까?',
        })
        return
      }
      setConfirm(null)
      void saveSchedule()
      return
    }
    if (confirm.kind === 'repeat-save') {
      setConfirm(null)
      void saveSchedule()
      return
    }
    if (confirm.kind === 'delete') {
      if (isRepeatRule(confirm.item.repeatRule)) {
        setConfirm({
          kind: 'repeat-delete',
          item: confirm.item,
          title: '삭제',
          body: '반복 일정을 같이 삭제하시겠습니까?',
          danger: true,
        })
        return
      }
      const item = confirm.item
      setConfirm(null)
      void remove(item)
      return
    }
    const item = confirm.item
    setConfirm(null)
    void remove(item)
  }

  function renderCalendarNavigation() {
    if (view === 'year') {
      return (
        <div className="fp-calendar-month-nav fp-calendar-year-nav calendar-nav">
          <button type="button" className="icon-button fp-button fp-button-muted" aria-label="이전 연도" onClick={() => moveCalendarRange(-1)}>
            <CalendarNavChevron direction="previous" />
          </button>
          <DatePickerField
            className="fp-year-field fp-calendar-year-title calendar-title-button"
            label="조회 연도"
            mode="year"
            value={String(monthDate.getFullYear())}
            onChange={changeYear}
          />
          <button type="button" className="icon-button fp-button fp-button-muted" aria-label="다음 연도" onClick={() => moveCalendarRange(1)}>
            <CalendarNavChevron direction="next" />
          </button>
        </div>
      )
    }

    const isMonth = view === 'month'
    const pickerValue = isMonth ? formatDateKey(monthDate).slice(0, 7) : view === 'day' ? dayDate : weekDate
    const pickerLabel = isMonth ? '조회 월' : view === 'day' ? '조회 일' : '조회 주'
    const pickerDisplay = isMonth ? undefined : view === 'day' ? formatShortKoreanDate(dayDate) : formatWeekTitle(weekDate)

    return (
      <div className="fp-calendar-month-nav calendar-nav">
        <button type="button" className="icon-button fp-button fp-button-muted" aria-label="이전" onClick={() => moveCalendarRange(-1)}>
          <CalendarNavChevron direction="previous" />
        </button>
        <DatePickerField
          className={`${isMonth ? 'fp-month-field' : 'fp-date-field'} calendar-title-button`}
          displayValue={pickerDisplay}
          label={pickerLabel}
          mode={isMonth ? 'month' : 'date'}
          value={pickerValue}
          onChange={isMonth ? changeMonth : view === 'day' ? changeDayDate : changeWeekDate}
        />
        <button type="button" className="icon-button fp-button fp-button-muted" aria-label="다음" onClick={() => moveCalendarRange(1)}>
          <CalendarNavChevron direction="next" />
        </button>
      </div>
    )
  }

  function renderScheduleRow(item: CalendarScheduleInstance, options?: { compact?: boolean }) {
    const compact = Boolean(options?.compact)
    return (
      <article
        className={compact ? 'fp-schedule-row fp-schedule-row-compact schedule-row api-schedule-row' : 'fp-schedule-row schedule-row api-schedule-row'}
        key={item.instanceKey}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) return
          setScheduleDetail(item)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          setScheduleDetail(item)
        }}
      >
        {compact ? null : <ScheduleDateBadge value={item.occurrenceDate} />}
        <div className="fp-schedule-row-content">
          <strong>{item.title}</strong>
          <p>
            {scheduleTime(item)}
            {' \u00B7 '}
            {item.category || '일정'}
            {item.memberName ? ` \u00B7 ${item.memberName}` : ''}
          </p>
          {isRepeatRule(item.repeatRule) ? <em>{repeatLabel(item.repeatRule)}</em> : null}
          {item.memo ? <small>{item.memo}</small> : null}
        </div>
        <div className="fp-row-actions schedule-row-actions">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              startEdit(item)
            }}
          >
            수정
          </button>
          <button
            type="button"
            className="danger"
            onClick={(event) => {
              event.stopPropagation()
              setConfirm({
                kind: 'delete',
                item,
                title: '삭제',
                body: '일정을 삭제하시겠습니까?',
                danger: true,
              })
            }}
          >
            삭제
          </button>
        </div>
      </article>
    )
  }

  function renderMonthAgendaGroup(group: { dateKey: string; items: CalendarScheduleInstance[] }) {
    const firstItem = group.items[0]
    if (!firstItem) return null
    const hiddenCount = group.items.length - 1
    return (
      <article
        className="fp-month-agenda-row"
        key={group.dateKey}
        role="button"
        tabIndex={0}
        onClick={() => setDayDialog({ date: group.dateKey, items: group.items })}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          setDayDialog({ date: group.dateKey, items: group.items })
        }}
      >
        <ScheduleDateBadge value={group.dateKey} />
        <div className="fp-month-agenda-main">
          <strong>{firstItem.title}</strong>
          <p>
            {scheduleTime(firstItem)}
            {' \u00B7 '}
            {firstItem.category || '일정'}
            {firstItem.memberName ? ` \u00B7 ${firstItem.memberName}` : ''}
          </p>
          {isRepeatRule(firstItem.repeatRule) ? <em>{repeatLabel(firstItem.repeatRule)}</em> : null}
        </div>
        <div className="fp-month-agenda-count">
          <span>{group.items.length}건</span>
          {hiddenCount > 0 ? <small>+{hiddenCount}</small> : null}
        </div>
      </article>
    )
  }

  return (
    <>
      <section className="fp-calendar content-grid">
        {loading ? <div className="fp-loading-blocker">처리 중입니다.</div> : null}
        <article className="panel wide family-calendar-panel fp-calendar-left" ref={calendarTopRef}>
          <section className="fp-calendar-left-card">
            <header className="fp-calendar-header">
              <div className="fp-calendar-actions calendar-toolbar">
                {renderCalendarNavigation()}
                <div className="fp-calendar-tabs calendar-view-tabs" role="tablist" aria-label="캘린더 보기">
                  {[
                    ['day', '일간'],
                    ['week', '주간'],
                    ['month', '월간'],
                    ['year', '연간'],
                  ].map(([value, label]) => (
                    <button
                      aria-selected={view === value}
                      className={view === value ? 'active' : ''}
                      key={value}
                      type="button"
                      onClick={() => changeView(value as CalendarView)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="fp-calendar-input-button"
                  type="button"
                  onClick={() => startCreate(selectedDate, { focus: true })}
                >
                  입력
                </button>
              </div>
            </header>

            <ToastMessage message={message} onClose={() => setMessage('')} />

            <div className="fp-calendar-layout">
              {view === 'month' ? (
                <section className="fp-calendar-board">
            <div className="fp-month-grid family-month-grid">
              {['일', '월', '화', '수', '목', '금', '토'].map((day) => <span className="fp-weekday-label" key={day}>{day}</span>)}
              {cells.map((cell) => {
                const dayItems = cell.dateKey ? visibleItems.filter((item) => item.occurrenceDate === cell.dateKey) : []
                const date = cell.dateKey ? parseDateKey(cell.dateKey) : null
                const holidayName = cell.dateKey ? holidayNames[cell.dateKey] || '' : ''
                const lunarText = date ? lunarLabel(date) : ''
                const isHoliday = Boolean(date && (holidayName || date.getDay() === 0))
                const isSaturday = Boolean(date && date.getDay() === 6)
                return (
                  <div
                    className={[
                      'fp-month-cell calendar-day-card',
                      cell.dateKey === selectedDate ? 'selected' : '',
                      !cell.inMonth ? 'outside muted' : '',
                      isHoliday ? 'holiday' : '',
                      isSaturday ? 'saturday' : '',
                    ].filter(Boolean).join(' ')}
                    key={cell.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      openMonthDay(cell.dateKey, dayItems)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      openMonthDay(cell.dateKey, dayItems)
                    }}
                  >
                    {date ? (
                      <span className="fp-month-date-line">
                        <strong>{date.getDate()}</strong>
                        {lunarText ? <span className="fp-lunar-note">{lunarText}</span> : null}
                      </span>
                    ) : null}
                    {holidayName ? <span className="fp-holiday-name">{holidayName}</span> : null}
                    {dayItems.slice(0, 1).map((item) => (
                      <button
                        className="fp-month-schedule-chip"
                        key={item.instanceKey}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          if (cell.dateKey) openMonthDay(cell.dateKey, dayItems)
                        }}
                      >
                        {item.title}
                      </button>
                    ))}
                    {dayItems.length > 1 ? <small>+{dayItems.length - 1}</small> : null}
                  </div>
                )
              })}
            </div>
                </section>
              ) : view === 'year' ? (
                <>
                  <div className="year-mode-actions">
                    <div className="year-mode-tabs" role="tablist" aria-label="연간 표시 방식">
                      <button
                        aria-selected={yearMode === 'calendar'}
                        className={yearMode === 'calendar' ? 'active' : ''}
                        type="button"
                        onClick={() => setYearMode('calendar')}
                      >
                        캘린더형
                      </button>
                      <button
                        aria-selected={yearMode === 'list'}
                        className={yearMode === 'list' ? 'active' : ''}
                        type="button"
                        onClick={() => setYearMode('list')}
                      >
                        목록형
                      </button>
                    </div>
                  </div>
                  <section className={`fp-year-board year-schedule-grid year-mode-${yearMode}`}>
                    {yearMonthItems.map((monthItem) => {
                      const monthSchedules = visibleItems.filter((item) => item.occurrenceDate.startsWith(monthItem.key))
                      const eventDays = Array.from(new Set(monthSchedules.map((item) => parseDateKey(item.occurrenceDate).getDate())))
                      const isActiveMonth = formatDateKey(monthDate).startsWith(monthItem.key)
                      const openMonth = () => {
                        openYearMonth(monthItem.key, monthSchedules, monthItem.label)
                      }
                      return (
                        <div
                          className={isActiveMonth ? 'year-month-card active' : 'year-month-card'}
                          key={monthItem.key}
                          role="button"
                          tabIndex={0}
                          onClick={openMonth}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return
                            event.preventDefault()
                            openMonth()
                          }}
                        >
                          <header className="year-month-card-header">
                            <strong>{monthItem.label}</strong>
                            <span className={eventDays.length ? 'year-event-count' : 'year-event-count is-empty'}>
                              {yearMode === 'calendar'
                                ? eventDays.length ? `${eventDays.length}건` : '일정 없음'
                                : `${monthSchedules.length}건`}
                            </span>
                          </header>
                          {yearMode === 'calendar' ? (
                            <>
                              <div className="year-mini-calendar">
                                <div className="year-mini-weekdays">
                                  {shortWeekdays.map((day) => <span key={day}>{day}</span>)}
                                </div>
                                <div className="year-mini-days">
                                  {yearMiniCells(monthDate.getFullYear(), monthItem.month, eventDays).map((cell) => (
                                    (() => {
                                      if (!cell.dateKey) return <span key={cell.key} />
                                      const dayItems = monthSchedules.filter((item) => item.occurrenceDate === cell.dateKey)
                                      return (
                                        <button
                                          aria-label={`${cell.dateKey} 일정 보기`}
                                          className={[
                                            cell.hasEvent ? 'has-event' : '',
                                            yearSelectedDate === cell.dateKey ? 'selected' : '',
                                          ].filter(Boolean).join(' ')}
                                          key={cell.key}
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            selectYearDay(cell.dateKey, dayItems)
                                          }}
                                        >
                                          <span className="year-mini-day-number">{cell.day}</span>
                                        </button>
                                      )
                                    })()
                                  ))}
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              {monthSchedules.slice(0, 2).map((item) => <em key={item.instanceKey}>{item.title}</em>)}
                              {monthSchedules.length > 2 ? <small className="year-card-more">+{monthSchedules.length - 2}</small> : null}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </section>
                </>
              ) : view === 'week' ? (
                <section className="fp-week-board week-agenda-grid">
            {weekDateKeys.map((dateKey) => {
              const dayItems = visibleItems.filter((item) => item.occurrenceDate === dateKey)
              const date = parseDateKey(dateKey)
              const holidayName = holidayNames[dateKey] || ''
              const isHoliday = Boolean(holidayName || date.getDay() === 0)
              const isSaturday = date.getDay() === 6
              return (
                <button
                  className={[
                    'agenda-day-column',
                    selectedDate === dateKey ? 'active' : '',
                    isHoliday ? 'holiday' : '',
                    isSaturday ? 'saturday' : '',
                  ].filter(Boolean).join(' ')}
                  key={dateKey}
                  type="button"
                  onClick={() => {
                    setActiveDate(dateKey)
                    if (dayItems.length > 2) setDayDialog({ date: dateKey, items: dayItems })
                  }}
                >
                  <strong>{formatShortKoreanDate(dateKey)}</strong>
                  <span>{dayItems.length}건</span>
                  {holidayName ? <small>{holidayName}</small> : null}
                  {dayItems.slice(0, 2).map((item) => <em key={item.instanceKey}>{item.title}</em>)}
                  {dayItems.length > 2 ? <small className="agenda-more-count">+{dayItems.length}</small> : null}
                </button>
              )
            })}
                </section>
              ) : (
                null
              )}
            </div>

            {view === 'day' || view === 'week' ? (
              <section className="panel-card selected-day-card">
                <div className="panel-header">
                  <h2>선택일</h2>
                  <button type="button" className="passive-header-chip" onClick={() => startCreate(selectedDate)}>
                    {formatShortKoreanDate(selectedDate)}
                  </button>
                </div>
                <div className="schedule-list">
                  {selectedItems.length ? selectedItems.map((item) => renderScheduleRow(item)) : <p className="empty-note">선택한 날짜에는 일정이 없습니다.</p>}
                </div>
              </section>
            ) : null}
          </section>

          <section className="fp-schedule-panel schedule-list-card">
            <div className="fp-schedule-panel-header">
              <div>
                <h3>{agendaTitle}</h3>
                {view === 'month' ? <p>{monthAgendaGroups.length}일 · {agendaItems.length}건</p> : null}
              </div>
            </div>
            <div className="fp-schedule-list">
              {view === 'month'
                ? monthAgendaGroups.length
                  ? monthAgendaGroups.map((group) => renderMonthAgendaGroup(group))
                  : <p className="fp-empty-text">등록된 일정이 없습니다.</p>
                : agendaItems.length
                  ? agendaItems.map((item) => renderScheduleRow(item))
                  : <p className="fp-empty-text">등록된 일정이 없습니다.</p>}
            </div>
            <div className="fp-calendar-list-end" ref={calendarListEndRef} aria-hidden="true" />
          </section>

          <nav
            className={`fp-calendar-scroll-nav${isQuickNavOpen ? ' open' : ''}${quickNavPosition ? ' positioned' : ''}${isQuickNavDragging ? ' dragging' : ''}`}
            style={quickNavStyle}
            ref={quickNavRef}
            aria-label="캘린더 빠른 이동"
          >
            {isQuickNavOpen ? (
              <div className="fp-calendar-scroll-menu">
                <button type="button" aria-label="위로 이동" onClick={scrollCalendarTop}>↑</button>
                <button type="button" aria-label="아래로 이동" onClick={scrollCalendarListEnd}>↓</button>
                <button type="button" onClick={() => startCreate(selectedDate, { focus: true })}>입력</button>
              </div>
            ) : null}
            <button
              type="button"
              className="fp-calendar-scroll-toggle"
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

          {isFormDialogOpen ? (
            <div className="fp-calendar-form-backdrop" role="presentation" onClick={closeFormDialog}>
              <form
                className="panel schedule-form-card fp-calendar-right fp-calendar-form-dialog fp-schedule-form"
                ref={formRef}
                onSubmit={requestSave}
                role="dialog"
                aria-modal="true"
                aria-labelledby="fp-calendar-form-title"
                onClick={(event) => event.stopPropagation()}
              >
            <header>
              <h3 id="fp-calendar-form-title">{editingId ? '일정 수정' : '일정 입력'}</h3>
              <button type="button" className="fp-calendar-form-close" aria-label="닫기" onClick={closeFormDialog}>x</button>
            </header>
        <div className="fp-form-grid">
          <label className="fp-field span-2">
            <span>일정명<em className="fp-required-mark">*</em></span>
            <input ref={titleInputRef} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <CalendarCustomSelect
            label="기준"
            value={form.calendarBasis}
            options={[
              { label: '양력', value: 'solar' },
              { label: '음력', value: 'lunar' },
            ]}
            onChange={(value) => setForm({ ...form, calendarBasis: value as 'solar' | 'lunar' })}
          />
          <DatePickerField
            className="fp-form-date-picker"
            label="날짜"
            required
            value={form.scheduleDate}
            onChange={(value) => setForm({ ...form, scheduleDate: value })}
          />
          <label className="fp-field">
            <span>시간</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="HH:mm"
              value={form.scheduleTime ?? ''}
              onChange={(event) => setForm({ ...form, scheduleTime: normalizeTimeInput(event.target.value) })}
            />
          </label>
          <CalendarCustomSelect
            label="구분"
            value={form.category || '일정'}
            options={categoryOptions.map((option) => ({ label: option, value: option }))}
            onChange={(value) => setForm({ ...form, category: value || null })}
          />
          <CalendarCustomSelect
            label="가족"
            value={form.memberName || '아빠'}
            options={memberOptions.map((option) => ({ label: option, value: option }))}
            onChange={(value) => setForm({ ...form, memberName: value || null })}
          />
          <CalendarCustomSelect
            label="반복"
            value={form.repeatRule || 'none'}
            options={[
              { label: '반복 없음', value: 'none' },
              { label: '매주', value: 'weekly' },
              { label: '매월', value: 'monthly' },
              { label: '매년', value: 'yearly' },
            ]}
            onChange={(value) => setForm({ ...form, repeatRule: value })}
          />
          <label className="fp-field span-2">
            <span>메모</span>
            <textarea value={form.memo || ''} onChange={(event) => setForm({ ...form, memo: event.target.value || null })} />
          </label>
        </div>
            <button className="fp-button fp-button-primary" type="submit">{editingId ? '저장' : '추가'}</button>
              </form>
            </div>
          ) : null}
        </article>
      </section>

      {dayDialog ? (
        <div className="fp-calendar-popup-backdrop" role="presentation" onClick={() => setDayDialog(null)}>
          <section className="fp-calendar-popup" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{formatKoreanDate(dayDialog.date)} 일정</h3>
              <button type="button" aria-label="닫기" onClick={() => setDayDialog(null)}>x</button>
            </header>
            <div className="fp-schedule-list">
              {dayDialog.items.map((item) => renderScheduleRow(item, { compact: true }))}
            </div>
          </section>
        </div>
      ) : null}

      {monthDialog ? (
        <div className="fp-calendar-popup-backdrop" role="presentation" onClick={() => setMonthDialog(null)}>
          <section className="fp-calendar-popup fp-year-month-popup" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{monthDialog.label} 일정</h3>
              <button type="button" aria-label="닫기" onClick={() => setMonthDialog(null)}>x</button>
            </header>
            <div className="fp-month-popup-list">
              {Array.from(new Set(monthDialog.items.map((item) => item.occurrenceDate))).map((dateKey) => {
                const dayItems = monthDialog.items.filter((item) => item.occurrenceDate === dateKey)
                return (
                  <section className="fp-month-popup-day-group" key={dateKey}>
                    {dayItems.map((item) => renderScheduleRow(item, { compact: false }))}
                  </section>
                )
              })}
              {monthDialog.items.length ? null : <p className="fp-empty-text">등록된 일정이 없습니다.</p>}
            </div>
          </section>
        </div>
      ) : null}

      {scheduleDetail ? (
        <div className="fp-schedule-detail-backdrop" role="presentation" onClick={() => setScheduleDetail(null)}>
          <section className="fp-schedule-detail-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className="fp-schedule-detail-close" type="button" aria-label="닫기" onClick={() => setScheduleDetail(null)}>x</button>
            <span className="fp-schedule-detail-date">{formatKoreanDate(scheduleDetail.occurrenceDate)}</span>
            <h3>{scheduleDetail.title}</h3>
            <p>
              {scheduleTime(scheduleDetail)}
              {' \u00B7 '}
              {scheduleDetail.category || '일정'}
              {scheduleDetail.memberName ? ` \u00B7 ${scheduleDetail.memberName}` : ''}
              {isRepeatRule(scheduleDetail.repeatRule) ? ` \u00B7 ${repeatLabel(scheduleDetail.repeatRule)}` : ''}
            </p>
            <div className="fp-schedule-detail-memo">
              {scheduleDetail.memo || '등록된 메모가 없습니다.'}
            </div>
            <div className="fp-schedule-detail-actions">
              <button type="button" onClick={() => startEdit(scheduleDetail)}>수정</button>
              <button
                type="button"
                className="danger"
                onClick={() => setConfirm({
                  kind: 'delete',
                  item: scheduleDetail,
                  title: '삭제',
                  body: '일정을 삭제하시겠습니까?',
                  danger: true,
                })}
              >
                삭제
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          danger={'danger' in confirm ? confirm.danger : false}
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.kind === 'delete' || confirm.kind === 'repeat-delete' ? '삭제' : confirm.kind === 'repeat-save' ? '수정' : confirm.title}
          onCancel={() => cancelConfirmAction(confirm)}
          onConfirm={confirmAction}
        />
      ) : null}
    </>
  )
}
