export interface ScheduleItem {
  id: number
  familyId: number
  title: string
  calendarBasis: 'solar' | 'lunar' | string
  scheduleDate: string
  scheduleTime?: string | null
  category?: string | null
  memberName?: string | null
  repeatRule?: string | null
  pushEnabled?: boolean
  exceptionDates?: string[]
  memo?: string | null
  createdAt: string
}

export interface SchedulePayload {
  title: string
  calendarBasis: 'solar' | 'lunar'
  scheduleDate: string
  scheduleTime: string | null
  category: string | null
  memberName: string | null
  repeatRule: string | null
  pushEnabled: boolean
  memo: string | null
}
