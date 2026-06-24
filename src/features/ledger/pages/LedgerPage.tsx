import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import { ConfirmDialog } from '../../../shared/components'
import { formatKoreanDate, monthInputValue, monthRange, todayKey } from '../../../shared/utils/date'
import { createLedgerEntry, deleteLedgerEntry, getLedgerSummary, listLedgerEntries, updateLedgerEntry } from '../api/ledger'
import type { LedgerEntry, LedgerPayload, LedgerSummary } from '../types'
import './ledger-page.css'

const categories = ['식비', '교통', '생활', '의료', '교육', '여행', '기타']
const paymentMethods = ['카드', '현금', '계좌이체', '간편결제', '기타']

const emptyPayload = (): LedgerPayload => ({
  title: '',
  entryType: 'expense',
  category: '식비',
  paymentMethod: '카드',
  memberName: '',
  amount: 0,
  transactionDate: todayKey(),
  memo: '',
})

const emptySummary: LedgerSummary = { expense: 0, income: 0, total: 0 }

function money(value: number) {
  return `${Math.round(value || 0).toLocaleString('ko-KR')}원`
}

function normalizeAmount(value: string) {
  return Number(value.replace(/[^\d.-]/g, '')) || 0
}

function sortEntries(items: LedgerEntry[]) {
  return [...items].sort((a, b) => `${b.transactionDate} ${b.createdAt}`.localeCompare(`${a.transactionDate} ${a.createdAt}`))
}

