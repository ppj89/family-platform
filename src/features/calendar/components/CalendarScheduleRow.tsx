import { formatKoreanDate } from '../../../shared/utils/date'
import type { CalendarScheduleInstance } from '../utils/repeat'

interface CalendarScheduleRowProps {
  item: CalendarScheduleInstance
  onEdit: (item: CalendarScheduleInstance) => void
  onDelete: (item: CalendarScheduleInstance) => void
}

function scheduleTime(item: Pick<CalendarScheduleInstance, 'scheduleTime'>) {
  return item.scheduleTime ? item.scheduleTime.slice(0, 5) : '시간 미정'
}

function repeatLabel(rule?: string | null) {
  if (rule === 'weekly') return '매주'
  if (rule === 'monthly') return '매월'
  if (rule === 'yearly') return '매년'
  return '반복 없음'
}

function isRepeatRule(rule?: string | null) {
  return !!rule && rule !== 'none'
}

export function CalendarScheduleRow({ item, onEdit, onDelete }: CalendarScheduleRowProps) {
  return (
    <article className="fp-schedule-row">
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
        <button type="button" onClick={() => onEdit(item)}>수정</button>
        <button type="button" className="danger" onClick={() => onDelete(item)}>삭제</button>
      </div>
    </article>
  )
}
