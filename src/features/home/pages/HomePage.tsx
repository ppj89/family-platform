import { useEffect, useMemo, useRef, useState } from 'react'
import { listSchedules } from '../../calendar/api/schedules'
import type { ScheduleItem } from '../../calendar/types'
import { getLedgerSummary, listLedgerEntries } from '../../ledger/api/ledger'
import type { LedgerEntry, LedgerSummary } from '../../ledger/types'
import { listTrips, listTravelRecords } from '../../travel/api/travel'
import type { Trip } from '../../travel/types'
import { listBabies, listBabyRecords } from '../../baby/api/baby'
import { listDiaries } from '../../diary/api/diary'
import type { DiaryItem } from '../../diary/types'
import { listRestaurants } from '../../restaurant/api/restaurant'
import type { RestaurantItem } from '../../restaurant/types'
import { listFamilies, listFamilyMembers } from '../../family/api/familyGroup'
import { formatDateKey, monthRange, todayKey } from '../../../shared/utils/date'
import './home-page.css'

interface HomeState {
  schedules: ScheduleItem[]
  ledgerEntries: LedgerEntry[]
  ledgerSummary: LedgerSummary
  trips: Trip[]
  tripTotal: number
  babyRecordCount: number
  diaries: DiaryItem[]
  restaurants: RestaurantItem[]
  familyCount: number
}

const emptySummary: LedgerSummary = { expense: 0, income: 0, total: 0 }

function money(value: number) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`
}

function safeDate(value?: string | null) {
  return value ? value.replace(/-/g, '.') : '-'
}

function scheduleTime(item: ScheduleItem) {
  return item.scheduleTime ? item.scheduleTime.slice(0, 5) : '종일'
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
  const today = useMemo(() => todayKey(), [])
  const range = useMemo(() => monthRange(new Date()), [])
  const [state, setState] = useState<HomeState>({
    schedules: [],
    ledgerEntries: [],
    ledgerSummary: emptySummary,
    trips: [],
    tripTotal: 0,
    babyRecordCount: 0,
    diaries: [],
    restaurants: [],
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
        const [schedules, ledgerSummary, ledgerEntries, trips, babyRecordCount, diaries, restaurants, familyCount] = await Promise.all([
          listSchedules(today, today),
          getLedgerSummary(range.startDate, range.endDate),
          listLedgerEntries(range.startDate, range.endDate),
          listTrips(),
          countMonthlyBabyRecords(range.startDate, range.endDate),
          listDiaries(range.startDate, range.endDate),
          listRestaurants(),
          countFamilyMembers(),
        ])
        const tripTotal = await calculateTripTotal(trips)
        if (!alive || requestSeq.current !== requestId) return
        setState({
          schedules,
          ledgerSummary,
          ledgerEntries,
          trips,
          tripTotal,
          babyRecordCount,
          diaries,
          restaurants,
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
  }, [range.endDate, range.startDate, today])

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

  const todayScheduleLabel = `${safeDate(today)} 오늘`
  const latestDiaries = state.diaries.slice(0, 3)
  const latestRestaurants = state.restaurants.slice(0, 3)

  return (
    <section className="fp-home">
      {loading ? <div className="fp-loading-blocker">데이터 불러오는 중</div> : null}
      <div className="fp-home-summary">
        <article>
          <span>이번 달 지출</span>
          <strong>{money(state.ledgerSummary.expense)}</strong>
        </article>
        <article>
          <span>여행 사용금액</span>
          <strong>{money(state.tripTotal)}</strong>
        </article>
        <article>
          <span>육아 기록</span>
          <strong>{state.babyRecordCount.toLocaleString('ko-KR')}건</strong>
        </article>
        <article>
          <span>가족 구성원</span>
          <strong>{state.familyCount.toLocaleString('ko-KR')}명</strong>
        </article>
      </div>

      {message ? <p className="fp-message">{message}</p> : null}

      <div className="fp-home-grid">
        <section className="fp-card fp-home-panel">
          <header>
            <div>
              <h2>오늘 일정</h2>
              <p>{todayScheduleLabel}</p>
            </div>
            <span>{state.schedules.length}건</span>
          </header>
          <div className="fp-home-list">
            {state.schedules.length ? state.schedules.slice(0, 5).map((item) => (
              <article key={item.id}>
                <b>{scheduleTime(item)}</b>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.category || '일정'}{item.memberName ? ` · ${item.memberName}` : ''}</p>
                </div>
              </article>
            )) : <p className="fp-empty-text">오늘 등록된 일정이 없습니다.</p>}
          </div>
        </section>

        <section className="fp-card fp-home-panel">
          <header>
            <div>
              <h2>최근 가계부</h2>
              <p>{safeDate(range.startDate)} ~ {safeDate(range.endDate)}</p>
            </div>
            <span>{state.ledgerEntries.length}건</span>
          </header>
          <div className="fp-home-list">
            {state.ledgerEntries.length ? state.ledgerEntries.slice(0, 5).map((item) => (
              <article key={item.id}>
                <b className={item.entryType === 'income' ? 'income' : 'expense'}>{item.entryType === 'income' ? '+' : '-'}</b>
                <div>
                  <strong>{item.title}</strong>
                  <p>{safeDate(item.transactionDate)} · {item.category || '-'} · {money(item.amount)}</p>
                </div>
              </article>
            )) : <p className="fp-empty-text">최근 가계부 내역이 없습니다.</p>}
          </div>
        </section>

        <section className="fp-card fp-home-panel">
          <header>
            <div>
              <h2>여행</h2>
              <p>큰 여행 목록 기준</p>
            </div>
            <span>{state.trips.length}건</span>
          </header>
          <div className="fp-home-list">
            {state.trips.length ? state.trips.slice(0, 4).map((trip) => (
              <article key={trip.id}>
                <b>여행</b>
                <div>
                  <strong>{trip.title}</strong>
                  <p>{safeDate(trip.startDate)}{trip.endDate && trip.endDate !== trip.startDate ? ` ~ ${safeDate(trip.endDate)}` : ''}</p>
                </div>
              </article>
            )) : <p className="fp-empty-text">등록된 여행이 없습니다.</p>}
          </div>
        </section>

        <section className="fp-card fp-home-panel">
          <header>
            <div>
              <h2>최근 기록</h2>
              <p>일기와 맛집</p>
            </div>
            <span>{latestDiaries.length + latestRestaurants.length}건</span>
          </header>
          <div className="fp-home-compact">
            <div>
              <strong>일기</strong>
              {latestDiaries.length ? latestDiaries.map((item) => (
                <p key={item.id}>{safeDate(item.diaryDate)} · {item.title}</p>
              )) : <p>최근 일기가 없습니다.</p>}
            </div>
            <div>
              <strong>맛집</strong>
              {latestRestaurants.length ? latestRestaurants.map((item) => (
                <p key={item.id}>{safeDate(item.visitDate)} · {item.name}</p>
              )) : <p>최근 맛집이 없습니다.</p>}
            </div>
          </div>
        </section>
      </div>
      <small className="fp-home-updated">기준일 {formatDateKey(new Date())}</small>
    </section>
  )
}