export default function LedgerPage() {
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [summary, setSummary] = useState<LedgerSummary>(emptySummary)
  const [form, setForm] = useState<LedgerPayload>(() => emptyPayload())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState<'save' | 'delete' | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LedgerEntry | null>(null)

  const range = useMemo(() => monthRange(monthDate), [monthDate])
  const sortedEntries = useMemo(() => sortEntries(entries), [entries])

  async function reloadLedger() {
    setLoading(true)
    setMessage('')
    try {
      const [nextSummary, nextEntries] = await Promise.all([
        getLedgerSummary(range.startDate, range.endDate),
        listLedgerEntries(range.startDate, range.endDate),
      ])
      setSummary(nextSummary)
      setEntries(sortEntries(nextEntries))
    } catch (error) {
      setMessage(apiActionMessage(error, '가계부 내역을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadLedger()
  }, [range.startDate, range.endDate])

  function startEdit(item: LedgerEntry) {
    setEditingId(item.id)
    setForm({
      title: item.title,
      entryType: item.entryType,
      category: item.category || '기타',
      paymentMethod: item.paymentMethod || '기타',
      memberName: item.memberName || '',
      amount: item.amount,
      transactionDate: item.transactionDate,
      memo: item.memo || '',
    })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyPayload())
  }

  function validateForm() {
    if (!form.title.trim()) return '내용을 입력해주세요.'
    if (!form.transactionDate) return '거래일을 선택해주세요.'
    if (!form.amount) return '금액을 입력해주세요.'
    return ''
  }

  function requestSave(event: FormEvent) {
    event.preventDefault()
    const validation = validateForm()
    if (validation) {
      setMessage(validation)
      return
    }
    setConfirmAction('save')
  }

  async function confirmSave() {
    setLoading(true)
    setMessage('')
    try {
      const payload = { ...form, title: form.title.trim(), memberName: form.memberName?.trim() || null, memo: form.memo?.trim() || null }
      if (editingId) await updateLedgerEntry(editingId, payload)
      else await createLedgerEntry(payload)
      resetForm()
      await reloadLedger()
      setMessage(editingId ? '가계부 내역을 수정했습니다.' : '가계부 내역을 추가했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, editingId ? '가계부 수정에 실패했습니다.' : '가계부 추가에 실패했습니다.'))
    } finally {
      setConfirmAction(null)
      setLoading(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setLoading(true)
    setMessage('')
    try {
      await deleteLedgerEntry(pendingDelete.id)
      if (editingId === pendingDelete.id) resetForm()
      await reloadLedger()
      setMessage('가계부 내역을 삭제했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '가계부 삭제에 실패했습니다.'))
    } finally {
      setPendingDelete(null)
      setConfirmAction(null)
      setLoading(false)
    }
  }

  return (
    <section className="fp-card fp-ledger">
      {loading ? <div className="fp-loading-blocker">처리 중</div> : null}
      <header className="fp-ledger-header">
        <div>
          <h2>가계부</h2>
          <p>{range.startDate} ~ {range.endDate}</p>
        </div>
        <label className="fp-field fp-month-field">
          조회 월
          <input
            type="month"
            value={monthInputValue(monthDate)}
            onChange={(event) => setMonthDate(new Date(`${event.target.value}-01T00:00:00`))}
          />
        </label>
      </header>

      <div className="fp-ledger-summary" aria-label="가계부 요약">
        <article>
          <span>지출</span>
          <strong className="expense">{money(summary.expense)}</strong>
        </article>
        <article>
          <span>수입</span>
          <strong className="income">{money(summary.income)}</strong>
        </article>
        <article>
          <span>합계</span>
          <strong className={summary.total < 0 ? 'expense' : 'income'}>{money(summary.total)}</strong>
        </article>
      </div>

      {message ? <p className="fp-message">{message}</p> : null}

      <div className="fp-ledger-layout">
        <section className="fp-ledger-list" aria-label="가계부 목록">
          {sortedEntries.length ? sortedEntries.map((item) => (
            <article className="fp-ledger-row" key={item.id}>
              <button type="button" className="fp-ledger-row-main" onClick={() => startEdit(item)}>
                <strong>{item.title}</strong>
                <span>{formatKoreanDate(item.transactionDate)} · {item.category || '-'} · {item.paymentMethod || '-'}</span>
              </button>
              <b className={item.entryType}>{item.entryType === 'expense' ? '-' : '+'}{money(item.amount)}</b>
              <div className="fp-row-actions">
                <button type="button" onClick={() => startEdit(item)}>수정</button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setPendingDelete(item)
                    setConfirmAction('delete')
                  }}
                >
                  삭제
                </button>
              </div>
            </article>
          )) : <p className="fp-empty-text">해당 월의 가계부 내역이 없습니다.</p>}
        </section>

        <form className="fp-ledger-form" onSubmit={requestSave}>
          <header>
            <h3>{editingId ? '가계부 수정' : '가계부 추가'}</h3>
            {editingId ? <button className="fp-button fp-button-muted" type="button" onClick={resetForm}>신규 입력</button> : null}
          </header>
          <div className="fp-form-grid ledger-form-grid">
            <label className="fp-field span-2">
              내용 *
              <input value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} />
            </label>
            <label className="fp-field">
              구분 *
              <select value={form.entryType} onChange={(event) => setForm((value) => ({ ...value, entryType: event.target.value as LedgerPayload['entryType'] }))}>
                <option value="expense">지출</option>
                <option value="income">수입</option>
              </select>
            </label>
            <label className="fp-field">
              금액 *
              <input
                inputMode="numeric"
                value={form.amount ? form.amount.toLocaleString('ko-KR') : ''}
                onChange={(event) => setForm((value) => ({ ...value, amount: normalizeAmount(event.target.value) }))}
              />
            </label>
            <label className="fp-field">
              거래일 *
              <input type="date" value={form.transactionDate} onChange={(event) => setForm((value) => ({ ...value, transactionDate: event.target.value }))} />
            </label>
            <label className="fp-field">
              카테고리
              <select value={form.category || ''} onChange={(event) => setForm((value) => ({ ...value, category: event.target.value || null }))}>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="fp-field">
              결제수단
              <select value={form.paymentMethod || ''} onChange={(event) => setForm((value) => ({ ...value, paymentMethod: event.target.value || null }))}>
                {paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="fp-field">
              사용자
              <input value={form.memberName || ''} onChange={(event) => setForm((value) => ({ ...value, memberName: event.target.value }))} />
            </label>
            <label className="fp-field span-2">
              메모
              <textarea value={form.memo || ''} onChange={(event) => setForm((value) => ({ ...value, memo: event.target.value }))} />
            </label>
          </div>
          <button className="fp-button fp-button-primary" type="submit">{editingId ? '저장' : '추가'}</button>
        </form>
      </div>

      {confirmAction === 'save' ? (
        <ConfirmDialog
          title={editingId ? '가계부 수정' : '가계부 추가'}
          body={editingId ? '가계부 내역을 수정할까요?' : '가계부 내역을 추가할까요?'}
          confirmLabel={editingId ? '저장' : '추가'}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmSave}
        />
      ) : null}
      {confirmAction === 'delete' && pendingDelete ? (
        <ConfirmDialog
          danger
          title="가계부 삭제"
          body={`"${pendingDelete.title}" 내역을 삭제할까요?`}
          confirmLabel="삭제"
          onCancel={() => {
            setPendingDelete(null)
            setConfirmAction(null)
          }}
          onConfirm={confirmDelete}
        />
      ) : null}
    </section>
  )
}
