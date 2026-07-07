import { useEffect, useMemo, useRef, useState } from 'react'
import { getLedgerSummary, listLedgerEntries } from '../../ledger/api/ledger'
import type { LedgerEntry, LedgerSummary } from '../../ledger/types'
import { listTrips, listTravelRecords } from '../../travel/api/travel'
import type { Trip } from '../../travel/types'
import { listBabies, listBabyRecords } from '../../baby/api/baby'
import { listFamilyMembers } from '../../family/api/familyGroup'
import { apiActionMessage, isAuthError } from '../../../shared/api/client'
import { getReadableFamilyId } from '../../../shared/api/family'
import { ToastMessage } from '../../../shared/components'
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

type HomeMenu = '가계부' | '여행' | '육아' | '가족그룹'

interface HomePageProps {
  onNavigate?: (menu: HomeMenu) => void
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
  const familyId = await getReadableFamilyId()
  if (!familyId) return 0
  const members = await listFamilyMembers(familyId)
  return members.length
}

export default function HomePage({ onNavigate }: HomePageProps) {
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
        if (isAuthError(error)) return
        setMessage(apiActionMessage(error, '홈 데이터를 불러오지 못했습니다.'))
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

  const recentLedgerEntries = state.ledgerEntries.slice(0, 3)
  const navigate = (menu: HomeMenu) => onNavigate?.(menu)

  return (
    <section className="fp-home">
      {loading ? <div className="fp-loading-blocker">데이터 불러오는 중</div> : null}
      <div className="fp-home-summary">
        <button className="expense fp-home-summary-card" type="button" onClick={() => navigate('가계부')}>
          <span>이번 달 지출</span>
          <strong>{money(state.ledgerSummary.expense)}</strong>
        </button>
        <button className="travel fp-home-summary-card" type="button" onClick={() => navigate('여행')}>
          <span>여행 누적</span>
          <strong>{money(state.tripTotal)}</strong>
        </button>
        <button className="baby fp-home-summary-card" type="button" onClick={() => navigate('육아')}>
          <span>육아 기록</span>
          <strong>{state.babyRecordCount.toLocaleString('ko-KR')}개</strong>
        </button>
        <button className="family fp-home-summary-card" type="button" onClick={() => navigate('가족그룹')}>
          <span>가족 멤버</span>
          <strong>{state.familyCount.toLocaleString('ko-KR')}명</strong>
        </button>
      </div>

      <ToastMessage message={message} onClose={() => setMessage('')} />

      <div className="fp-home-grid">
        <section className="fp-card fp-home-panel">
          <header>
            <div>
              <h2>최근 가계부</h2>
            </div>
          </header>
          <div className="fp-home-list">
            {recentLedgerEntries.length ? recentLedgerEntries.map((item) => (
              <button className="fp-home-list-item" key={item.id} type="button" onClick={() => navigate('가계부')}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{safeDate(item.transactionDate)} · {item.category || '-'}{item.memberName ? ` · ${item.memberName}` : ''}</p>
                  {item.paymentMethod ? <p>{item.paymentMethod}</p> : null}
                </div>
                <b className={item.entryType === 'income' ? 'income' : 'expense'}>
                  {item.entryType === 'income' ? '+' : '-'}{money(item.amount)}
                </b>
              </button>
            )) : <p className="fp-empty-text">최근 가계부 내역이 없습니다.</p>}
          </div>
        </section>
      </div>
    </section>
  )
}
