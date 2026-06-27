import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
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

type ConfirmState =
  | { kind: 'save'; title: string; body: string; danger?: boolean }
  | { kind: 'delete'; item: CalendarScheduleInstance; title: string; body: string; danger?: boolean }
  | { kind: 'repeat-save'; title: string; body: string }
  | { kind: 'repeat-delete'; item: CalendarScheduleInstance; title: string; body: string; danger?: boolean }

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

export default function CalendarPage() {
  const today = todayKey()
  const [view, setView] = useState<CalendarView>('month')
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
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const range = useMemo(() => rangeForView(view, dayDate, weekDate, monthDate), [dayDate, monthDate, view, weekDate])
  const visibleItems = useMemo(() => expandScheduleInstances(items, range.startDate, range.endDate), [items, range.endDate, range.startDate])
  const selectedItems = useMemo(
    () => visibleItems.filter((item) => item.occurrenceDate === selectedDate),
    [selectedDate, visibleItems],
  )
  const agendaItems = view === 'month' || view === 'year' ? visibleItems : selectedItems
  const agendaTitle = view === 'year' ? '연간 일정표' : view === 'month' ? '월간 일정표' : formatKoreanDate(selectedDate)
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
  }

  function changeMonth(value: string) {
    setMonthDate(parseDateKey(`${value}-01`))
    if (view === 'month' && !selectedDate.startsWith(value)) setSelectedDate(`${value}-01`)
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
      setSelectedDate(`${monthDate.getFullYear()}-01-01`)
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

  function renderScheduleRow(item: CalendarScheduleInstance) {
    return (
      <article className="fp-schedule-row" key={item.instanceKey}>
        <strong className="fp-schedule-date-pill">{formatKoreanDate(item.occurrenceDate).replace(/^\d{4}-\d{2}-/, '')}</strong>
        <div>
          <strong>{item.title}</strong>
          <p>
            {scheduleTime(item)}
            {' · '}
            {item.category || '일정'}
            {item.memberName ? ` · ${item.memberName}` : ''}
          </p>
          {isRepeatRule(item.repeatRule) ? <em>{repeatLabel(item.repeatRule)}</em> : null}
          {item.memo ? <small>{item.memo}</small> : null}
        </div>
        <div className="fp-row-actions">
          <button type="button" onClick={() => startEdit(item)}>수정</button>
          <button
            type="button"
            className="danger"
            onClick={() => setConfirm({
              kind: 'delete',
              item,
              title: '일정을 삭제할까요?',
              body: `${item.title} 일정을 삭제합니다.`,
              danger: true,
            })}
          >
            삭제
          </button>
        </div>
      </article>
    )
  }

  return (
    <section className="fp-calendar fp-card">
      {loading ? <div className="fp-loading-blocker">처리 중입니다.</div> : null}
      <header className="fp-calendar-header">
        <div className="fp-calendar-actions">
          {view === 'month' ? (
            <div className="fp-calendar-month-nav">
              <button type="button" className="fp-button fp-button-muted" aria-label="이전 달" onClick={() => setMonthDate(addMonths(monthDate, -1))}>‹</button>
              <DatePickerField
                className="fp-month-field"
                label="조회 월"
                mode="month"
                value={formatDateKey(monthDate).slice(0, 7)}
                onChange={changeMonth}
              />
              <button type="button" className="fp-button fp-button-muted" aria-label="다음 달" onClick={() => setMonthDate(addMonths(monthDate, 1))}>›</button>
            </div>
          ) : view === 'year' ? (
            <div className="fp-calendar-month-nav fp-calendar-year-nav">
              <button type="button" className="fp-button fp-button-muted" aria-label="이전 연도" onClick={() => setMonthDate(addMonths(monthDate, -12))}>‹</button>
              <button type="button" className="fp-calendar-year-title" aria-label="조회 연도">
                <strong>{monthDate.getFullYear()}년</strong>
              </button>
              <button type="button" className="fp-button fp-button-muted" aria-label="다음 연도" onClick={() => setMonthDate(addMonths(monthDate, 12))}>›</button>
            </div>
          ) : (
            <DatePickerField
              className="fp-date-field"
              key={view}
              label={view === 'day' ? '조회 일' : '조회 주'}
              value={view === 'day' ? dayDate : weekDate}
              onChange={view === 'day' ? changeDayDate : changeWeekDate}
            />
          )}
          <div className="fp-calendar-tabs" role="tablist" aria-label="캘린더 보기">
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
            <div className="fp-weekdays">
              {['일', '월', '화', '수', '목', '금', '토'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="fp-month-grid">
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
                      'fp-month-cell',
                      cell.dateKey === selectedDate ? 'selected' : '',
                      !cell.inMonth ? 'outside' : '',
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
                    {dayItems.slice(0, 3).map((item) => (
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
                    {dayItems.length > 3 ? <small>+{dayItems.length - 3}</small> : null}
                  </div>
                )
              })}
            </div>
          </section>
        ) : view === 'year' ? (
          <section className="fp-year-board">
            {yearMonthItems.map((monthItem) => {
              const monthSchedules = visibleItems.filter((item) => item.occurrenceDate.startsWith(monthItem.key))
              return (
                <button
                  className={formatDateKey(monthDate).startsWith(monthItem.key) ? 'active' : ''}
                  key={monthItem.key}
                  type="button"
                  onClick={() => {
                    setMonthDate(new Date(monthDate.getFullYear(), monthItem.month - 1, 1))
                    setSelectedDate(`${monthItem.key}-01`)
                    setView('month')
                  }}
                >
                  <strong>{monthItem.label}</strong>
                  <span>{monthSchedules.length}건</span>
                  {monthSchedules.slice(0, 3).map((item) => <small key={item.instanceKey}>{item.title}</small>)}
                </button>
              )
            })}
          </section>
        ) : view === 'week' ? (
          <section className="fp-week-board">
            {weekDateKeys.map((dateKey) => {
              const dayItems = visibleItems.filter((item) => item.occurrenceDate === dateKey)
              return (
                <button
                  className={selectedDate === dateKey ? 'active' : ''}
                  key={dateKey}
                  type="button"
                  onClick={() => setActiveDate(dateKey)}
                >
                  <strong>{formatKoreanDate(dateKey)}</strong>
                  <span>{dayItems.length}건</span>
                  {dayItems.slice(0, 2).map((item) => <small key={item.instanceKey}>{item.title}</small>)}
                </button>
              )
            })}
          </section>
        ) : (
          <section className="fp-day-board">
            <h3>{formatKoreanDate(dayDate)}</h3>
            <p>{visibleItems.length}건</p>
            <button type="button" className="fp-button fp-button-muted" onClick={() => startCreate(dayDate)}>이 날짜에 일정 추가</button>
          </section>
        )}

      </div>

      <section className="fp-schedule-panel">
        <div className="fp-schedule-panel-header">
          <div>
            <h3>{agendaTitle}</h3>
          </div>
        </div>
        <div className="fp-schedule-list">
          {agendaItems.length ? agendaItems.map(renderScheduleRow) : <p className="fp-empty-text">등록된 일정이 없습니다.</p>}
        </div>
      </section>

      <form className="fp-schedule-form" onSubmit={requestSave}>
        <header>
          <h3>{editingId ? '일정 수정' : '일정 추가'}</h3>
          {editingId ? <button type="button" className="fp-button fp-button-muted" onClick={() => startCreate(form.scheduleDate)}>취소</button> : null}
        </header>
        <div className="fp-form-grid">
          <label className="fp-field span-2">
            <span>일정명<em className="fp-required-mark">*</em></span>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label className="fp-field">
            <span>기준</span>
            <select value={form.calendarBasis} onChange={(event) => setForm({ ...form, calendarBasis: event.target.value as 'solar' | 'lunar' })}>
              <option value="solar">양력</option>
              <option value="lunar">음력</option>
            </select>
          </label>
          <div className="fp-field">
            <DatePickerField
              className="fp-form-date-picker"
              label="날짜"
              required
              value={form.scheduleDate}
              onChange={(value) => setForm({ ...form, scheduleDate: value })}
            />
          </div>
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
          <label className="fp-field">
            <span>구분</span>
            <select value={form.category || '일정'} onChange={(event) => setForm({ ...form, category: event.target.value || null })}>
              {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="fp-field">
            <span>가족</span>
            <select value={form.memberName || '아빠'} onChange={(event) => setForm({ ...form, memberName: event.target.value || null })}>
              {memberOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="fp-field">
            <span>반복</span>
            <select value={form.repeatRule || 'none'} onChange={(event) => setForm({ ...form, repeatRule: event.target.value })}>
              <option value="none">반복 없음</option>
              <option value="weekly">매주</option>
              <option value="monthly">매월</option>
              <option value="yearly">매년</option>
            </select>
          </label>
          <label className="fp-field span-2">
            <span>메모</span>
            <textarea value={form.memo || ''} onChange={(event) => setForm({ ...form, memo: event.target.value || null })} />
          </label>
        </div>
        <button className="fp-button fp-button-primary" type="submit">{editingId ? '저장' : '추가'}</button>
      </form>

      {dayDialog ? (
        <div className="fp-calendar-popup-backdrop" role="presentation" onClick={() => setDayDialog(null)}>
          <section className="fp-calendar-popup" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{formatKoreanDate(dayDialog.date)} 일정</h3>
              <button type="button" aria-label="닫기" onClick={() => setDayDialog(null)}>x</button>
            </header>
            <div className="fp-schedule-list">
              {dayDialog.items.map(renderScheduleRow)}
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
    </section>
  )
}
