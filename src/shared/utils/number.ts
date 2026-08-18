export function normalizeAmount(value: string) {
  return Number(value.replace(/[^\d.-]/g, '')) || 0
}

export function formatNumberInput(value: number | null | undefined) {
  if (!value) return ''
  return Math.round(value).toLocaleString('ko-KR')
}
