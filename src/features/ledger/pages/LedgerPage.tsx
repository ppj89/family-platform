import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { apiActionMessage, isAuthError } from '../../../shared/api/client'
import { ConfirmDialog, DatePickerField } from '../../../shared/components'
import { COMMON_CODE_GROUPS, FAMILY_MEMBER_OPTIONS, LEDGER_CATEGORIES, LEDGER_ENTRY_TYPE_OPTIONS, LEDGER_PAYMENT_METHODS } from '../../../shared/constants/commonCodes'
import { useCommonCodeOptions } from '../../../shared/hooks'
import { monthRange, parseDateKey, todayKey } from '../../../shared/utils/date'
import { formatNumberInput, normalizeAmount } from '../../../shared/utils/number'
import { createLedgerEntry, deleteLedgerEntry, getLedgerSummary, listLedgerEntries, updateLedgerEntry } from '../api/ledger'
import type { LedgerEntry, LedgerPayload, LedgerSummary } from '../types'
import './ledger-page.css'

type LedgerQueryMode = 'month' | 'period'
type ConfirmState = 'save' | 'delete' | null
type LedgerSelectOption = { label: string; value: string }

const weekdays = ['일', '월', '화', '수', '목', '금', '토']

const emptyPayload = (): LedgerPayload => ({
  title: '',
  entryType: 'expense',
  category: '식비',
  paymentMethod: '카드',
  memberName: '아빠',
  amount: 0,
  transactionDate: todayKey(),
  memo: '',
})

const emptySummary: LedgerSummary = { expense: 0, income: 0, total: 0 }

function money(value: number) {
  return `${Math.round(value || 0).toLocaleString('ko-KR')}원`
}

function signedMoney(item: LedgerEntry) {
  return `${item.entryType === 'income' ? '+' : '-'}${money(item.amount)}`
}

function sortEntries(items: LedgerEntry[]) {
  return [...items].sort((a, b) => `${b.transactionDate} ${b.createdAt}`.localeCompare(`${a.transactionDate} ${a.createdAt}`))
}

