import { useEffect } from 'react'
import { refreshTodayCalendarNotifications } from './todayNotifications'

const calendarNotificationRefreshEvent = 'family-platform-calendar-refresh-today-notifications'

export function requestTodayCalendarNotificationRefresh() {
  window.dispatchEvent(new CustomEvent(calendarNotificationRefreshEvent))
}

export function useTodayCalendarNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined
    let disposed = false

    async function refresh() {
      try {
        await refreshTodayCalendarNotifications()
      } catch {
        void 0
      }
    }

    function refreshIfActive() {
      if (disposed || document.visibilityState === 'hidden') return
      void refresh()
    }

    void refresh()
    window.addEventListener('focus', refreshIfActive)
    window.addEventListener(calendarNotificationRefreshEvent, refreshIfActive)
    document.addEventListener('visibilitychange', refreshIfActive)

    return () => {
      disposed = true
      window.removeEventListener('focus', refreshIfActive)
      window.removeEventListener(calendarNotificationRefreshEvent, refreshIfActive)
      document.removeEventListener('visibilitychange', refreshIfActive)
    }
  }, [enabled])
}
