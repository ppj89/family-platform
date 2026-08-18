import { useEffect, useMemo, useRef, useState } from 'react'
import { CgChevronLeft, CgChevronRight } from 'react-icons/cg'
import { addMonths, formatDateKey, parseDateKey, todayKey } from '../utils/date'
import { isKoreanHoliday } from '../utils/koreanHolidays'
import './date-picker-field.css'

type DatePickerMode = 'date' | 'month' | 'year'
type PickerLevel = DatePickerMode
export type DatePickerChangeMeta = { source: 'today' | 'select' }

interface DatePickerFieldProps {
  className?: string
  displayValue?: string
  label?: string
  mode?: DatePickerMode
  required?: boolean
  showCalendarIcon?: boolean
  value: string
  onChange: (value: string, meta?: DatePickerChangeMeta) => void
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const months = Array.from({ length: 12 }, (_, index) => index + 1)
const years = Array.from({ length: 12 }, (_, index) => index)

function displayDate(value: string) {
  return value ? value.replace(/-/g, '.') : '날짜 선택'
}

function displayMonth(value: string) {
  if (!value) return '월 선택'
  const [year, month] = value.split('-')
  return `${year}년 ${Number(month)}월`
}

function displayYear(value: string) {
  return value ? `${value}년` : '연도 선택'
}

function monthDays(viewDate: Date) {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const lastDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()
  return [
    ...Array.from({ length: firstDay.getDay() }, (_, index) => ({ key: `empty-${index}`, dateKey: '' })),
    ...Array.from({ length: lastDate }, (_, index) => {
      const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), index + 1)
      return { key: formatDateKey(date), dateKey: formatDateKey(date) }
    }),
  ]
}

function initialViewDate(value: string, mode: DatePickerMode) {
  if (mode === 'year') {
    const year = Number(value || new Date().getFullYear())
    return new Date(Number.isFinite(year) ? year : new Date().getFullYear(), 0, 1)
  }
  if (mode === 'month') {
    const source = value ? `${value}-01` : todayKey()
    return parseDateKey(source)
  }
  return parseDateKey(value || todayKey())
}

