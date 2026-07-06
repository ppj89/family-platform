import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../api/client'
import { listUnreadNotifications, markNotificationRead, type NotificationItem } from '../api/notifications'

interface InvitationItem {
  id: number
  familyName?: string
  inviterName?: string
  status?: string
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const mountedRef = useRef(false)

  const loadNotifications = useCallback(async () => {
    const results = await Promise.allSettled([
      listUnreadNotifications(),
      apiRequest<InvitationItem[]>('/family-invitations'),
    ])
    if (!mountedRef.current) return
    const notifications = results[0].status === 'fulfilled' ? results[0].value : []
    const invites = results[1].status === 'fulfilled' ? results[1].value : []
    const inviteNotifications = invites
      .filter((item) => !item.status || String(item.status).toUpperCase() === 'PENDING')
      .map((item) => ({
        id: -item.id,
        type: 'FAMILY_INVITATION',
        title: '가족 초대장',
        body: `${item.familyName || '가족그룹'} 초대가 도착했습니다.`,
        targetDate: '',
      }))
    setItems([...inviteNotifications, ...notifications])
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadNotifications()
    const interval = window.setInterval(() => void loadNotifications(), 15000)
    const handleRefresh = () => void loadNotifications()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadNotifications()
    }
    window.addEventListener('focus', handleRefresh)
    window.addEventListener('family-platform-notifications-refresh', handleRefresh)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      mountedRef.current = false
      window.clearInterval(interval)
      window.removeEventListener('focus', handleRefresh)
      window.removeEventListener('family-platform-notifications-refresh', handleRefresh)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [loadNotifications])

  useEffect(() => {
    if (open) void loadNotifications()
  }, [loadNotifications, open])

  async function handleNotificationClick(item: NotificationItem) {
    if (item.id < 0) {
      setOpen(false)
      return
    }
    setItems((current) => current.filter((next) => next.id !== item.id))
    try {
      await markNotificationRead(item.id)
    } catch {
      void 0
    }
  }

  return (
    <div className="fp-notification-wrap">
      <button className="fp-notification-button" type="button" aria-label="알림" onClick={() => setOpen((value) => !value)}>
        🔔
        {items.length > 0 ? <span className="fp-notification-dot" /> : null}
      </button>
      {open ? (
        <section className="fp-notification-popup">
          <header>
            <strong>알림</strong>
            <button type="button" onClick={() => setOpen(false)}>x</button>
          </header>
          {items.length ? (
            items.map((item) => (
              <button className="fp-notification-item" key={`${item.type}-${item.id}`} type="button" onClick={() => handleNotificationClick(item)}>
                <span>{item.title}</span>
                <strong>{item.body}</strong>
                {item.targetDate ? <small>{item.targetDate}</small> : null}
              </button>
            ))
          ) : (
            <p>확인할 알림이 없습니다.</p>
          )}
        </section>
      ) : null}
    </div>
  )
}
