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
import { createSchedule, createScheduleReminders, deleteSchedule, listSchedules, updateSchedule } from '../api/schedules'
import type { ScheduleItem, SchedulePayload } from '../types'
import { expandScheduleInstances, isRepeatRule, type CalendarScheduleInstance } from '../utils/repeat'
import './calendar-page.css'

type CalendarView = 'day' | 'week' | 'month'

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
  memberName: '',
  repeatRule: 'none',
  memo: '',
})

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
  return monthRange(monthDate)
}

function monthCells(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const lastDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  return [
    ...Array.from({ length: firstDay.getDay() }, (_, index) => ({ key: `empty-${index}`, dateKey: '' })),
    ...Array.from({ length: lastDate }, (_, index) => {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1)
      return { key: formatDateKey(date), dateKey: formatDateKey(date) }
    }),
  ]
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
  const cells = useMemo(() => monthCells(monthDate), [monthDate])
  const weekDateKeys = useMemo(() => weekDays(weekDate), [weekDate])

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

  function openMonthDay(dateKey: string) {
    const dayItems = visibleItems.filter((item) => item.occurrenceDate === dateKey)
    setSelectedDate(dateKey)
    if (!editingId) setForm((value) => ({ ...value, scheduleDate: dateKey, scheduleTime: currentTimeText() }))
    if (dayItems.length > 0) setDayDialog({ date: dateKey, items: dayItems })
    else setDayDialog(null)
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
      memberName: source.memberName || '',
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

  async function createTodayReminder() {
    setLoading(true)
    setMessage('')
    try {
      const result = await createScheduleReminders(todayKey())
      setMessage(`오늘 일정 알림 생성 확인: ${result.created}건`)
    } catch (error) {
      setMessage(apiActionMessage(error, '일정 알림을 확인하지 못했습니다.'))
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
        <div>
          <strong>{item.title}</strong>
          <p>
            {formatKoreanDate(item.occurrenceDate)} {scheduleTime(item)}
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
        <div>
          <h2>캘린더</h2>
          <p>월별 일정과 가족 공유 알림을 확인합니다.</p>
        </div>
        <div className="fp-calendar-actions">
          <div className="fp-calendar-tabs" role="tablist" aria-label="캘린더 보기">
            {[
              ['day', '일간'],
              ['week', '주간'],
              ['month', '월간'],
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
          {view === 'month' ? (
            <>
              <button type="button" className="fp-button fp-button-muted" onClick={() => setMonthDate(addMonths(monthDate, -1))}>이전</button>
              <DatePickerField
                className="fp-month-field"
                label="조회 월"
                mode="month"
                value={formatDateKey(monthDate).slice(0, 7)}
                onChange={changeMonth}
              />
              <button type="button" className="fp-button fp-button-muted" onClick={() => setMonthDate(addMonths(monthDate, 1))}>다음</button>
            </>
          ) : (
            <DatePickerField
              className="fp-date-field"
              key={view}
              label={view === 'day' ? '조회 일' : '조회 주'}
              value={view === 'day' ? dayDate : weekDate}
              onChange={view === 'day' ? changeDayDate : changeWeekDate}
            />
          )}
          <button
            type="button"
            className="fp-button fp-button-muted"
            onClick={() => {
              setDayDate(today)
              setWeekDate(today)
              setMonthDate(parseDateKey(today))
              setSelectedDate(today)
              if (!editingId) setForm((value) => ({ ...value, scheduleDate: today }))
            }}
          >
            오늘
          </button>
          <button type="button" className="fp-button fp-button-primary" onClick={reloadSchedules}>조회</button>
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
                return (
                  <button
                    className={[
                      'fp-month-cell',
                      cell.dateKey === selectedDate ? 'selected' : '',
                      !cell.dateKey ? 'empty' : '',
                    ].filter(Boolean).join(' ')}
                    disabled={!cell.dateKey}
                    key={cell.key}
                    type="button"
                    onClick={() => {
                      if (!cell.dateKey) return
                      openMonthDay(cell.dateKey)
                    }}
                  >
                    {date ? <strong>{date.getDate()}</strong> : null}
                    {dayItems.slice(0, 3).map((item) => (
                      <span
                        className="fp-month-schedule-chip"
                        key={item.instanceKey}
                      >
                        {item.title}
                      </span>
                    ))}
                    {dayItems.length > 3 ? <small>+{dayItems.length - 3}</small> : null}
                  </button>
                )
              })}
            </div>
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

        <aside className="fp-schedule-panel">
          <div className="fp-schedule-panel-header">
            <div>
              <h3>{formatKoreanDate(selectedDate)}</h3>
              <p>{selectedItems.length}건</p>
            </div>
            <button className="fp-button fp-button-muted" type="button" onClick={createTodayReminder}>알림 확인</button>
          </div>
          <div className="fp-schedule-list">
            {selectedItems.length ? selectedItems.map(renderScheduleRow) : <p className="fp-empty-text">선택한 날짜에 등록된 일정이 없습니다.</p>}
          </div>
        </aside>
      </div>

      <form className="fp-schedule-form" onSubmit={requestSave}>
        <header>
          <h3>{editingId ? '일정 수정' : '일정 추가'}</h3>
          {editingId ? <button type="button" className="fp-button fp-button-muted" onClick={() => startCreate(form.scheduleDate)}>취소</button> : null}
        </header>
        <div className="fp-form-grid">
          <label className="fp-field span-2">
            <span>일정명 *</span>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <div className="fp-field">
            <DatePickerField
              className="fp-form-date-picker"
              label="날짜 *"
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
            <span>기준</span>
            <select value={form.calendarBasis} onChange={(event) => setForm({ ...form, calendarBasis: event.target.value as 'solar' | 'lunar' })}>
              <option value="solar">양력</option>
              <option value="lunar">음력</option>
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
          <label className="fp-field">
            <span>분류</span>
            <input value={form.category || ''} onChange={(event) => setForm({ ...form, category: event.target.value || null })} />
          </label>
          <label className="fp-field">
            <span>대상</span>
            <input value={form.memberName || ''} onChange={(event) => setForm({ ...form, memberName: event.target.value || null })} />
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
