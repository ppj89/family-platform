import { addDays, formatDateKey, parseDateKey } from './date'

type HolidayMap = Record<string, string>

const cachedHolidayMaps = new Map<number, HolidayMap>()

const fixedRedDays = [
  { month: 1, day: 1, name: '신정', substitute: false },
  { month: 3, day: 1, name: '3·1절', substitute: true },
  { month: 5, day: 5, name: '어린이날', substitute: true },
  { month: 6, day: 6, name: '현충일', substitute: false },
  { month: 7, day: 17, name: '제헌절', substitute: false },
  { month: 8, day: 15, name: '광복절', substitute: true },
  { month: 10, day: 3, name: '개천절', substitute: true },
  { month: 10, day: 9, name: '한글날', substitute: true },
  { month: 12, day: 25, name: '성탄절', substitute: true },
]

const exceptionalRedDays: HolidayMap = {
  '2026-06-03': '지방선거',
}

const lunarFormatter = new Intl.DateTimeFormat('ko-KR-u-ca-chinese', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

function setHoliday(map: HolidayMap, dateKey: string, name: string) {
  if (!map[dateKey]) map[dateKey] = name
}

function isWeekend(dateKey: string) {
  const day = parseDateKey(dateKey).getDay()
  return day === 0 || day === 6
}

function isSunday(dateKey: string) {
  return parseDateKey(dateKey).getDay() === 0
}

function nextAvailableWeekday(map: HolidayMap, dateKey: string) {
  let next = addDays(dateKey, 1)
  while (isWeekend(next) || map[next]) next = addDays(next, 1)
  return next
}

function addSubstitute(map: HolidayMap, dateKey: string) {
  setHoliday(map, nextAvailableWeekday(map, dateKey), '대체공휴일')
}

function lunarDateParts(date: Date) {
  const parts = lunarFormatter.formatToParts(date)
  return {
    year: Number(parts.find((part) => String(part.type) === 'relatedYear')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  }
}

function findLunarDate(year: number, month: number, day: number) {
  const cursor = new Date(year, 0, 1)
  const end = new Date(year, 11, 31)
  while (cursor <= end) {
    const lunar = lunarDateParts(cursor)
    if (lunar.year === year && lunar.month === month && lunar.day === day) return formatDateKey(cursor)
    cursor.setDate(cursor.getDate() + 1)
  }
  return ''
}

function addLunarHolidayGroup(map: HolidayMap, centerDateKey: string, labels: [string, string, string]) {
  if (!centerDateKey) return
  const dates = [addDays(centerDateKey, -1), centerDateKey, addDays(centerDateKey, 1)]
  dates.forEach((dateKey, index) => setHoliday(map, dateKey, labels[index]))
  let lastDate = dates[dates.length - 1]
  dates.filter(isSunday).forEach(() => {
    const substituteDate = nextAvailableWeekday(map, lastDate)
    setHoliday(map, substituteDate, '대체공휴일')
    lastDate = substituteDate
  })
}

function buildHolidayMap(year: number) {
  const map: HolidayMap = {}

  fixedRedDays.forEach((holiday) => {
    const dateKey = `${year}-${String(holiday.month).padStart(2, '0')}-${String(holiday.day).padStart(2, '0')}`
    setHoliday(map, dateKey, holiday.name)
  })

  addLunarHolidayGroup(map, findLunarDate(year, 1, 1), ['설연휴', '설날', '설연휴'])
  addLunarHolidayGroup(map, findLunarDate(year, 8, 15), ['추석연휴', '추석', '추석연휴'])

  const buddhaDate = findLunarDate(year, 4, 8)
  if (buddhaDate) setHoliday(map, buddhaDate, '부처님오신날')

  Object.entries(exceptionalRedDays).forEach(([dateKey, name]) => {
    if (dateKey.startsWith(`${year}-`)) setHoliday(map, dateKey, name)
  })

  fixedRedDays.forEach((holiday) => {
    if (!holiday.substitute) return
    const dateKey = `${year}-${String(holiday.month).padStart(2, '0')}-${String(holiday.day).padStart(2, '0')}`
    if (isWeekend(dateKey)) addSubstitute(map, dateKey)
  })
  if (buddhaDate && isWeekend(buddhaDate)) addSubstitute(map, buddhaDate)

  return map
}

export function getKoreanHolidayName(dateKey: string) {
  const year = Number(dateKey.slice(0, 4))
  if (!Number.isFinite(year)) return ''
  if (!cachedHolidayMaps.has(year)) cachedHolidayMaps.set(year, buildHolidayMap(year))
  return cachedHolidayMaps.get(year)?.[dateKey] || ''
}

export function isKoreanHoliday(dateKey: string) {
  return Boolean(getKoreanHolidayName(dateKey))
}
