import { apiRequest } from '../../../shared/api/client'
import { getReadableFamilyId } from '../../../shared/api/family'
import type { LedgerEntry, LedgerPayload, LedgerSummary } from '../types'

async function familyQuery() {
  const familyId = await getReadableFamilyId()
  return `familyId=${encodeURIComponent(familyId)}`
}

export async function listLedgerEntries(startDate: string, endDate: string) {
  const query = await familyQuery()
  return apiRequest<LedgerEntry[]>(`/ledger-entries?${query}&startDate=${startDate}&endDate=${endDate}`)
}

export async function getLedgerSummary(startDate: string, endDate: string) {
  const query = await familyQuery()
  return apiRequest<LedgerSummary>(`/ledger-entries/summary?${query}&startDate=${startDate}&endDate=${endDate}`)
}

export async function createLedgerEntry(payload: LedgerPayload) {
  const query = await familyQuery()
  return apiRequest<LedgerEntry>(`/ledger-entries?${query}`, { method: 'POST', body: payload })
}

export function updateLedgerEntry(id: number, payload: LedgerPayload) {
  return apiRequest<LedgerEntry>(`/ledger-entries/${id}`, { method: 'PUT', body: payload })
}

export function deleteLedgerEntry(id: number) {
  return apiRequest<null>(`/ledger-entries/${id}`, { method: 'DELETE' })
}
