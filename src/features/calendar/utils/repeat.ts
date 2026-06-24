import { formatDateKey, parseDateKey } from '../../../shared/utils/date'
import type { ScheduleItem } from '../types'

export interface CalendarScheduleInstance extends ScheduleItem {
  instanceKey: string
  occurrenceDate: string
  sourceDate: string
  isRepeatInstance: boolean
}

export function isRepeatRule(rule?: string | null) {
  return !!rule && rule !== 'none'
}

function addDays(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + amount)
  return formatDateKey(date)
}

function isSameOccurrenceDay(item: ScheduleItem, dateKey: string) {
  if (dateKey < item.scheduleDate) return false
  const source = parseDateKey(item.scheduleDate)
  const target = parseDateKey(dateKey)

  if (!isRepeatRule(item.repeatRule)) return item.scheduleDate === dateKey
  if (item.repeatRule === 'weekly') return source.getDay() === target.getDay()
  if (item.repeatRule === 'monthly') return source.getDate() === target.getDate()
  if (item.repeatRule === 'yearly') {
    return source.getMonth() === target.getMonth() && source.getDate() === target.getDate()
  }
  return item.scheduleDate === dateKey
}

export function expandScheduleInstances(items: ScheduleItem[], startDate: string, endDate: string) {
  const instances: CalendarScheduleInstance[] = []
  let cursor = startDate
  let guard = 0

  while (cursor <= endDate && guard < 740) {
    for (const item of items) {
      if (!isSameOccurrenceDay(item, cursor)) continue
      instances.push({
        ...item,
        scheduleDate: cursor,
        occurrenceDate: cursor,
        sourceDate: item.scheduleDate,
        isRepeatInstance: cursor !== item.scheduleDate || isRepeatRule(item.repeatRule),
        instanceKey: `${item.id}-${cursor}`,
      })
    }
    cursor = addDays(cursor, 1)
    guard += 1
  }

  return instances.sort((a, b) => `${a.occurrenceDate} ${a.scheduleTime || ''}`.localeCompare(`${b.occurrenceDate} ${b.scheduleTime || ''}`))
}
