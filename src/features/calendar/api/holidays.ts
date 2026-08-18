import { apiRequest } from '../../../shared/api/client'

export type HolidayItem = {
  dateKey: string
  name: string
  source: string
}

export async function listHolidays(startDate: string, endDate: string) {
  const query = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
  const response = await apiRequest<{ items: HolidayItem[] }>(`/holidays?${query}`)
  return response.items
}
