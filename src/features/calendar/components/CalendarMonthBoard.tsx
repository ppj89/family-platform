import { parseDateKey } from '../../../shared/utils/date'
import type { CalendarScheduleInstance } from '../utils/repeat'

interface MonthCell {
  key: string
  dateKey: string
}

interface CalendarMonthBoardProps {
  cells: MonthCell[]
  selectedDate: string
  visibleItems: CalendarScheduleInstance[]
  onOpenDay: (dateKey: string) => void
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토']

export function CalendarMonthBoard({ cells, selectedDate, visibleItems, onOpenDay }: CalendarMonthBoardProps) {
  return (
    <section className="fp-calendar-board">
      <div className="fp-weekdays">
        {weekdays.map((day) => <span key={day}>{day}</span>)}
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
                dayItems.length ? 'has-schedules' : '',
              ].filter(Boolean).join(' ')}
              disabled={!cell.dateKey}
              key={cell.key}
              type="button"
              onClick={() => {
                if (cell.dateKey) onOpenDay(cell.dateKey)
              }}
            >
              {date ? <strong>{date.getDate()}</strong> : null}
              {dayItems.slice(0, 3).map((item) => (
                <span className="fp-month-schedule-chip" key={item.instanceKey}>
                  {item.title}
                </span>
              ))}
              {dayItems.length > 3 ? <small>+{dayItems.length - 3}</small> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
