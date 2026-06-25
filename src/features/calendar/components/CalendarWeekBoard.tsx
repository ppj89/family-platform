import { formatKoreanDate } from '../../../shared/utils/date'
import type { CalendarScheduleInstance } from '../utils/repeat'

interface CalendarWeekBoardProps {
  dates: string[]
  selectedDate: string
  visibleItems: CalendarScheduleInstance[]
  onSelectDate: (dateKey: string) => void
}

export function CalendarWeekBoard({ dates, selectedDate, visibleItems, onSelectDate }: CalendarWeekBoardProps) {
  return (
    <section className="fp-week-board">
      {dates.map((dateKey) => {
        const dayItems = visibleItems.filter((item) => item.occurrenceDate === dateKey)
        return (
          <button
            className={selectedDate === dateKey ? 'active' : ''}
            key={dateKey}
            type="button"
            onClick={() => onSelectDate(dateKey)}
          >
            <strong>{formatKoreanDate(dateKey)}</strong>
            <span>{dayItems.length}건</span>
            {dayItems.slice(0, 2).map((item) => <small key={item.instanceKey}>{item.title}</small>)}
          </button>
        )
      })}
    </section>
  )
}
