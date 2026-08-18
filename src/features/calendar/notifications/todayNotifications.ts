import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { listSchedules, createScheduleReminders } from '../api/schedules'
import { todayKey } from '../../../shared/utils/date'
import { expandScheduleInstances, type CalendarScheduleInstance } from '../utils/repeat'

const calendarNotificationStoreKey = 'family-platform-calendar-today-notification-v3'
const legacyCalendarNotificationStoreKeys = [
  'family-platform-calendar-today-notification-v2',
  'family-platform-calendar-today-notifications-v1',
]
const calendarNotificationChannelId = 'calendar-today'
const scheduleStartDate = '2000-01-01'
const dailyNotificationHour = 9
const dailyNotificationMinute = 0
const notificationHashBase = 1_000_000_000
const notificationHashRange = 900_000_000

type CalendarStoredNotification = {
  id: number
  scheduledAt: string
  type: 'daily' | 'time'
}

type CalendarNotificationStore = {
  date: string
  itemKey: string
  notifications: CalendarStoredNotification[]
}

type CalendarNotificationTarget = CalendarStoredNotification & {
  title: string
  body: string
  largeBody?: string
}

function parseStore(raw: string, date: string): CalendarNotificationStore | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CalendarNotificationStore> & { id?: number; scheduledAt?: string }
    if (parsed.date !== date || typeof parsed.itemKey !== 'string') return null
    if (Array.isArray(parsed.notifications)) {
      return {
        date,
        itemKey: parsed.itemKey,
        notifications: parsed.notifications.filter((item): item is CalendarStoredNotification => (
          typeof item.id === 'number'
          && typeof item.scheduledAt === 'string'
          && (item.type === 'daily' || item.type === 'time')
        )),
      }
    }
    if (typeof parsed.id === 'number' && typeof parsed.scheduledAt === 'string') {
      return {
        date,
        itemKey: parsed.itemKey,
        notifications: [{ id: parsed.id, scheduledAt: parsed.scheduledAt, type: 'daily' }],
      }
    }
    return null
  } catch {
    return null
  }
}

function readStore(date: string): CalendarNotificationStore | null {
  const keys = [calendarNotificationStoreKey, ...legacyCalendarNotificationStoreKeys]
  for (const key of keys) {
    const raw = window.localStorage.getItem(key)
    if (!raw) continue
    const store = parseStore(raw, date)
    if (store) return store
  }
  return null
}

function writeStore(store: CalendarNotificationStore) {
  try {
    window.localStorage.setItem(calendarNotificationStoreKey, JSON.stringify(store))
  } catch {
    void 0
  }
}

function clearStore() {
  try {
    window.localStorage.removeItem(calendarNotificationStoreKey)
    legacyCalendarNotificationStoreKeys.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    void 0
  }
}

function dailyNotificationId(date: string) {
  const digits = date.replace(/[^\d]/g, '')
  return Number(digits) || 1
}

function dailyNotificationTime(date: string) {
  return new Date(`${date}T${String(dailyNotificationHour).padStart(2, '0')}:${String(dailyNotificationMinute).padStart(2, '0')}:00`)
}

function scheduleNotificationTime(date: string, time?: string | null) {
  const value = time?.slice(0, 5) || ''
  if (!/^\d{2}:\d{2}$/.test(value)) return null
  return new Date(`${date}T${value}:00`)
}

function hashText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function timeNotificationId(item: CalendarScheduleInstance, index: number) {
  const key = [item.id, item.occurrenceDate, item.scheduleTime || '', index].join('|')
  return notificationHashBase + (hashText(key) % notificationHashRange)
}

function notificationItemKey(items: CalendarScheduleInstance[]) {
  return items
    .map((item) => [item.id, item.occurrenceDate, item.scheduleTime || '', item.title, item.category || '', item.memberName || '', item.memo || ''].join('|'))
    .sort()
    .join('||')
}

function formatScheduleLine(item: CalendarScheduleInstance) {
  const time = item.scheduleTime ? item.scheduleTime.slice(0, 5) : '시간 미정'
  return `${time} · ${item.title}`
}

