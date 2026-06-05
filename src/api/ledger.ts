import { apiRequest } from './client'

export type LedgerEntry = {
  id: number
  familyId: number
  title: string
  entryType: 'expense' | 'income'
  category?: string
  paymentMethod?: string
  memberName?: string
  amount: number
  transactionDate: string
  memo?: string
  createdAt: string
}

export type LedgerEntryPayload = Omit<LedgerEntry, 'id' | 'familyId' | 'createdAt'>

export type LedgerSummary = {
  expense: number
  income: number
  total: number
}

export function getLedgerEntries(startDate: string, endDate: string, familyId = 1) {
  return apiRequest<LedgerEntry[]>(`/ledger-entries?familyId=${familyId}&startDate=${startDate}&endDate=${endDate}`)
}

export function getLedgerSummary(startDate: string, endDate: string, familyId = 1) {
  return apiRequest<LedgerSummary>(`/ledger-entries/summary?familyId=${familyId}&startDate=${startDate}&endDate=${endDate}`)
}

export function createLedgerEntry(payload: LedgerEntryPayload, familyId = 1) {
  return apiRequest<LedgerEntry>(`/ledger-entries?familyId=${familyId}`, {
    method: 'POST',
    body: payload,
  })
}

export function updateLedgerEntry(entryId: number, payload: LedgerEntryPayload) {
  return apiRequest<LedgerEntry>(`/ledger-entries/${entryId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteLedgerEntry(entryId: number) {
  return apiRequest<void>(`/ledger-entries/${entryId}`, {
    method: 'DELETE',
  })
}