function formatDisplayDate(value: string) {
  const date = parseDateKey(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} (${weekdays[date.getDay()]})`
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-')
  return `${year}년 ${Number(month)}월`
}

function groupEntriesByDate(items: LedgerEntry[]) {
  return sortEntries(items).reduce<Array<{ date: string; items: LedgerEntry[] }>>((groups, item) => {
    const found = groups.find((group) => group.date === item.transactionDate)
    if (found) found.items.push(item)
    else groups.push({ date: item.transactionDate, items: [item] })
    return groups
  }, [])
}

function parseSmsText(text: string) {
  const amountMatch = text.match(/([0-9][0-9,]*)\s*원?/)
  const amount = amountMatch ? normalizeAmount(amountMatch[1]) : 0
  const normalized = text
    .replace(/\[[^\]]+]/g, ' ')
    .replace(/승인|이용|사용|일시불|체크|카드|원/g, ' ')
    .replace(/[\d,:\-./]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const title = normalized.split(' ').find((part) => part.length >= 2) || ''
  const isIncome = /입금|급여|환급|수입/.test(text)
  return { amount, title, entryType: isIncome ? 'income' : 'expense' as LedgerPayload['entryType'] }
}

function LedgerCustomSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: LedgerSelectOption[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLLabelElement>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    function closeOnOutside(event: MouseEvent | FocusEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('focusin', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('focusin', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <label className={`fp-field ledger-custom-select custom-select-field ${open ? 'open' : ''}`} ref={rootRef}>
      <span>{label}</span>
      <div className={`custom-select${open ? ' open' : ''}`}>
        <button className={`custom-select-trigger${open ? ' open' : ''}`} type="button" onClick={() => setOpen((current) => !current)}>
          <span>{selected?.label || '선택'}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
        <div className="custom-select-list" hidden={!open}>
          {options.map((option) => (
            <button
              className={option.value === selected?.value ? 'selected' : ''}
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </label>
  )
}

export default function LedgerPage() {
  const today = todayKey()
  const currentMonth = today.slice(0, 7)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [queryMode, setQueryMode] = useState<LedgerQueryMode>('month')
  const [monthValue, setMonthValue] = useState(currentMonth)
  const [periodStart, setPeriodStart] = useState(`${currentMonth}-01`)
  const [periodEnd, setPeriodEnd] = useState(today)
  const [isSmsParserOpen, setIsSmsParserOpen] = useState(false)
  const [smsText, setSmsText] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [summary, setSummary] = useState<LedgerSummary>(emptySummary)
  const [form, setForm] = useState<LedgerPayload>(() => emptyPayload())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmState>(null)
  const [pendingDelete, setPendingDelete] = useState<LedgerEntry | null>(null)
  const ledgerCategoryOptions = useCommonCodeOptions(COMMON_CODE_GROUPS.ledgerCategories, LEDGER_CATEGORIES)
  const ledgerPaymentMethodOptions = useCommonCodeOptions(COMMON_CODE_GROUPS.ledgerPaymentMethods, LEDGER_PAYMENT_METHODS)
  const familyMemberOptions = useCommonCodeOptions(COMMON_CODE_GROUPS.familyMembers, FAMILY_MEMBER_OPTIONS)

  const range = useMemo(() => {
    if (queryMode === 'period') return { startDate: periodStart, endDate: periodEnd }
    return monthRange(parseDateKey(`${monthValue}-01`))
  }, [monthValue, periodEnd, periodStart, queryMode])
  const groupedEntries = useMemo(() => groupEntriesByDate(entries), [entries])

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
      if (isAuthError(error)) {
        setSummary(emptySummary)
        setEntries([])
        return
      }
      setMessage(apiActionMessage(error, '가계부 내역을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadLedger()
  }, [range.startDate, range.endDate])

  function focusForm() {
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      titleInputRef.current?.focus({ preventScroll: true })
    }, 0)
  }

  function startEdit(item: LedgerEntry) {
    setEditingId(item.id)
    setSelectedEntry(null)
    setForm({
      title: item.title,
      entryType: item.entryType,
      category: item.category || ledgerCategoryOptions[0] || '기타',
      paymentMethod: item.paymentMethod || ledgerPaymentMethodOptions[0] || '기타',
      memberName: item.memberName || familyMemberOptions[0] || '아빠',
      amount: item.amount,
      transactionDate: item.transactionDate,
      memo: item.memo || '',
    })
    focusForm()
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
      const payload = {
        ...form,
        title: form.title.trim(),
        category: form.category || null,
        paymentMethod: form.paymentMethod || null,
        memberName: form.memberName?.trim() || null,
        memo: form.memo?.trim() || null,
      }
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
      if (selectedEntry?.id === pendingDelete.id) setSelectedEntry(null)
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

  function requestDelete(item: LedgerEntry) {
    setPendingDelete(item)
    setConfirmAction('delete')
  }

  function autofillFromSms() {
    const parsed = parseSmsText(smsText)
    setForm((current) => ({
      ...current,
      title: parsed.title || current.title,
      amount: parsed.amount || current.amount,
      entryType: parsed.entryType,
      paymentMethod: current.paymentMethod || ledgerPaymentMethodOptions[0] || '카드',
    }))
    if (!parsed.title && !parsed.amount) {
      setSmsMessage('추출할 금액이나 가맹점 후보를 찾지 못했습니다.')
      return
    }
    setSmsMessage('')
    setMessage('문자 내용을 기준으로 입력값을 채웠습니다.')
    setIsSmsParserOpen(false)
    focusForm()
  }

  function openSmsParser() {
    setSmsMessage('')
    setIsSmsParserOpen(true)
  }

  return (
    <>
      <section className="fp-ledger content-grid">
        {loading ? <div className="fp-loading-blocker">처리 중</div> : null}

        <article className="panel wide fp-ledger-panel">
          <header className="panel-header fp-ledger-section-header">
            <h2>가계부 조회</h2>
          </header>

          <section className="filter-panel fp-ledger-filter">
            <div className={`fp-ledger-query-row ${queryMode === 'period' ? 'period-mode' : 'month-mode'}`}>
              <div className="fp-ledger-query-tabs" role="tablist" aria-label="가계부 조회 방식">
                <button className={queryMode === 'month' ? 'active' : ''} type="button" onClick={() => setQueryMode('month')}>월별</button>
                <button className={queryMode === 'period' ? 'active' : ''} type="button" onClick={() => setQueryMode('period')}>기간별</button>
              </div>
              {queryMode === 'month' ? (
                <DatePickerField
                  className="fp-ledger-month-picker"
                  displayValue={formatMonthLabel(monthValue)}
                  label="조회 월"
                  mode="month"
                  showCalendarIcon
                  value={monthValue}
                  onChange={setMonthValue}
                />
              ) : (
                <div className="fp-ledger-period-fields">
                  <DatePickerField label="시작일" value={periodStart} onChange={setPeriodStart} />
                  <DatePickerField label="종료일" value={periodEnd} onChange={setPeriodEnd} />
                </div>
              )}
            </div>
          </section>

          <div className="ledger-summary" aria-label="가계부 요약">
            <article className="metric coral">
              <span>총 지출</span>
              <strong>{money(summary.expense)}</strong>
            </article>
            <article className="metric green">
              <span>총 수입</span>
              <strong>{money(summary.income)}</strong>
            </article>
            <article className={`metric ${summary.total < 0 ? 'coral' : 'blue'}`}>
              <span>합계</span>
              <strong>{money(summary.total)}</strong>
            </article>
          </div>

          <div className="fp-ledger-auto-action">
            <button type="button" onClick={openSmsParser}>카드 붙여넣기</button>
          </div>

          {message ? <p className="fp-message">{message}</p> : null}

          <section className="daily-ledger api-ledger-list-host" aria-label="가계부 내역">
            {groupedEntries.length ? groupedEntries.map((group) => (
              <section className="api-ledger-day" key={group.date}>
                <header>
                  <strong>{formatDisplayDate(group.date)}</strong>
                </header>
                {group.items.map((item) => (
                  <article className="ledger-row api-ledger-row" key={item.id}>
                    <button type="button" className="ledger-row-main" onClick={() => setSelectedEntry(item)}>
                      <strong>{item.title}</strong>
                      <span>{item.category || '-'} · {item.memberName || '-'} · {item.paymentMethod || '-'}</span>
                    </button>
                    <b className={item.entryType}>{signedMoney(item)}</b>
                    <div className="ledger-row-actions">
                      <button type="button" onClick={() => startEdit(item)}>수정</button>
                      <button type="button" className="danger-button" onClick={() => requestDelete(item)}>삭제</button>
                    </div>
                  </article>
                ))}
              </section>
            )) : <p className="fp-empty-text">해당 기간의 가계부 내역이 없습니다.</p>}
          </section>
        </article>

        <form className="panel entry-panel fp-ledger-entry-panel ledger-form" ref={formRef} onSubmit={requestSave}>
          <header className="panel-header">
            <h2>{editingId ? '가계부 수정' : '가계부 입력'}</h2>
            {editingId ? <button className="fp-button fp-button-muted" type="button" onClick={resetForm}>취소</button> : null}
          </header>

          <div className="ledger-form-grid">
            <label className="span-2">
              <span>내용 <em className="fp-required-mark">*</em></span>
              <input ref={titleInputRef} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} />
            </label>
            <label>
              <span>금액 <em className="fp-required-mark">*</em></span>
              <input
                inputMode="numeric"
                value={formatNumberInput(form.amount)}
                onChange={(event) => setForm((value) => ({ ...value, amount: normalizeAmount(event.target.value) }))}
              />
            </label>
            <DatePickerField
              className="fp-ledger-form-date"
              label="날짜"
              required
              value={form.transactionDate}
              onChange={(value) => setForm((current) => ({ ...current, transactionDate: value }))}
            />
            <LedgerCustomSelect
              label="구분"
              options={[...LEDGER_ENTRY_TYPE_OPTIONS]}
              value={form.entryType}
              onChange={(value) => setForm((current) => ({ ...current, entryType: value as LedgerPayload['entryType'] }))}
            />
            <LedgerCustomSelect
              label="카테고리"
              options={ledgerCategoryOptions.map((item) => ({ label: item, value: item }))}
              value={form.category || ''}
              onChange={(value) => setForm((current) => ({ ...current, category: value || null }))}
            />
            <LedgerCustomSelect
              label="결제수단"
              options={ledgerPaymentMethodOptions.map((item) => ({ label: item, value: item }))}
              value={form.paymentMethod || ''}
              onChange={(value) => setForm((current) => ({ ...current, paymentMethod: value || null }))}
            />
            <LedgerCustomSelect
              label="사용자"
              options={familyMemberOptions.map((item) => ({ label: item, value: item }))}
              value={form.memberName || ''}
              onChange={(value) => setForm((current) => ({ ...current, memberName: value || null }))}
            />
            <label className="span-2">
              <span>메모</span>
              <textarea value={form.memo || ''} onChange={(event) => setForm((value) => ({ ...value, memo: event.target.value }))} />
            </label>
          </div>
          <button className="fp-button fp-button-primary submit-action" type="submit">{editingId ? '저장' : '추가'}</button>
        </form>
      </section>

      {selectedEntry ? (
        <div className="patch-ledger-detail-backdrop" role="presentation" onClick={() => setSelectedEntry(null)}>
          <section className="patch-ledger-detail-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="dialog-close" aria-label="닫기" onClick={() => setSelectedEntry(null)}>×</button>
            <span className="ledger-detail-chip">{selectedEntry.entryType === 'income' ? '수입' : '지출'}</span>
            <h2>{selectedEntry.title || '내역 없음'}</h2>
            <strong className={`ledger-detail-amount ${selectedEntry.entryType}`}>{signedMoney(selectedEntry)}</strong>
            <dl>
              <div><dt>거래일</dt><dd>{selectedEntry.transactionDate.replace(/-/g, '.')}</dd></div>
              <div><dt>카테고리</dt><dd>{selectedEntry.category || '-'}</dd></div>
              <div><dt>결제수단</dt><dd>{selectedEntry.paymentMethod || '-'}</dd></div>
              <div><dt>사용자</dt><dd>{selectedEntry.memberName || '-'}</dd></div>
            </dl>
            <p>{selectedEntry.memo || '메모가 없습니다.'}</p>
            <div className="ledger-detail-actions">
              <button type="button" className="edit-button" onClick={() => startEdit(selectedEntry)}>수정</button>
              <button type="button" className="danger-button" onClick={() => requestDelete(selectedEntry)}>삭제</button>
            </div>
          </section>
        </div>
      ) : null}

      {confirmAction === 'save' ? (
        <ConfirmDialog
          title={editingId ? '수정' : '저장'}
          body={editingId ? '가계부 내역을 수정하시겠습니까?' : '가계부 내역을 저장하시겠습니까?'}
          confirmLabel={editingId ? '수정' : '저장'}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmSave}
        />
      ) : null}
      {confirmAction === 'delete' && pendingDelete ? (
        <ConfirmDialog
          danger
          title="삭제"
          body="가계부 내역을 삭제하시겠습니까?"
          confirmLabel="삭제"
          onCancel={() => {
            setPendingDelete(null)
            setConfirmAction(null)
          }}
          onConfirm={confirmDelete}
        />
      ) : null}
      {isSmsParserOpen ? (
        <div className="fp-ledger-autofill-backdrop" role="presentation" onClick={() => setIsSmsParserOpen(false)}>
          <section
            className="fp-ledger-autofill-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fp-ledger-autofill-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2 id="fp-ledger-autofill-title">카드 붙여넣기</h2>
              <button type="button" aria-label="닫기" onClick={() => setIsSmsParserOpen(false)}>x</button>
            </header>
            <p className="fp-ledger-autofill-help">카드 문자나 앱 알림 내용을 붙여넣으면 금액과 가맹점 후보를 추출합니다.</p>
            <textarea
              aria-label="카드 문자 또는 앱 알림 내용"
              value={smsText}
              onChange={(event) => {
                setSmsText(event.target.value)
                setSmsMessage('')
              }}
              autoFocus
            />
            {smsMessage ? <p className="fp-ledger-autofill-message">{smsMessage}</p> : null}
            <div className="fp-ledger-autofill-actions">
              <button className="fp-button fp-button-muted" type="button" onClick={() => setIsSmsParserOpen(false)}>취소</button>
              <button className="fp-button fp-button-primary" type="button" onClick={autofillFromSms}>자동 입력</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
