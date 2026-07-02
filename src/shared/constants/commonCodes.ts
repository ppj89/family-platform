export const TRAVEL_COST_CATEGORIES = ['교통', '숙박', '식비', '입장료', '쇼핑', '기타'] as const

export type TravelCostCategory = typeof TRAVEL_COST_CATEGORIES[number]

export const LEDGER_ENTRY_TYPE_OPTIONS = [
  { label: '지출', value: 'expense' },
  { label: '수입', value: 'income' },
] as const

export const LEDGER_CATEGORIES = ['식비', '교통', '생활', '의료', '교육', '여행', '기타'] as const
export const LEDGER_PAYMENT_METHODS = ['카드', '현금', '계좌이체', '간편결제', '기타'] as const
export const FAMILY_MEMBER_OPTIONS = ['아빠', '엄마', '가족'] as const
