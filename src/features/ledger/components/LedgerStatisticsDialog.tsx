import { useEffect, useMemo, useState } from 'react'
import { HiOutlineX } from 'react-icons/hi'
import { apiActionMessage, isAuthError } from '../../../shared/api/client'
import { DatePickerField } from '../../../shared/components'
import { monthRange, parseDateKey } from '../../../shared/utils/date'
import { listLedgerEntries } from '../api/ledger'
import type { LedgerEntry } from '../types'

type LedgerStatisticsTab = 'compare' | 'category'

interface LedgerStatisticsDialogProps {
  initialMonth: string
  isOpen: boolean
  onClose: () => void
}

const chartColors = ['#3182f6', '#16a394', '#f59f0b', '#ef5b6f', '#8b5cf6', '#0ea5a4', '#ec4899', '#64748b']

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split('-').map(Number)
  const date = new Date(year, month - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-')
  return `${year}년 ${Number(month)}월`
}

function money(value: number) {
  return `${Math.round(value || 0).toLocaleString('ko-KR')}원`
}

function expenseTotal(items: LedgerEntry[]) {
  return items.reduce((sum, item) => sum + (item.entryType === 'expense' ? item.amount : 0), 0)
}

function cumulativeDailyExpenses(items: LedgerEntry[], month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const dayCount = new Date(year, monthNumber, 0).getDate()
  const daily = Array.from({ length: dayCount }, () => 0)
  items.forEach((item) => {
    if (item.entryType !== 'expense' || !item.transactionDate.startsWith(month)) return
    const day = Number(item.transactionDate.slice(-2))
    if (day >= 1 && day <= dayCount) daily[day - 1] += item.amount
  })
  return daily.reduce<number[]>((result, amount) => {
    result.push((result[result.length - 1] ?? 0) + amount)
    return result
  }, [])
}

function dailyExpense(items: LedgerEntry[], month: string, day: number) {
  const dateKey = `${month}-${String(day).padStart(2, '0')}`
  return items.reduce((sum, item) => sum + (item.entryType === 'expense' && item.transactionDate === dateKey ? item.amount : 0), 0)
}

const chartWidth = 300
const chartHeight = 138
const chartPadding = 12

function chartCoordinate(values: number[], index: number, maximum: number) {
  const divisor = Math.max(values.length - 1, 1)
  return {
    x: chartPadding + ((chartWidth - chartPadding * 2) * index) / divisor,
    y: chartHeight - chartPadding - ((chartHeight - chartPadding * 2) * values[index]) / Math.max(maximum, 1),
  }
}

