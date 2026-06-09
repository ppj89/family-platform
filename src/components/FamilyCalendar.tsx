import { type FormEvent, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Edit3, Plus, Trash2, X } from 'lucide-react'
import './FamilyCalendar.css'

type CalendarView = 'day' | 'week' | 'month' | 'year'
type RepeatType = 'none' | 'weekly' | 'monthly' | 'yearly'
type CalendarBasis = 'solar' | 'lunar'

type Schedule = {
  id: number
  title: string
  date: string
  time: string
  category: string
  member: string
  repeat: RepeatType
  basis: CalendarBasis
  note: string
  createdAt: number
}

type ScheduleDraft = Omit<Schedule, 'id' | 'createdAt'>
type ScheduleOccurrence = Schedule & { occurrenceDate: string }

type DialogState =
  | { type: 'alert'; title: string; message: string; focusSelector?: string }
  | { type: 'confirm'; title: string; message: string; confirmLabel?: string; onConfirm: () => void }
  | null

const today = '2026-06-04'

const defaultDraft: ScheduleDraft = {
  title: '',
  date: today,
  time: '09:00',
  category: '일정',
  member: '전체 가족',
  repeat: 'none',
  basis: 'solar',
  note: '',
}

const initialSchedules: Schedule[] = [
  {
    id: 1,
    title: '엄마 생일',
    date: '2026-06-12',
    time: '09:00',
    category: '생일',
    member: '엄마',
    repeat: 'yearly',
    basis: 'solar',
    note: '케이크 예약, 저녁 식사 장소 정하기',
    createdAt: 1,
  },
  {
    id: 2,
    title: '소아과 정기검진',
    date: '2026-06-05',
    time: '14:30',
    category: '병원',
    member: '첫째',
    repeat: 'none',
    basis: 'solar',
    note: '예방접종 수첩 챙기기',
    createdAt: 2,
  },
  {
    id: 3,
    title: '할머니 생신',
    date: '2026-06-20',
    time: '18:00',
    category: '기념일',
    member: '전체 가족',
    repeat: 'yearly',
    basis: 'lunar',
    note: '음력 기준으로 매년 확인',
    createdAt: 3,
  },
]

const holidayNames: Record<string, string> = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '삼일절 대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '부처님오신날 대체공휴일',
  '2026-06-03': '전국동시지방선거',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-08-17': '광복절 대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '개천절 대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
}

const categories = ['일정', '생일', '기념일', '병원', '학교', '가족']
const members = ['전체 가족', '아빠', '엄마', '첫째', '둘째']
const viewOrder: CalendarView[] = ['day', 'week', 'month', 'year']

const repeatLabels: Record<RepeatType, string> = {
  none: '반복 없음',
  weekly: '매주',
  monthly: '매월',
  yearly: '매년',
}

const basisLabels: Record<CalendarBasis, string> = {
  solar: '양력',
  lunar: '음력',
}