function notificationBody(items: CalendarScheduleInstance[]) {
  const first = items[0]
  if (!first) return '오늘 일정이 있습니다.'
  const suffix = items.length > 1 ? ` 외 ${items.length - 1}건` : ''
  return `${formatScheduleLine(first)}${suffix}`
}

function notificationSignature(targets: CalendarNotificationTarget[]) {
  return targets
    .map((target) => [target.id, target.type, target.scheduledAt].join('|'))
    .sort()
    .join('||')
}

async function ensureNativeNotificationReady() {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('LocalNotifications')) return false
  const checked = await LocalNotifications.checkPermissions()
  const permission = checked.display === 'granted' ? checked : await LocalNotifications.requestPermissions()
  if (permission.display !== 'granted') return false
  await LocalNotifications.createChannel({
    id: calendarNotificationChannelId,
    name: '일정 알림',
    description: '당일 일정 알림',
    importance: 4,
    visibility: 1,
    vibration: true,
  })
  return true
}

async function cancelStoredNotifications(store: CalendarNotificationStore | null) {
  if (!store || !Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('LocalNotifications')) return
  const notifications = store.notifications.map((item) => ({ id: item.id }))
  if (!notifications.length) return
  await LocalNotifications.cancel({ notifications })
}

function buildNotificationTargets(today: string, todayItems: CalendarScheduleInstance[]) {
  const now = Date.now()
  const targets: CalendarNotificationTarget[] = []
  const dailyAt = dailyNotificationTime(today)

  if (dailyAt.getTime() > now) {
    targets.push({
      id: dailyNotificationId(today),
      type: 'daily',
      scheduledAt: dailyAt.toISOString(),
      title: '오늘 일정이 있습니다.',
      body: notificationBody(todayItems),
      largeBody: todayItems.map(formatScheduleLine).join('\n'),
    })
  }

  todayItems.forEach((item, index) => {
    const scheduleAt = scheduleNotificationTime(today, item.scheduleTime)
    if (!scheduleAt || scheduleAt.getTime() <= now) return
    targets.push({
      id: timeNotificationId(item, index),
      type: 'time',
      scheduledAt: scheduleAt.toISOString(),
      title: '일정 시간입니다.',
      body: formatScheduleLine(item),
      largeBody: item.memo?.trim() || formatScheduleLine(item),
    })
  })

  return targets
}

export async function syncTodayCalendarNotifications(items: CalendarScheduleInstance[]) {
  if (typeof window === 'undefined') return
  const today = todayKey()
  const todayItems = items.filter((item) => item.occurrenceDate === today)
  const store = readStore(today)

  if (!todayItems.length) {
    await cancelStoredNotifications(store)
    clearStore()
    return
  }

  const nativeReady = await ensureNativeNotificationReady()
  if (!nativeReady) return

  const targets = buildNotificationTargets(today, todayItems)
  if (!targets.length) {
    await cancelStoredNotifications(store)
    clearStore()
    return
  }

  const itemKey = `${notificationItemKey(todayItems)}::${notificationSignature(targets)}`
  if (store?.itemKey === itemKey) return
  await cancelStoredNotifications(store)

  await LocalNotifications.schedule({
    notifications: targets.map((target) => ({
      id: target.id,
      title: target.title,
      body: target.body,
      largeBody: target.largeBody,
      schedule: { at: new Date(target.scheduledAt), allowWhileIdle: true },
      channelId: calendarNotificationChannelId,
    })),
  })
  writeStore({
    date: today,
    itemKey,
    notifications: targets.map(({ id, scheduledAt, type }) => ({ id, scheduledAt, type })),
  })
}

export async function refreshTodayCalendarNotifications() {
  const today = todayKey()
  const schedules = await listSchedules(scheduleStartDate, today)
  const todayItems = expandScheduleInstances(schedules, today, today)
  await Promise.allSettled([createScheduleReminders(today), syncTodayCalendarNotifications(todayItems)])
  window.dispatchEvent(new CustomEvent('family-platform-notifications-refresh'))
}
