const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토']

export function formatDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function todayKey() {
  return formatDateKey(new Date())
}

export function currentTimeText() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export function monthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return { startDate: formatDateKey(start), endDate: formatDateKey(end) }
}

export function monthInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function formatKoreanDate(value: string) {
  const date = parseDateKey(value)
  return `${value} (${weekdayLabels[date.getDay()]})`
}

export function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

export function addDays(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + amount)
  return formatDateKey(date)
}

export function weekRange(dateKey: string) {
  const date = parseDateKey(dateKey)
  const start = new Date(date)
  start.setDate(date.getDate() - date.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { startDate: formatDateKey(start), endDate: formatDateKey(end) }
}