function chartPoints(values: number[], maximum: number) {
  return values
    .map((_, index) => {
      const { x, y } = chartCoordinate(values, index, maximum)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export function LedgerStatisticsDialog({ initialMonth, isOpen, onClose }: LedgerStatisticsDialogProps) {
  const [tab, setTab] = useState<LedgerStatisticsTab>('compare')
  const [baseMonth, setBaseMonth] = useState(initialMonth)
  const [compareMonth, setCompareMonth] = useState(shiftMonth(initialMonth, -1))
  const [baseEntries, setBaseEntries] = useState<LedgerEntry[]>([])
  const [compareEntries, setCompareEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null)
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setBaseMonth(initialMonth)
    setCompareMonth(shiftMonth(initialMonth, -1))
    setTab('compare')
    setError('')
    setSelectedDayIndex(null)
    setSelectedCategoryName(null)
  }, [initialMonth, isOpen])

  useEffect(() => {
    if (!isOpen) return
    let active = true
    const baseRange = monthRange(parseDateKey(`${baseMonth}-01`))
    const compareRange = monthRange(parseDateKey(`${compareMonth}-01`))

    async function loadStatistics() {
      setLoading(true)
      setError('')
      try {
        const [nextBaseEntries, nextCompareEntries] = await Promise.all([
          listLedgerEntries(baseRange.startDate, baseRange.endDate),
          listLedgerEntries(compareRange.startDate, compareRange.endDate),
        ])
        if (!active) return
        setBaseEntries(nextBaseEntries)
        setCompareEntries(nextCompareEntries)
      } catch (loadError) {
        if (!active || isAuthError(loadError)) return
        setError(apiActionMessage(loadError, '통계 데이터를 불러오지 못했습니다.'))
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadStatistics()
    return () => { active = false }
  }, [baseMonth, compareMonth, isOpen])

  const baseExpense = useMemo(() => expenseTotal(baseEntries), [baseEntries])
  const compareExpense = useMemo(() => expenseTotal(compareEntries), [compareEntries])
  const difference = baseExpense - compareExpense
  const baseDaily = useMemo(() => cumulativeDailyExpenses(baseEntries, baseMonth), [baseEntries, baseMonth])
  const compareDaily = useMemo(() => cumulativeDailyExpenses(compareEntries, compareMonth), [compareEntries, compareMonth])
  const baseChartMaximum = Math.max(...baseDaily, 1)
  const compareChartMaximum = Math.max(...compareDaily, 1)
  const chartDayCount = baseDaily.length
  const xAxisDays = Array.from(new Set([1, Math.ceil(chartDayCount * 0.25), Math.ceil(chartDayCount * 0.5), Math.ceil(chartDayCount * 0.75), chartDayCount]))
  const yAxisRates = [1, 0.75, 0.5, 0.25]
  const baseYAxisValues = yAxisRates.map((rate) => Math.round(baseChartMaximum * rate))
  const compareYAxisValues = yAxisRates.map((rate) => Math.round(compareChartMaximum * rate))
  const selectedIndex = selectedDayIndex ?? 0
  const selectedDay = selectedDayIndex === null ? null : selectedIndex + 1
  const selectedBaseDayExpense = selectedDay ? dailyExpense(baseEntries, baseMonth, selectedDay) : 0
  const selectedCompareDayExpense = selectedDay ? dailyExpense(compareEntries, compareMonth, selectedDay) : 0
  const selectedBaseCumulative = selectedDay ? baseDaily[selectedIndex] ?? 0 : 0
  const selectedCompareCumulative = selectedDay ? compareDaily[selectedIndex] ?? 0 : 0
  const selectedBaseCoordinate = selectedDay ? chartCoordinate(baseDaily, selectedIndex, baseChartMaximum) : null
  const selectedCompareCoordinate = selectedDay ? chartCoordinate(compareDaily, selectedIndex, compareChartMaximum) : null
  const selectedChartCoordinate = selectedBaseCoordinate ?? selectedCompareCoordinate
  const categories = useMemo(() => {
    const grouped = baseEntries
      .filter((item) => item.entryType === 'expense')
      .reduce<Record<string, number>>((result, item) => {
        const category = item.category || '기타'
        result[category] = (result[category] ?? 0) + item.amount
        return result
      }, {})
    return Object.entries(grouped)
      .map(([name, amount], index) => ({ name, amount, color: chartColors[index % chartColors.length] }))
      .sort((left, right) => right.amount - left.amount)
  }, [baseEntries])
  const categoryGradient = useMemo(() => {
    if (!categories.length || baseExpense <= 0) return '#edf1f5'
    let position = 0
    const segments = categories.map((category) => {
      const start = position
      position += (category.amount / baseExpense) * 100
      return `${category.color} ${start}% ${position}%`
    })
    return `conic-gradient(${segments.join(', ')})`
  }, [baseExpense, categories])
  const selectedCategory = categories.find((category) => category.name === selectedCategoryName) ?? null

  function selectCategoryFromChart(clientX: number, clientY: number, element: HTMLDivElement) {
    if (!categories.length || baseExpense <= 0) return
    const rect = element.getBoundingClientRect()
    const x = clientX - rect.left - rect.width / 2
    const y = clientY - rect.top - rect.height / 2
    const radius = Math.hypot(x, y)
    if (radius < Math.min(rect.width, rect.height) * 0.18) return
    const angle = (Math.atan2(y, x) * (180 / Math.PI) + 90 + 360) % 360
    let boundary = 0
    const selected = categories.find((category) => {
      boundary += (category.amount / baseExpense) * 360
      return angle <= boundary
    })
    if (selected) setSelectedCategoryName(selected.name)
  }

  if (!isOpen) return null

  return (
    <div className="patch-ledger-detail-backdrop fp-ledger-statistics-backdrop" role="presentation" onClick={onClose}>
      <section className="patch-ledger-detail-dialog fp-ledger-statistics-dialog" role="dialog" aria-modal="true" aria-labelledby="fp-ledger-statistics-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="dialog-close" aria-label="닫기" onClick={onClose}><HiOutlineX aria-hidden="true" /></button>
        <header className="fp-ledger-statistics-title-row"><p>한눈에 보는</p><h2 id="fp-ledger-statistics-title">지출 통계</h2></header>

        <div className="fp-ledger-statistics-tabs" role="tablist" aria-label="지출 통계 보기 방식">
          <button type="button" role="tab" aria-selected={tab === 'compare'} className={tab === 'compare' ? 'active' : ''} onClick={() => setTab('compare')}>전달 비교</button>
          <button type="button" role="tab" aria-selected={tab === 'category'} className={tab === 'category' ? 'active' : ''} onClick={() => setTab('category')}>지출 비중</button>
        </div>

        <div className="fp-ledger-statistics-month-fields">
          <DatePickerField label="기준 월" mode="month" value={baseMonth} displayValue={formatMonthLabel(baseMonth)} onChange={(value) => { setSelectedDayIndex(null); setBaseMonth(value || initialMonth) }} />
          <DatePickerField label="비교 월" mode="month" value={compareMonth} displayValue={formatMonthLabel(compareMonth)} onChange={(value) => { setSelectedDayIndex(null); setCompareMonth(value || shiftMonth(baseMonth, -1)) }} />
        </div>

        {loading ? <div className="fp-ledger-statistics-loading" aria-live="polite">통계 데이터를 불러오는 중입니다.</div> : null}
        {error ? <p className="fp-ledger-statistics-error">{error}</p> : null}
        {!loading && !error && tab === 'compare' ? (
          <section className="fp-ledger-statistics-content" role="tabpanel">
            <p className="fp-ledger-statistics-difference">{difference === 0 ? '비교 월과 지출 금액이 같습니다.' : <><strong className={difference > 0 ? 'more' : 'less'}>{money(Math.abs(difference))}</strong>{difference > 0 ? ' 더 썼어요.' : ' 덜 썼어요.'}</>}</p>
            <div className="fp-ledger-statistics-legend" aria-label="차트 범례"><span><i className="base" />{formatMonthLabel(baseMonth)}</span><span><i className="compare" />{formatMonthLabel(compareMonth)}</span></div>
            <div className="fp-ledger-statistics-line-chart" aria-label="일자별 누적 지출 차트">
              <div className="fp-ledger-statistics-chart-body">
                <div className="fp-ledger-statistics-y-axis compare-axis" aria-label={`${formatMonthLabel(compareMonth)} 금액 축`}>{compareYAxisValues.map((value) => <span key={value}>{money(value)}</span>)}</div>
                <div className="fp-ledger-statistics-chart-plot">
                  <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    role="img"
                    aria-label={`${formatMonthLabel(baseMonth)}와 ${formatMonthLabel(compareMonth)}의 누적 지출 비교`}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
                      setSelectedDayIndex(Math.round(ratio * Math.max(chartDayCount - 1, 0)))
                    }}
                  >
                    <line className="axis" x1={chartPadding} y1={chartHeight - chartPadding} x2={chartWidth - chartPadding} y2={chartHeight - chartPadding} />
                    {[0.25, 0.5, 0.75, 1].map((rate) => {
                      const y = chartHeight - chartPadding - ((chartHeight - chartPadding * 2) * rate)
                      return <line className="guide" key={rate} x1={chartPadding} y1={y} x2={chartWidth - chartPadding} y2={y} />
                    })}
                    <polyline className="compare-line" points={chartPoints(compareDaily, compareChartMaximum)} />
                    <polyline className="base-line" points={chartPoints(baseDaily, baseChartMaximum)} />
                    {selectedChartCoordinate ? <line className="selected-guide" x1={selectedChartCoordinate.x} y1={chartPadding} x2={selectedChartCoordinate.x} y2={chartHeight - chartPadding} /> : null}
                    {selectedCompareCoordinate ? <>
                      <circle className="selected-point-halo compare-halo" cx={selectedCompareCoordinate.x} cy={selectedCompareCoordinate.y} r="10" />
                      <circle className="selected-point compare-point" cx={selectedCompareCoordinate.x} cy={selectedCompareCoordinate.y} r="5.5" />
                    </> : null}
                    {selectedBaseCoordinate ? <>
                      <circle className="selected-point-halo base-halo" cx={selectedBaseCoordinate.x} cy={selectedBaseCoordinate.y} r="10" />
                      <circle className="selected-point base-point" cx={selectedBaseCoordinate.x} cy={selectedBaseCoordinate.y} r="5.5" />
                    </> : null}
                  </svg>
                  <div className="fp-ledger-statistics-x-axis">{xAxisDays.map((day) => <span key={day}>{day}일</span>)}</div>
                </div>
                <div className="fp-ledger-statistics-y-axis base-axis" aria-label={`${formatMonthLabel(baseMonth)} 금액 축`}>{baseYAxisValues.map((value) => <span key={value}>{money(value)}</span>)}</div>
              </div>
              {selectedDay ? <div className="fp-ledger-statistics-selected-day" aria-live="polite"><strong>{formatMonthLabel(baseMonth)} {selectedDay}일</strong><span>{formatMonthLabel(baseMonth)} 지출 {money(selectedBaseDayExpense)} · 누적 {money(selectedBaseCumulative)}</span><span>{formatMonthLabel(compareMonth)} 지출 {money(selectedCompareDayExpense)} · 누적 {money(selectedCompareCumulative)}</span></div> : <p className="fp-ledger-statistics-chart-help">그래프의 날짜를 누르면 해당 일자 데이터를 볼 수 있습니다.</p>}
            </div>
            <div className="fp-ledger-statistics-totals"><span>{formatMonthLabel(baseMonth)} 지출 <strong>{money(baseExpense)}</strong></span><span>{formatMonthLabel(compareMonth)} 지출 <strong>{money(compareExpense)}</strong></span></div>
          </section>
        ) : null}
        {!loading && !error && tab === 'category' ? (
          <section className="fp-ledger-statistics-content" role="tabpanel">
            <p className="fp-ledger-statistics-category-heading">{formatMonthLabel(baseMonth)} 지출 비중</p>
            {categories.length ? <><div className="fp-ledger-statistics-donut-wrap"><div className="fp-ledger-statistics-donut" style={{ background: categoryGradient }} role="button" tabIndex={0} aria-label="카테고리 비중 그래프. 영역을 누르면 상세 금액을 표시합니다." onClick={(event) => selectCategoryFromChart(event.clientX, event.clientY, event.currentTarget)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedCategoryName(categories[0]?.name ?? null) } }}><div><strong>{money(selectedCategory?.amount ?? baseExpense)}</strong><span>{selectedCategory ? `${selectedCategory.name} ${Math.round((selectedCategory.amount / baseExpense) * 100)}%` : '총 지출'}</span></div></div></div>{selectedCategory ? <div className="fp-ledger-statistics-selected-category" aria-live="polite"><i style={{ background: selectedCategory.color }} />{selectedCategory.name} · {Math.round((selectedCategory.amount / baseExpense) * 100)}% · {money(selectedCategory.amount)}</div> : <p className="fp-ledger-statistics-chart-help">도넛 그래프의 카테고리를 누르면 해당 비중과 금액을 볼 수 있습니다.</p>}<ul className="fp-ledger-statistics-category-list">{categories.map((category) => <li className={selectedCategory?.name === category.name ? 'selected' : ''} key={category.name} onClick={() => setSelectedCategoryName(category.name)}><i style={{ background: category.color }} /><span className="category-name">{category.name}</span><span className="category-percent">{Math.round((category.amount / baseExpense) * 100)}%</span><strong>{money(category.amount)}</strong></li>)}</ul></> : <div className="fp-ledger-statistics-empty">선택한 월의 지출 내역이 없습니다.</div>}
          </section>
        ) : null}
      </section>
    </div>
  )
}
