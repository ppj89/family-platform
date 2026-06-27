import { useEffect, useMemo, useRef, useState } from 'react'
import { addMonths, formatDateKey, parseDateKey, todayKey } from '../utils/date'
import './date-picker-field.css'

interface DatePickerFieldProps {
  className?: string
  label?: string
  mode?: 'date' | 'month'
  value: string
  onChange: (value: string) => void
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const months = Array.from({ length: 12 }, (_, index) => index + 1)

function displayDate(value: string) {
  return value ? value.replace(/-/g, '.') : '날짜 선택'
}

function displayMonth(value: string) {
  if (!value) return '월 선택'
  const [year, month] = value.split('-')
  return `${year}년 ${Number(month)}월`
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

function initialViewDate(value: string, mode: 'date' | 'month') {
  if (mode === 'month') {
    const source = value ? `${value}-01` : todayKey()
    return parseDateKey(source)
  }
  return parseDateKey(value || todayKey())
}

export function DatePickerField({ className = '', label, mode = 'date', value, onChange }: DatePickerFieldProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => initialViewDate(value, mode))
  const rootRef = useRef<HTMLLabelElement>(null)
  const cells = useMemo(() => monthDays(viewDate), [viewDate])
  const currentToday = todayKey()

  useEffect(() => {
    if (!open) return
    setViewDate(initialViewDate(value, mode))
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
    onChange(dateKey)
    setOpen(false)
  }

  function selectMonth(month: number) {
    onChange(`${viewDate.getFullYear()}-${String(month).padStart(2, '0')}`)
    setOpen(false)
  }

  function selectToday() {
    if (mode === 'month') onChange(currentToday.slice(0, 7))
    else onChange(currentToday)
    setOpen(false)
  }

  return (
    <label className={`fp-field fp-date-picker-field ${className}`} ref={rootRef}>
      {label ? <span>{label}</span> : null}
      <button className="fp-date-picker-trigger" type="button" onClick={() => setOpen((current) => !current)}>
        <strong>{mode === 'month' ? displayMonth(value) : displayDate(value)}</strong>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="fp-date-picker-popover">
          <header>
            <button type="button" aria-label="이전" onClick={() => setViewDate((current) => addMonths(current, mode === 'month' ? -12 : -1))}>
              &lt;
            </button>
            <strong>{mode === 'month' ? `${viewDate.getFullYear()}년` : `${viewDate.getFullYear()}년 ${viewDate.getMonth() + 1}월`}</strong>
            <button type="button" aria-label="다음" onClick={() => setViewDate((current) => addMonths(current, mode === 'month' ? 12 : 1))}>
              &gt;
            </button>
          </header>
          {mode === 'month' ? (
            <div className="fp-date-picker-months">
              {months.map((month) => {
                const monthValue = `${viewDate.getFullYear()}-${String(month).padStart(2, '0')}`
                return (
                  <button className={value === monthValue ? 'selected' : ''} key={month} type="button" onClick={() => selectMonth(month)}>
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
                {cells.map((cell) => (
                  <button
                    className={cell.dateKey === value ? 'selected' : ''}
                    disabled={!cell.dateKey}
                    key={cell.key}
                    type="button"
                    onClick={() => selectDate(cell.dateKey)}
                  >
                    {cell.dateKey ? parseDateKey(cell.dateKey).getDate() : ''}
                  </button>
                ))}
              </div>
            </>
          )}
          <button className="fp-date-picker-today" type="button" onClick={selectToday}>오늘</button>
        </div>
      ) : null}
    </label>
  )
}