export default function FamilyCalendar() {
  const [view, setView] = useState<CalendarView>('month')
  const [focusDate, setFocusDate] = useState(today)
  const [schedules, setSchedules] = useState<Schedule[]>(initialSchedules)
  const [draft, setDraft] = useState<ScheduleDraft>(defaultDraft)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selected, setSelected] = useState<ScheduleOccurrence | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)

  const range = useMemo(() => getViewRange(view, focusDate), [focusDate, view])
  const occurrences = useMemo(() => getOccurrences(schedules, range.start, range.end), [schedules, range])
  const selectedOccurrences = useMemo(() => getOccurrences(schedules, focusDate, focusDate), [focusDate, schedules])
  const monthDates = useMemo(() => getMonthDates(focusDate), [focusDate])

  const updateDraft = <K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const showAlert = (title: string, message: string, focusSelector?: string) => {
    setDialog({ focusSelector, message, title, type: 'alert' })
  }

  const closeDialog = () => {
    const focusSelector = dialog?.type === 'alert' ? dialog.focusSelector : undefined
    setDialog(null)
    if (focusSelector) {
      window.setTimeout(() => document.querySelector<HTMLInputElement>(focusSelector)?.focus(), 0)
    }
  }

  const resetDraft = () => {
    setEditingId(null)
    setDraft(defaultDraft)
  }

  const saveSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = draft.title.trim()
    if (!title) {
      showAlert('필수입력', '일정명은 필수입력입니다.', '[data-field="schedule-title"]')
      return
    }

    const payload: ScheduleDraft = { ...draft, note: draft.note.trim(), title }
    if (editingId) {
      setSchedules((items) => items.map((item) => (item.id === editingId ? { ...item, ...payload } : item)))
    } else {
      setSchedules((items) => [{ ...payload, id: Date.now(), createdAt: Date.now() }, ...items])
    }
    resetDraft()
  }

  const editSchedule = (item: Schedule) => {
    setEditingId(item.id)
    setDraft({
      basis: item.basis,
      category: item.category,
      date: item.date,
      member: item.member,
      note: item.note,
      repeat: item.repeat,
      time: item.time,
      title: item.title,
    })
    setSelected(null)
    requestAnimationFrame(() => document.querySelector('.fc-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const requestDeleteSchedule = (id: number) => {
    const target = schedules.find((item) => item.id === id)
    if (!target) return
    setDialog({
      confirmLabel: '삭제',
      message: `${target.title} 일정을 삭제할까요?`,
      onConfirm: () => {
        setSchedules((items) => items.filter((item) => item.id !== id))
        if (editingId === id) resetDraft()
        setSelected(null)
      },
      title: '일정 삭제',
      type: 'confirm',
    })
  }

  const moveFocus = (amount: number) => {
    const date = parseDate(focusDate)
    if (view === 'year') date.setFullYear(date.getFullYear() + amount)
    if (view === 'month') date.setMonth(date.getMonth() + amount)
    if (view === 'week') date.setDate(date.getDate() + amount * 7)
    if (view === 'day') date.setDate(date.getDate() + amount)
    setFocusDate(toDateValue(date))
  }

  return (
    <section className="fc-page">
      <div className="fc-layout">
        <main className="fc-main-card">
          <div className="fc-toolbar">
            <div className="fc-nav">
              <button aria-label="이전" onClick={() => moveFocus(-1)} type="button">
                <ChevronLeft size={18} />
              </button>
              <button className="fc-current" onClick={() => setFocusDate(today)} type="button">
                <strong>{getRangeTitle(view, focusDate)}</strong>
              </button>
              <button aria-label="다음" onClick={() => moveFocus(1)} type="button">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="fc-tabs">
              {viewOrder.map((item) => (
                <button className={view === item ? 'active' : ''} key={item} onClick={() => setView(item)} type="button">
                  {getViewLabel(item)}
                </button>
              ))}
            </div>
          </div>

          {view === 'month' ? (
            <MonthCalendar dates={monthDates} focusDate={focusDate} onOpen={setSelected} onSelectDate={setFocusDate} schedules={schedules} />
          ) : (
            <AgendaView end={range.end} occurrences={occurrences} onOpen={setSelected} start={range.start} view={view} />
          )}

          <div className="fc-lists stacked">
            <ScheduleList onDelete={requestDeleteSchedule} onEdit={editSchedule} onOpen={setSelected} schedules={selectedOccurrences} title="선택일 상세" />
            <ScheduleList onDelete={requestDeleteSchedule} onEdit={editSchedule} onOpen={setSelected} schedules={occurrences} title={`${getViewLabel(view)} 일정표`} />
          </div>
        </main>

        <form className="fc-form-card" onSubmit={saveSchedule}>
          <div className="fc-form-head">
            <h3>{editingId ? '일정 수정' : '일정 추가'}</h3>
            {editingId && <button onClick={resetDraft} type="button">취소</button>}
          </div>
          <label>
            <span>일정명</span>
            <input data-field="schedule-title" onChange={(event) => updateDraft('title', event.target.value)} placeholder="예: 가족 식사, 생일, 병원 예약" value={draft.title} />
          </label>
          <div className="fc-form-grid">
            <label>
              <span>날짜</span>
              <input onChange={(event) => updateDraft('date', event.target.value)} type="date" value={draft.date} />
            </label>
            <label>
              <span>시간</span>
              <input onChange={(event) => updateDraft('time', event.target.value)} type="time" value={draft.time} />
            </label>
          </div>
          <div className="fc-form-grid">
            <label>
              <span>구분</span>
              <select onChange={(event) => updateDraft('category', event.target.value)} value={draft.category}>
                {categories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>가족</span>
              <select onChange={(event) => updateDraft('member', event.target.value)} value={draft.member}>
                {members.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <div className="fc-form-grid">
            <label>
              <span>반복</span>
              <select onChange={(event) => updateDraft('repeat', event.target.value as RepeatType)} value={draft.repeat}>
                {(Object.keys(repeatLabels) as RepeatType[]).map((item) => <option key={item} value={item}>{repeatLabels[item]}</option>)}
              </select>
            </label>
            <label>
              <span>기준</span>
              <select onChange={(event) => updateDraft('basis', event.target.value as CalendarBasis)} value={draft.basis}>
                {(Object.keys(basisLabels) as CalendarBasis[]).map((item) => <option key={item} value={item}>{basisLabels[item]}</option>)}
              </select>
            </label>
          </div>
          <label>
            <span>메모</span>
            <textarea onChange={(event) => updateDraft('note', event.target.value)} placeholder="장소, 준비물, 가족에게 공유할 내용을 적어주세요." value={draft.note} />
          </label>
          <button className="fc-submit" type="submit">
            <Plus size={17} />
            {editingId ? '저장' : '추가'}
          </button>
        </form>
      </div>

      {selected && (
        <ScheduleModal item={selected} onClose={() => setSelected(null)} onDelete={requestDeleteSchedule} onEdit={editSchedule} />
      )}
      {dialog && <AppDialog dialog={dialog} onClose={closeDialog} />}
    </section>
  )
}

function MonthCalendar({
  dates,
  focusDate,
  onOpen,
  onSelectDate,
  schedules,
}: {
  dates: string[]
  focusDate: string
  onOpen: (item: ScheduleOccurrence) => void
  onSelectDate: (date: string) => void
  schedules: Schedule[]
}) {
  const focusMonth = parseDate(focusDate).getMonth()

  return (
    <div className="fc-month">
      {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => <span className="fc-weekday" key={weekday}>{weekday}</span>)}
      {dates.map((dateValue) => {
        const date = parseDate(dateValue)
        const day = date.getDate()
        const occurrences = getOccurrences(schedules, dateValue, dateValue)
        const holiday = getHolidayName(dateValue)
        const showLunar = day % 3 === 0

        return (
          <button
            className={[
              'fc-day',
              date.getMonth() !== focusMonth ? 'muted' : '',
              date.getDay() === 0 || holiday ? 'holiday' : '',
              date.getDay() === 6 ? 'saturday' : '',
              dateValue === focusDate ? 'selected' : '',
            ].filter(Boolean).join(' ')}
            key={dateValue}
            onClick={() => onSelectDate(dateValue)}
            type="button"
          >
            <strong>{day}</strong>
            {holiday && <em>{holiday}</em>}
            {showLunar && <small>{formatShortLunarDate(dateValue)}</small>}
            <div className="fc-day-schedules">
              {occurrences.slice(0, 3).map((item) => (
                <span
                  key={`${item.id}-${item.occurrenceDate}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpen(item)
                  }}
                >
                  {item.title}
                </span>
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function AgendaView({
  end,
  occurrences,
  onOpen,
  start,
  view,
}: {
  end: string
  occurrences: ScheduleOccurrence[]
  onOpen: (item: ScheduleOccurrence) => void
  start: string
  view: CalendarView
}) {
  if (view === 'year') {
    return (
      <div className="fc-year">
        {Array.from({ length: 12 }, (_, index) => {
          const month = String(index + 1).padStart(2, '0')
          const monthItems = occurrences.filter((item) => item.occurrenceDate.slice(5, 7) === month)
          return (
            <div className="fc-year-card" key={month}>
              <strong>{index + 1}월</strong>
              <small>{monthItems.length}건</small>
              {monthItems.slice(0, 4).map((item) => <button key={`${item.id}-${item.occurrenceDate}`} onClick={() => onOpen(item)} type="button">{item.title}</button>)}
            </div>
          )
        })}
      </div>
    )
  }

  const grouped = groupByDate(occurrences)
  const dates = getDateRange(start, end)

  return (
    <div className={view === 'week' ? 'fc-week-agenda' : 'fc-day-agenda'}>
      {dates.map((date) => {
        const holiday = getHolidayName(date)
        const items = grouped[date] ?? []
        return (
          <div className="fc-agenda-day" key={date}>
            <strong>{formatReadableDate(date)}</strong>
            <small>{formatLunarDate(date)}{holiday ? ` · ${holiday}` : ''}</small>
            {!items.length && <em>일정 없음</em>}
            {items.map((item) => <button key={`${item.id}-${item.occurrenceDate}`} onClick={() => onOpen(item)} type="button">{item.time} {item.title}</button>)}
          </div>
        )
      })}
    </div>
  )
}

function ScheduleList({
  onDelete,
  onEdit,
  onOpen,
  schedules,
  title,
}: {
  onDelete: (id: number) => void
  onEdit: (item: Schedule) => void
  onOpen: (item: ScheduleOccurrence) => void
  schedules: ScheduleOccurrence[]
  title: string
}) {
  return (
    <section className="fc-list-card">
      <header>
        <h3>{title}</h3>
        <span>{schedules.length}건</span>
      </header>
      <div className="fc-list">
        {schedules.length ? schedules.map((item) => (
          <article className="fc-row" key={`${item.id}-${item.occurrenceDate}`}>
            <button className="fc-row-main" onClick={() => onOpen(item)} type="button">
              <b>{parseDate(item.occurrenceDate).getDate()}</b>
              <span>
                <strong>{item.title}</strong>
                <small>{item.time} · {item.category} · {item.member}</small>
              </span>
            </button>
            <div>
              <button onClick={() => onEdit(item)} title="수정" type="button"><Edit3 size={15} /></button>
              <button onClick={() => onDelete(item.id)} title="삭제" type="button"><Trash2 size={15} /></button>
            </div>
          </article>
        )) : <p className="fc-empty">등록된 일정이 없습니다.</p>}
      </div>
    </section>
  )
}

function ScheduleModal({
  item,
  onClose,
  onDelete,
  onEdit,
}: {
  item: ScheduleOccurrence
  onClose: () => void
  onDelete: (id: number) => void
  onEdit: (item: Schedule) => void
}) {
  const holiday = getHolidayName(item.occurrenceDate)

  return (
    <div className="fc-modal-backdrop">
      <section className="fc-modal">
        <button className="fc-modal-close" onClick={onClose} type="button" aria-label="닫기">
          <X size={18} />
        </button>
        <span>{item.category}</span>
        <h2>{item.title}</h2>
        <div className="fc-modal-meta">
          <div>
            <small>날짜</small>
            <strong>{formatReadableDate(item.occurrenceDate)}</strong>
            <em>{formatLunarDate(item.occurrenceDate)}{holiday ? ` · ${holiday}` : ''}</em>
          </div>
          <div>
            <small>시간</small>
            <strong><Clock size={15} /> {item.time || '시간 미정'}</strong>
            <em>{item.member}</em>
          </div>
          <div>
            <small>반복</small>
            <strong>{repeatLabels[item.repeat]}</strong>
            <em>{basisLabels[item.basis]} 기준</em>
          </div>
        </div>
        <p>{item.note || '메모가 없습니다.'}</p>
        <div className="fc-modal-actions">
          <button onClick={() => onEdit(item)} type="button">수정</button>
          <button onClick={() => onDelete(item.id)} type="button">삭제</button>
        </div>
      </section>
    </div>
  )
}

function AppDialog({ dialog, onClose }: { dialog: NonNullable<DialogState>; onClose: () => void }) {
  const isConfirm = dialog.type === 'confirm'
  return (
    <div className="fc-modal-backdrop">
      <section className="app-dialog">
        <button className="fc-modal-close" onClick={onClose} type="button" aria-label="닫기">
          <X size={18} />
        </button>
        {isConfirm ? <AlertTriangle size={28} /> : <CheckCircle2 size={28} />}
        <h2>{dialog.title}</h2>
        <p>{dialog.message}</p>
        <div className="app-dialog-actions">
          {isConfirm && <button onClick={onClose} type="button">취소</button>}
          <button
            className={isConfirm ? 'danger' : ''}
            onClick={() => {
              if (dialog.type === 'confirm') dialog.onConfirm()
              onClose()
            }}
            type="button"
          >
            {isConfirm ? dialog.confirmLabel ?? '확인' : '확인'}
          </button>
        </div>
      </section>
    </div>
  )
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`)
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(value: string, amount: number) {
  const date = parseDate(value)
  date.setDate(date.getDate() + amount)
  return toDateValue(date)
}

function getMonthDates(value: string) {
  const target = parseDate(value)
  const first = new Date(target.getFullYear(), target.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return toDateValue(date)
  })
}

function getViewRange(view: CalendarView, value: string) {
  const date = parseDate(value)
  if (view === 'day') return { start: value, end: value }
  if (view === 'week') {
    const start = new Date(date)
    start.setDate(date.getDate() - date.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start: toDateValue(start), end: toDateValue(end) }
  }
  if (view === 'year') return { start: `${date.getFullYear()}-01-01`, end: `${date.getFullYear()}-12-31` }
  return {
    start: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`,
    end: toDateValue(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  }
}

function getOccurrences(schedules: Schedule[], start: string, end: string) {
  const items: ScheduleOccurrence[] = []
  for (let cursor = start, guard = 0; cursor <= end && guard < 370; cursor = addDays(cursor, 1), guard += 1) {
    schedules.forEach((schedule) => {
      if (occursOnDate(schedule, cursor)) items.push({ ...schedule, occurrenceDate: cursor })
    })
  }
  return items.sort((a, b) => `${a.occurrenceDate} ${a.time}`.localeCompare(`${b.occurrenceDate} ${b.time}`))
}

function occursOnDate(schedule: Schedule, date: string) {
  if (date < schedule.date) return false
  if (schedule.repeat === 'none') return schedule.date === date
  const base = parseDate(schedule.date)
  const target = parseDate(date)
  if (schedule.repeat === 'weekly') return base.getDay() === target.getDay()
  if (schedule.repeat === 'monthly') return base.getDate() === target.getDate()
  if (schedule.basis === 'lunar') return getLunarKey(schedule.date) === getLunarKey(date)
  return schedule.date.slice(5) === date.slice(5)
}

function getLunarParts(value: string) {
  try {
    const parts = new Intl.DateTimeFormat('ko-KR-u-ca-chinese', { day: 'numeric', month: 'numeric' }).formatToParts(parseDate(value))
    const month = Number((parts.find((part) => part.type === 'month')?.value ?? '').replace(/[^\d]/g, ''))
    const day = Number((parts.find((part) => part.type === 'day')?.value ?? '').replace(/[^\d]/g, ''))
    if (!month || !day) return null
    return { day, month }
  } catch {
    return null
  }
}

function getLunarKey(value: string) {
  const lunar = getLunarParts(value)
  return lunar ? `${lunar.month}-${lunar.day}` : value.slice(5)
}

function formatLunarDate(value: string) {
  const lunar = getLunarParts(value)
  return lunar ? `음력 ${lunar.month}월 ${lunar.day}일` : '음력 확인 필요'
}

function formatShortLunarDate(value: string) {
  const lunar = getLunarParts(value)
  return lunar ? `음 ${lunar.month}/${lunar.day}` : ''
}

function formatReadableDate(value: string) {
  return parseDate(value).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

function getRangeTitle(view: CalendarView, value: string) {
  const range = getViewRange(view, value)
  const date = parseDate(value)
  if (view === 'day') return formatReadableDate(value)
  if (view === 'week') return `${formatReadableDate(range.start)} - ${formatReadableDate(range.end)}`
  if (view === 'year') return `${date.getFullYear()}년`
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
}

function getViewLabel(view: CalendarView) {
  const labels: Record<CalendarView, string> = {
    day: '일간',
    month: '월간',
    week: '주간',
    year: '연간',
  }
  return labels[view]
}

function getHolidayName(value: string) {
  return holidayNames[value] ?? ''
}

function getDateRange(start: string, end: string) {
  const dates: string[] = []
  for (let cursor = start, guard = 0; cursor <= end && guard < 370; cursor = addDays(cursor, 1), guard += 1) dates.push(cursor)
  return dates
}

function groupByDate(items: ScheduleOccurrence[]) {
  return items.reduce<Record<string, ScheduleOccurrence[]>>((groups, item) => {
    groups[item.occurrenceDate] = [...(groups[item.occurrenceDate] ?? []), item]
    return groups
  }, {})
}
