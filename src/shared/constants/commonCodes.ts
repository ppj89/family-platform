export interface CommonCodeOption {
  label: string
  value: string
}

export const SELECT_PLACEHOLDER_OPTION = { label: '선택', value: '' } as const

export const TRAVEL_COST_CATEGORIES = ['교통', '숙박', '식비', '입장료', '쇼핑', '기타'] as const

export type TravelCostCategory = typeof TRAVEL_COST_CATEGORIES[number]

export const LEDGER_ENTRY_TYPE_OPTIONS = [
  { label: '지출', value: 'expense' },
  { label: '수입', value: 'income' },
] as const

export const LEDGER_CATEGORIES = ['식비', '교통', '생활', '의료', '교육', '여행', '기타'] as const
export const LEDGER_PAYMENT_METHODS = ['카드', '현금', '계좌이체', '간편결제', '기타'] as const
export const FAMILY_MEMBER_OPTIONS = ['아빠', '엄마', '가족'] as const

export const CALENDAR_CATEGORIES = ['일정', '가족행사', '기념일', '병원', '학교', '여행', '기타'] as const

export const BABY_RECORD_TYPES = ['수유', '대변', '소변', '수면', '성장', '병원', '메모'] as const
export const BABY_GENDER_OPTIONS: readonly CommonCodeOption[] = [
  SELECT_PLACEHOLDER_OPTION,
  { label: '남', value: '남' },
  { label: '여', value: '여' },
]

export const DIARY_MOODS = ['좋음', '보통', '힘듦', '기록'] as const
export const DIARY_WEATHER_OPTIONS = ['맑음', '흐림', '비', '눈', '바람'] as const

export const RESTAURANT_PRICE_OPTIONS: readonly CommonCodeOption[] = [
  SELECT_PLACEHOLDER_OPTION,
  { label: '1만원 이하', value: '10000' },
  { label: '1~3만원', value: '30000' },
  { label: '3~5만원', value: '50000' },
  { label: '5만원 이상', value: '70000' },
]

export const RESTAURANT_RATING_OPTIONS: readonly CommonCodeOption[] = [
  SELECT_PLACEHOLDER_OPTION,
  { label: '1점', value: '1' },
  { label: '2점', value: '2' },
  { label: '3점', value: '3' },
  { label: '4점', value: '4' },
  { label: '5점', value: '5' },
]

export const RESTAURANT_SCOPE_OPTIONS: readonly CommonCodeOption[] = [
  { label: '전체 가족', value: '전체 가족' },
  { label: '개인', value: '개인' },
]

export const COMMON_CODE_GROUPS = {
  ledgerCategories: { menuKey: 'ledger', code: 'category' },
  ledgerPaymentMethods: { menuKey: 'ledger', code: 'paymentMethod' },
  travelCostCategories: { menuKey: 'travel', code: 'costCategory' },
  familyMembers: { menuKey: 'family', code: 'memberName' },
  calendarCategories: { menuKey: 'calendar', code: 'category' },
  babyRecordTypes: { menuKey: 'baby', code: 'recordType' },
  babyGenders: { menuKey: 'baby', code: 'gender' },
  diaryMoods: { menuKey: 'diary', code: 'mood' },
  diaryWeather: { menuKey: 'diary', code: 'weather' },
  restaurantPrices: { menuKey: 'restaurant', code: 'price' },
  restaurantRatings: { menuKey: 'restaurant', code: 'rating' },
  restaurantScopes: { menuKey: 'restaurant', code: 'scope' },
} as const

export type CommonCodeGroupKey = typeof COMMON_CODE_GROUPS[keyof typeof COMMON_CODE_GROUPS]
