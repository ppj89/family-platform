import { useEffect, useMemo, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import { getStoredUser } from '../../../shared/api/auth'
import { CustomSelect, ToastMessage } from '../../../shared/components'
import { listCommunityHotDeals } from '../../community/api/community'
import type { CommunityHotDealItem, CommunityHotDealSource } from '../../community/types'
import '../hotdeal-page.css'

const pageSize = 20
type SortKey = 'popular' | 'price' | 'views' | 'comments' | 'date'
type SortDirection = 'desc' | 'asc'

function displaySourceKey(source: string) {
  return source === 'ppomppu-overseas' ? 'ppomppu' : source
}

function displaySourceLabel(source: string, label: string) {
  return displaySourceKey(source) === 'ppomppu' ? '뽐뿌' : label
}

const sortOptions = [
  { value: 'popular', label: '인기순' },
  { value: 'price', label: '금액' },
  { value: 'views', label: '조회' },
  { value: 'comments', label: '댓글' },
  { value: 'date', label: '등록일' },
]

const sortDirectionOptions = [
  { value: 'desc', label: '내림차순' },
  { value: 'asc', label: '오름차순' },
]

function formatInstant(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function parsePrice(value: string) {
  const normalized = value.replace(/,/g, '')
  const amount = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(amount)) return -1
  return /만원/.test(value) ? amount * 10_000 : amount
}

function formatDisplayPrice(value: string) {
  return value.replace(/(\d[\d,]*)(?=\s*(?:원|엔|달러))/g, (amount) => {
    const numeric = Number(amount.replace(/,/g, ''))
    return Number.isFinite(numeric) ? numeric.toLocaleString('ko-KR') : amount
  }).replace(/([$€¥]\s*)(\d[\d,]*(?:\.\d+)?)/g, (_, currency: string, amount: string) => {
    const numeric = Number(amount.replace(/,/g, ''))
    return Number.isFinite(numeric) ? `${currency}${numeric.toLocaleString('en-US')}` : `${currency}${amount}`
  })
}

function itemSortValue(item: CommunityHotDealItem, sortKey: SortKey) {
  switch (sortKey) {
    case 'price': return parsePrice(item.price)
    case 'views': return item.viewCount ?? 0
    case 'comments': return item.commentCount ?? 0
    case 'date': return new Date(item.publishedAt || item.collectedAt).getTime() || 0
    default: return item.popularityScore ?? ((item.viewCount ?? 0) + (item.commentCount ?? 0) * 20)
  }
}

export default function HotDealPage() {
  const platformAdmin = Boolean(getStoredUser()?.platformAdmin)
  const [items, setItems] = useState<CommunityHotDealItem[]>([])
  const [sources, setSources] = useState<CommunityHotDealSource[]>([])
  const [selectedSource, setSelectedSource] = useState('all')
  const [published, setPublished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toastMessage, setToastMessage] = useState('')
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchText, setSearchText] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('popular')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sourceOptions = useMemo(() => {
    const visibleSources = sources.filter((source) => source.key !== 'ppomppu-overseas')
    return [
      { value: 'all', label: '전체' },
      ...visibleSources.map((source) => ({ value: source.key, label: displaySourceLabel(source.key, source.label) })),
    ]
  }, [sources])
  const visibleItems = useMemo(() => {
    const keyword = searchText.trim().toLocaleLowerCase()
    const filtered = items.filter((item) => {
      if (selectedSource !== 'all' && displaySourceKey(item.source) !== selectedSource) return false
      if (!keyword) return true
      return [item.title, item.summary, item.price, item.sourceLabel].some((value) => value.toLocaleLowerCase().includes(keyword))
    })
    return [...filtered].sort((left, right) => {
      const comparison = itemSortValue(left, sortKey) - itemSortValue(right, sortKey)
      if (comparison !== 0) return sortDirection === 'desc' ? -comparison : comparison
      return new Date(right.publishedAt || right.collectedAt).getTime() - new Date(left.publishedAt || left.collectedAt).getTime()
    })
  }, [items, searchText, selectedSource, sortDirection, sortKey])
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize))
  const pagedItems = visibleItems.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      try {
        const result = await listCommunityHotDeals()
        if (!alive) return
        setItems(result.items)
        setSources(result.sources)
        setPublished(result.published)
        setSelectedSource((current) => current === 'all' || result.sources.some((source) => displaySourceKey(source.key) === current) ? current : 'all')
      } catch (error) {
        if (!alive) return
        setItems([])
        setSources([])
        setPublished(false)
        setToastMessage(apiActionMessage(error, '특가 정보를 불러오지 못했습니다.'))
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => { alive = false }
  }, [])

  function submitSearch() {
    const keyword = searchInput.trim()
    setSearchText(keyword)
    setPage(1)
    void (async () => {
      setLoading(true)
      try {
        const result = await listCommunityHotDeals(keyword)
        setItems(result.items)
        setSources(result.sources)
        setPublished(result.published)
      } catch (error) {
        setToastMessage(apiActionMessage(error, '특가 정보를 불러오지 못했습니다.'))
      } finally {
        setLoading(false)
      }
    })()
  }

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const canViewDeals = published || platformAdmin

  return (
    <section className="fp-hotdeal">
      {loading ? <div className="fp-loading-blocker">특가 정보를 불러오는 중</div> : null}
      <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />

      <section className="fp-card fp-hotdeal-panel">
        <header className="fp-hotdeal-header">
          <div>
            <h2>특가</h2>
            <p>출처별 특가를 조회하고 카드를 눌러 원문으로 이동합니다.</p>
          </div>
          <span className="fp-hotdeal-total">{canViewDeals ? `${visibleItems.length}건` : '비공개'}</span>
        </header>

        {!canViewDeals ? <p className="fp-empty-text">특가 정보는 운영 검증 완료 후 공개됩니다.</p> : null}

        {canViewDeals ? (
          <>
            <form className="fp-hotdeal-controls" onSubmit={(event) => { event.preventDefault(); submitSearch() }}>
              <label className="fp-hotdeal-control">
                <span>출처</span>
                <CustomSelect ariaLabel="특가 출처" options={sourceOptions} value={selectedSource} onChange={setSelectedSource} />
              </label>
              <label className="fp-hotdeal-control fp-hotdeal-search">
                <span>검색어</span>
                <div>
                  <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="제목, 내용, 가격" type="text" />
                  {searchInput ? <button type="button" aria-label="검색어 지우기" onClick={() => setSearchInput('')}>×</button> : null}
                </div>
              </label>
              <button className="fp-hotdeal-search-button" type="submit">조회</button>
              <div className="fp-hotdeal-sort" aria-label="특가 정렬">
                <CustomSelect ariaLabel="정렬 기준" options={sortOptions} value={sortKey} onChange={(value) => { setSortKey(value as SortKey); setPage(1) }} />
                <CustomSelect ariaLabel="정렬 방향" options={sortDirectionOptions} value={sortDirection} onChange={(value) => { setSortDirection(value as SortDirection); setPage(1) }} />
              </div>
            </form>

            {pagedItems.length ? (
              <div className="fp-hotdeal-items" aria-label="수집된 특가 목록">
                {pagedItems.map((item) => (
                  <a className="fp-hotdeal-item" key={item.originalUrl} href={item.originalUrl} target="_blank" rel="noreferrer noopener">
                    <div>
                      <div className="fp-hotdeal-item-meta"><span>{displaySourceLabel(item.source, item.sourceLabel)}</span>{item.price ? <b>{formatDisplayPrice(item.price)}</b> : null}</div>
                      <strong>{item.title || '특가 원문'}</strong>
                      {item.summary ? <p>{item.summary}</p> : null}
                      <div className="fp-hotdeal-item-stats"><span>조회 {item.viewCount?.toLocaleString?.() ?? 0}</span><span>댓글 {item.commentCount?.toLocaleString?.() ?? 0}</span><span>{formatInstant(item.publishedAt || item.collectedAt)}</span></div>
                    </div>
                    <span className="fp-hotdeal-item-link">원문 보기</span>
                  </a>
                ))}
              </div>
            ) : <p className="fp-empty-text">조회된 데이터가 없습니다.</p>}

            {visibleItems.length > pageSize ? (
              <nav className="fp-hotdeal-pagination" aria-label="특가 페이지">
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>이전</button>
                <span>{page} / {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>다음</button>
              </nav>
            ) : null}
          </>
        ) : null}
      </section>
    </section>
  )
}
