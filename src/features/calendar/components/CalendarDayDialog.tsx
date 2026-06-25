import { formatKoreanDate } from '../../../shared/utils/date'
import type { CalendarScheduleInstance } from '../utils/repeat'
import { CalendarScheduleRow } from './CalendarScheduleRow'

interface CalendarDayDialogProps {
  date: string
  items: CalendarScheduleInstance[]
  onClose: () => void
  onEdit: (item: CalendarScheduleInstance) => void
  onDelete: (item: CalendarScheduleInstance) => void
}

export function CalendarDayDialog({ date, items, onClose, onEdit, onDelete }: CalendarDayDialogProps) {
  return (
    <div className="fp-calendar-popup-backdrop" role="presentation" onClick={onClose}>
      <section className="fp-calendar-popup" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header>
          <h3>{formatKoreanDate(date)} 일정</h3>
          <button type="button" aria-label="닫기" onClick={onClose}>x</button>
        </header>
        <div className="fp-schedule-list">
          {items.length ? (
            items.map((item) => (
              <CalendarScheduleRow
                item={item}
                key={item.instanceKey}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ))
          ) : (
            <p className="fp-empty-text">해당 날짜에 등록된 일정이 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  )
}
