import { apiRequest } from './client'

export function recordMenuView(menuKey: string) {
  return apiRequest<null>('/analytics/menu-view', {
    method: 'POST',
    body: { menuKey },
  })
}
