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
  memo: string | null
}
