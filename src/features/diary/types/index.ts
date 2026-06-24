export interface DiaryItem {
  id: number
  familyId: number
  title: string
  body: string
  diaryDate: string
  weather?: string | null
  mood?: string | null
  minTemperature?: number | null
  maxTemperature?: number | null
  mediaUrls: string[]
  createdAt: string
}

export interface DiaryPayload {
  title: string
  body: string
  diaryDate: string
  weather?: string | null
  mood?: string | null
  minTemperature?: number | null
  maxTemperature?: number | null
  mediaUrls: string[]
}