export function DatePickerField({ className = '', displayValue, label, mode = 'date', required = false, showCalendarIcon = true, value, onChange }: DatePickerFieldProps) {
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState<PickerLevel>(mode)
  const [viewDate, setViewDate] = useState(() => initialViewDate(value, mode))
  const rootRef = useRef<HTMLLabelElement>(null)
  const cells = useMemo(() => monthDays(viewDate), [viewDate])
  const selectedViewDate = useMemo(() => initialViewDate(value, mode), [mode, value])
  const currentToday = todayKey()

  useEffect(() => {
    if (!open) return
    setViewDate(initialViewDate(value, mode))
    setLevel(mode)
  }, [mode, open, value])

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

  function selectDate(dateKey: string) {
    onChange(dateKey, { source: 'select' })
    setOpen(false)
  }

  function selectMonth(month: number) {
    const nextDate = new Date(viewDate.getFullYear(), month - 1, 1)
    setViewDate(nextDate)
    if (mode === 'month') {
      onChange(`${nextDate.getFullYear()}-${String(month).padStart(2, '0')}`, { source: 'select' })
      setOpen(false)
      return
    }
    setLevel('date')
  }

  function selectYear(year: number) {
    const nextDate = new Date(year, viewDate.getMonth(), 1)
    setViewDate(nextDate)
    if (mode === 'year') {
      onChange(String(year), { source: 'select' })
      setOpen(false)
      return
    }
    setLevel('month')
  }

  function selectToday() {
    if (mode === 'year') onChange(currentToday.slice(0, 4), { source: 'today' })
    else if (mode === 'month') onChange(currentToday.slice(0, 7), { source: 'today' })
    else onChange(currentToday, { source: 'today' })
    setOpen(false)
  }

  function moveView(amount: number) {
    setViewDate((current) => addMonths(current, level === 'year' ? amount * 144 : level === 'month' ? amount * 12 : amount))
  }

  function cycleLevel() {
    setLevel((current) => {
      if (current === 'date') return 'month'
      if (current === 'month') return 'year'
      return mode
    })
  }

  function titleText() {
    if (level === 'year') {
      const start = Math.floor(viewDate.getFullYear() / 12) * 12
      return `${start} - ${start + 11}`
    }
    if (level === 'month') return `${viewDate.getFullYear()}년`
    return `${viewDate.getFullYear()}년 ${viewDate.getMonth() + 1}월`
  }

  function toggleOpen() {
    setViewDate(initialViewDate(value, mode))
    setLevel(mode)
    setOpen((current) => !current)
  }

  return (
    <label className={`fp-field fp-date-picker-field date-picker-field ${open ? 'open' : ''} ${className}`} ref={rootRef}>
      {label ? <span>{label}{required ? <em className="fp-required-mark">*</em> : null}</span> : null}
      <button className="fp-date-picker-trigger date-picker-trigger" type="button" onClick={toggleOpen}>
        <strong>{displayValue || (mode === 'year' ? displayYear(value) : mode === 'month' ? displayMonth(value) : displayDate(value))}</strong>
        {showCalendarIcon ? (
          <span aria-hidden="true" className="fp-date-picker-calendar-icon">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M8 2v4" />
              <path d="M16 2v4" />
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M3 10h18" />
              <path d="M8 14h.01" />
              <path d="M12 14h.01" />
              <path d="M16 14h.01" />
              <path d="M8 18h.01" />
              <path d="M12 18h.01" />
              <path d="M16 18h.01" />
            </svg>
          </span>
        ) : (
          <span aria-hidden="true" className="fp-date-picker-caret">▾</span>
        )}
      </button>
      {open ? (
        <div className={`fp-date-picker-popover fp-date-picker-popover-${mode} fp-date-picker-level-${level}`}>
          <header>
            <button type="button" aria-label="이전" onClick={() => moveView(-1)}>
              <CgChevronLeft aria-hidden="true" />
            </button>
            <button className="fp-date-picker-title-button" type="button" onClick={cycleLevel}>
              <strong>{titleText()}</strong>
            </button>
            <button type="button" aria-label="다음" onClick={() => moveView(1)}>
              <CgChevronRight aria-hidden="true" />
            </button>
          </header>
          {mode === 'date' ? (
            <div className="fp-date-picker-today-row">
              <button className="fp-date-picker-today" type="button" onClick={selectToday}>오늘</button>
            </div>
          ) : null}
          {level === 'year' ? (
            <div className="fp-date-picker-years">
              {years.map((offset) => {
                const year = Math.floor(viewDate.getFullYear() / 12) * 12 + offset
                return (
                  <button className={selectedViewDate.getFullYear() === year ? 'selected' : ''} key={year} type="button" onClick={() => selectYear(year)}>
                    {year}년
                  </button>
                )
              })}
            </div>
          ) : level === 'month' ? (
            <div className="fp-date-picker-months">
              {months.map((month) => {
                const monthValue = `${viewDate.getFullYear()}-${String(month).padStart(2, '0')}`
                return (
                  <button
                    className={selectedViewDate.getFullYear() === viewDate.getFullYear() && selectedViewDate.getMonth() + 1 === month ? 'selected' : ''}
                    key={monthValue}
                    type="button"
                    onClick={() => selectMonth(month)}
                  >
                    {month}월
                  </button>
                )
              })}
            </div>
          ) : (
            <>
              <div className="fp-date-picker-weekdays">
                {weekdays.map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="fp-date-picker-days">
                {cells.map((cell) => {
                  const date = cell.dateKey ? parseDateKey(cell.dateKey) : null
                  const day = date?.getDay()
                  const dayClass = [
                    cell.dateKey && cell.dateKey === value ? 'selected' : '',
                    cell.dateKey && cell.dateKey === currentToday ? 'today' : '',
                    day === 0 || (cell.dateKey && isKoreanHoliday(cell.dateKey)) ? 'sunday holiday' : '',
                    day === 6 ? 'saturday' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <button
                      className={dayClass}
                      disabled={!cell.dateKey}
                      key={cell.key}
                      type="button"
                      onClick={() => selectDate(cell.dateKey)}
                    >
                      {date ? date.getDate() : ''}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          {mode !== 'date' ? <button className="fp-date-picker-today" type="button" onClick={selectToday}>오늘</button> : null}
        </div>
      ) : null}
    </label>
  )
}
