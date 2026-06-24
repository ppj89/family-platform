export const TRAVEL_COST_CATEGORIES = ['교통', '숙박', '식비', '입장료', '쇼핑', '기타'] as const

export type TravelCostCategory = typeof TRAVEL_COST_CATEGORIES[number]
