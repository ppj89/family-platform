import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { apiRequest } from '../../../shared/api/client'

const deviceKey = 'family-platform-push-device-id'
let registrationListenerAttached = false

function deviceId() {
  const stored = window.localStorage.getItem(deviceKey)
  if (stored) return stored
  const created = crypto.randomUUID()
  window.localStorage.setItem(deviceKey, created)
  return created
}

function refreshBellNotifications() {
  window.dispatchEvent(new CustomEvent('family-platform-notifications-refresh'))
}

function openCommunityNotification(data: Record<string, unknown> | undefined) {
  const postId = Number(data?.communityPostId)
  const commentId = Number(data?.communityCommentId)
  if (!Number.isInteger(postId) || postId <= 0) return
  window.sessionStorage.setItem('family-platform-community-target', JSON.stringify({
    postId,
    commentId: Number.isInteger(commentId) && commentId > 0 ? commentId : undefined,
  }))
  window.dispatchEvent(new CustomEvent('family-platform-community-open'))
}

export async function initializePushNotifications(enabled: boolean) {
  if (!enabled || !Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('PushNotifications')) return
  const permission = await PushNotifications.checkPermissions()
  const display = permission.receive === 'granted' ? permission : await PushNotifications.requestPermissions()
  if (display.receive !== 'granted') {
    await apiRequest(`/push-devices/${encodeURIComponent(deviceId())}`, { method: 'DELETE' }).catch(() => undefined)
    return
  }
  if (!registrationListenerAttached) {
    registrationListenerAttached = true
    await PushNotifications.addListener('registration', (token) => {
      void apiRequest('/push-devices', { method: 'PUT', body: { deviceId: deviceId(), token: token.value, platform: Capacitor.getPlatform() } }).catch(() => undefined)
    })
    await PushNotifications.addListener('registrationError', () => undefined)
    await PushNotifications.addListener('pushNotificationReceived', () => {
      refreshBellNotifications()
    })
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      refreshBellNotifications()
      openCommunityNotification(action.notification.data)
    })
  }
  await PushNotifications.register()
}
