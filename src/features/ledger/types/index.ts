export type LedgerEntryType = 'expense' | 'income'

export interface LedgerEntry {
  id: number
  familyId: number
  title: string
  entryType: LedgerEntryType
  category?: string | null
  paymentMethod?: string | null
  memberName?: string | null
  amount: number
  transactionDate: string
  memo?: string | null
  createdAt: string
}

export interface LedgerSummary {
  expense: number
  income: number
  total: number
}

export interface LedgerPayload {
  title: string
  entryType: LedgerEntryType
  category: string | null
  paymentMethod: string | null
  memberName: string | null
  amount: number
  installmentMonths?: number
  transactionDate: string
  memo: string | null
}
