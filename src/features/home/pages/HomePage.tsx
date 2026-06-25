import { useEffect, useMemo, useRef, useState } from 'react'
import { getLedgerSummary, listLedgerEntries } from '../../ledger/api/ledger'
import type { LedgerEntry, LedgerSummary } from '../../ledger/types'
import { listTrips, listTravelRecords } from '../../travel/api/travel'
import type { Trip } from '../../travel/types'
import { listBabies, listBabyRecords } from '../../baby/api/baby'
import { listFamilies, listFamilyMembers } from '../../family/api/familyGroup'
import { monthRange } from '../../../shared/utils/date'
import './home-page.css'

interface HomeState {
  ledgerEntries: LedgerEntry[]
  ledgerSummary: LedgerSummary
  trips: Trip[]
  tripTotal: number
  babyRecordCount: number
  familyCount: number
}

const emptySummary: LedgerSummary = { expense: 0, income: 0, total: 0 }

function money(value: number) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`
}

function safeDate(value?: string | null) {
  return value ? value.replace(/-/g, '.') : '-'
}

async function calculateTripTotal(trips: Trip[]) {
  const totals = await Promise.all(
    trips.slice(0, 30).map(async (trip) => {
      const records = await listTravelRecords(trip.id)
      return records.reduce((sum, record) => sum + Number(record.amount || 0), 0)
    }),
  )
  return totals.reduce((sum, value) => sum + value, 0)
}

async function countMonthlyBabyRecords(startDate: string, endDate: string) {
  const babies = await listBabies()
  const counts = await Promise.all(
    babies.slice(0, 20).map(async (baby) => {
      const records = await listBabyRecords(baby.id, startDate, endDate)
      return records.length
    }),
  )
  return counts.reduce((sum, value) => sum + value, 0)
}

async function countFamilyMembers() {
  const families = await listFamilies()
  const family = families[0]
  if (!family) return 0
  const members = await listFamilyMembers(family.id)
  return members.length
}

export default function HomePage() {
  const range = useMemo(() => monthRange(new Date()), [])
  const [state, setState] = useState<HomeState>({
    ledgerEntries: [],
    ledgerSummary: emptySummary,
    trips: [],
    tripTotal: 0,
    babyRecordCount: 0,
    familyCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const requestSeq = useRef(0)

  useEffect(() => {
    let alive = true
    const requestId = requestSeq.current + 1
    requestSeq.current = requestId
    setLoading(true)
    setMessage('')
    const loadingTimer = window.setTimeout(() => {
      if (!alive || requestSeq.current !== requestId) return
      setLoading(false)
      setMessage('홈 데이터를 불러오지 못했습니다. 화면을 다시 열면 자동으로 재시도합니다.')
    }, 15000)

    async function load() {
      try {
        const [ledgerSummary, ledgerEntries, trips, babyRecordCount, familyCount] = await Promise.all([
          getLedgerSummary(range.startDate, range.endDate),
          listLedgerEntries(range.startDate, range.endDate),
          listTrips(),
          countMonthlyBabyRecords(range.startDate, range.endDate),
          countFamilyMembers(),
        ])
        const tripTotal = await calculateTripTotal(trips)
        if (!alive || requestSeq.current !== requestId) return
        setState({
          ledgerSummary,
          ledgerEntries,
          trips,
          tripTotal,
          babyRecordCount,
          familyCount,
        })
      } catch (error) {
        if (!alive || requestSeq.current !== requestId) return
        setMessage(error instanceof Error ? error.message : '홈 데이터를 불러오지 못했습니다.')
      } finally {
        if (alive && requestSeq.current === requestId) {
          window.clearTimeout(loadingTimer)
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      alive = false
      window.clearTimeout(loadingTimer)
    }
  }, [range.endDate, range.startDate])

  useEffect(() => {
    function refreshAfterRestore() {
      if (document.visibilityState === 'hidden') return
      requestSeq.current += 1
      setLoading(false)
    }

    window.addEventListener('pageshow', refreshAfterRestore)
    window.addEventListener('focus', refreshAfterRestore)
    document.addEventListener('visibilitychange', refreshAfterRestore)
    return () => {
      window.removeEventListener('pageshow', refreshAfterRestore)
      window.removeEventListener('focus', refreshAfterRestore)
      document.removeEventListener('visibilitychange', refreshAfterRestore)
    }
  }, [])

  return (
    <section className="fp-home">
      {loading ? <div className="fp-loading-blocker">데이터 불러오는 중</div> : null}
      <div className="fp-home-summary">
        <article>
          <span>이번 달 지출</span>
          <strong className="expense">{money(state.ledgerSummary.expense)}</strong>
        </article>
        <article>
          <span>여행 누적</span>
          <strong className="income">{money(state.tripTotal)}</strong>
        </article>
        <article>
          <span>육아 기록</span>
          <strong className="primary">{state.babyRecordCount.toLocaleString('ko-KR')}개</strong>
        </article>
        <article>
          <span>가족 멤버</span>
          <strong>{state.familyCount.toLocaleString('ko-KR')}명</strong>
        </article>
      </div>

      {message ? <p className="fp-message">{message}</p> : null}

      <section className="fp-card fp-home-panel fp-home-ledger-panel">
        <header>
          <h2>최근 가계부</h2>
        </header>
        <div className="fp-home-ledger-list">
          {state.ledgerEntries.length ? state.ledgerEntries.slice(0, 5).map((item) => (
            <article key={item.id}>
              <div className="fp-home-ledger-main">
                <strong>{item.title}</strong>
                <p>{safeDate(item.transactionDate)} · {item.category || '-'} · {item.memberName || '-'}</p>
              </div>
              <div className="fp-home-ledger-amount">
                <span>{item.paymentMethod || '-'}</span>
                <b className={item.entryType === 'income' ? 'income' : 'expense'}>
                  {item.entryType === 'income' ? '+' : '-'}{money(item.amount)}
                </b>
              </div>
            </article>
          )) : <p className="fp-empty-text">최근 가계부 내역이 없습니다.</p>}
        </div>
      </section>
    </section>
  )
}
