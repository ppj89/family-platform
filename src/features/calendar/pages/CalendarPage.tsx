import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { apiActionMessage, isAuthError } from '../../../shared/api/client'
import { ConfirmDialog, DatePickerField } from '../../../shared/components'
import {
  addDays,
  addMonths,
  currentTimeText,
  formatDateKey,
  formatKoreanDate,
  monthRange,
  parseDateKey,
  todayKey,
  weekRange,
} from '../../../shared/utils/date'
import { createSchedule, deleteSchedule, listSchedules, updateSchedule } from '../api/schedules'
import type { ScheduleItem, SchedulePayload } from '../types'
import { expandScheduleInstances, isRepeatRule, type CalendarScheduleInstance } from '../utils/repeat'
import './calendar-page.css'

type CalendarView = 'day' | 'week' | 'month' | 'year'
type YearDisplayMode = 'calendar' | 'list'

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

const categoryOptions = ['일정', '가족행사', '기념일', '병원', '학교', '여행', '기타']
const memberOptions = ['아빠', '엄마', '가족']
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
    ...Array.from({ length: first.getDay() }, (_, index) => ({ key: `blank-${index}`, day: 0, hasEvent: false })),
    ...Array.from({ length: lastDate }, (_, index) => {
      const day = index + 1
      return { key: `${month}-${day}`, day, hasEvent: eventDays.includes(day) }
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
  const today = todayKey()
  const formRef = useRef<HTMLFormElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<CalendarView>('month')
  const [yearMode, setYearMode] = useState<YearDisplayMode>('calendar')
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [weekDate, setWeekDate] = useState(today)
  const [dayDate, setDayDate] = useState(today)
  const [selectedDate, setSelectedDate] = useState(today)
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [form, setForm] = useState<SchedulePayload>(() => emptyPayload(today))
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingSource, setEditingSource] = useState<ScheduleItem | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [dayDialog, setDayDialog] = useState<{ date: string; items: CalendarScheduleInstance[] } | null>(null)
  const [scheduleDetail, setScheduleDetail] = useState<CalendarScheduleInstance | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

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
  const agendaTitle = view === 'year' ? `${selectedYearMonthLabel} 일정표` : view === 'month' ? '월간 일정표' : view === 'week' ? '주간 일정표' : '일간 일정표'
  const cells = useMemo(() => monthCells(monthDate), [monthDate])
  const weekDateKeys = useMemo(() => weekDays(weekDate), [weekDate])
  const yearMonthItems = useMemo(() => yearMonths(monthDate.getFullYear()), [monthDate])

  function changeDayDate(value: string) {
    setDayDate(value)
    setSelectedDate(value)
    if (!editingId) setForm((current) => ({ ...current, scheduleDate: value }))
  }

  function changeWeekDate(value: string) {
    setWeekDate(value)
    setSelectedDate(value)
    if (!editingId) setForm((current) => ({ ...current, scheduleDate: value }))
  }

  function changeMonth(value: string) {
    setMonthDate(parseDateKey(`${value}-01`))
    if (view === 'month' && !selectedDate.startsWith(value)) setSelectedDate(`${value}-01`)
  }

  function changeYear(value: string) {
    const year = Number(value)
    if (!Number.isFinite(year)) return
    const nextMonthDate = new Date(year, monthDate.getMonth(), 1)
    setMonthDate(nextMonthDate)
    setSelectedDate(formatDateKey(nextMonthDate))
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
      setMonthDate(addMonths(monthDate, amount * 12))
      return
    }
    setMonthDate(addMonths(monthDate, amount))
  }

  function changeView(nextView: CalendarView) {
    setView(nextView)
    if (nextView === 'day') {
      setSelectedDate(dayDate)
      return
    }
    if (nextView === 'week') {
      setSelectedDate(weekDate)
      return
    }
    if (nextView === 'year') {
      setSelectedDate(formatDateKey(monthDate))
      return
    }
    const monthKey = formatDateKey(monthDate).slice(0, 7)
    setSelectedDate(selectedDate.startsWith(monthKey) ? selectedDate : `${monthKey}-01`)
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

  function setActiveDate(dateKey: string) {
    setSelectedDate(dateKey)
    if (view === 'day') setDayDate(dateKey)
    if (view === 'week') setWeekDate(dateKey)
    if (view === 'month') setMonthDate(parseDateKey(dateKey))
    if (!editingId) setForm((value) => ({ ...value, scheduleDate: dateKey, scheduleTime: currentTimeText() }))
  }

  function openMonthDay(dateKey: string, dayItems: CalendarScheduleInstance[]) {
    setSelectedDate(dateKey)
    if (!editingId) setForm((value) => ({ ...value, scheduleDate: dateKey, scheduleTime: currentTimeText() }))
    if (dayItems.length > 0) setDayDialog({ date: dateKey, items: dayItems })
  }

  function startCreate(dateKey = selectedDate) {
    setEditingId(null)
    setEditingSource(null)
    setForm(emptyPayload(dateKey))
  }

  function startEdit(item: CalendarScheduleInstance) {
    const source = items.find((candidate) => candidate.id === item.id) || item
    setEditingId(source.id)
    setEditingSource(source)
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
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      titleInputRef.current?.focus({ preventScroll: true })
    }, 0)
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
      title: editingId ? '일정을 저장할까요?' : '일정을 추가할까요?',
      body: editingId ? '수정한 일정 내용을 저장합니다.' : '입력한 일정 내용을 저장합니다.',
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
      setMessage(editingId ? '일정을 수정했습니다.' : '일정을 저장했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '일정을 저장하지 못했습니다.'))
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
      setScheduleDetail(null)
      setMessage('일정을 삭제했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '일정을 삭제하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  function confirmAction() {
    if (!confirm) return
    if (confirm.kind === 'save') {
      const hasRepeat = isRepeatRule(editingSource?.repeatRule) || isRepeatRule(form.repeatRule)
      if (editingId && hasRepeat) {
        setConfirm({
          kind: 'repeat-save',
          title: '반복일정이 있습니다',
          body: '같이 수정하시겠습니까?',
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
          title: '반복일정이 있습니다',
          body: '같이 삭제하시겠습니까?',
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
                title: '일정을 삭제할까요?',
                body: `${item.title} 일정을 삭제합니다.`,
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

  return (
    <>
      <section className="fp-calendar content-grid">
        {loading ? <div className="fp-loading-blocker">처리 중입니다.</div> : null}
        <article className="panel wide family-calendar-panel fp-calendar-left">
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
              </div>
            </header>

            {message ? <p className="fp-message">{message}</p> : null}

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
                    {date ? <strong>{date.getDate()}</strong> : null}
                    {holidayName ? <span className="fp-holiday-name">{holidayName}</span> : null}
                    {lunarText ? <span className="fp-lunar-note">{lunarText}</span> : null}
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
                  <section className={`fp-year-board year-schedule-grid year-mode-${yearMode}`}>
                    {yearMonthItems.map((monthItem) => {
                      const monthSchedules = visibleItems.filter((item) => item.occurrenceDate.startsWith(monthItem.key))
                      const eventDays = Array.from(new Set(monthSchedules.map((item) => parseDateKey(item.occurrenceDate).getDate())))
                      return (
                        <button
                          className={formatDateKey(monthDate).startsWith(monthItem.key) ? 'year-month-card active' : 'year-month-card'}
                          key={monthItem.key}
                          type="button"
                          onClick={() => {
                            setMonthDate(new Date(monthDate.getFullYear(), monthItem.month - 1, 1))
                            setSelectedDate(`${monthItem.key}-01`)
                          }}
                        >
                          <strong>{monthItem.label}</strong>
                          {yearMode === 'calendar' ? (
                            <>
                              <div className="year-mini-calendar" aria-hidden="true">
                                <div className="year-mini-weekdays">
                                  {shortWeekdays.map((day) => <span key={day}>{day}</span>)}
                                </div>
                                <div className="year-mini-days">
                                  {yearMiniCells(monthDate.getFullYear(), monthItem.month, eventDays).map((cell) => (
                                    <span className={cell.hasEvent ? 'has-event' : ''} key={cell.key}>
                                      {cell.day || ''}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <span className={eventDays.length ? 'year-event-count' : 'year-event-count is-empty'}>
                                {eventDays.length ? `${eventDays.length}건` : '일정 없음'}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={eventDays.length ? 'year-event-count' : 'year-event-count is-empty'}>
                                {eventDays.length ? `${eventDays.length}건` : '일정 없음'}
                              </span>
                              {monthSchedules.slice(0, 3).map((item) => <em key={item.instanceKey}>{item.title}</em>)}
                            </>
                          )}
                        </button>
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
              </div>
            </div>
            <div className="fp-schedule-list">
              {agendaItems.length ? agendaItems.map((item) => renderScheduleRow(item)) : <p className="fp-empty-text">등록된 일정이 없습니다.</p>}
            </div>
          </section>
        </article>

        <form className="panel schedule-form-card fp-calendar-right fp-schedule-form" ref={formRef} onSubmit={requestSave}>
            <header>
              <h3>{editingId ? '일정 수정' : '일정 추가'}</h3>
              {editingId ? <button type="button" className="fp-button fp-button-muted" onClick={() => startCreate(form.scheduleDate)}>취소</button> : null}
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
                  title: '일정을 삭제할까요?',
                  body: `${scheduleDetail.title} 일정을 삭제합니다.`,
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
          confirmLabel={confirm.kind === 'delete' || confirm.kind === 'repeat-delete' ? '삭제' : '확인'}
          onCancel={() => setConfirm(null)}
          onConfirm={confirmAction}
        />
      ) : null}
    </>
  )
}
