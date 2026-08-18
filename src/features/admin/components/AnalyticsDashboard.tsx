import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { HiOutlineX } from 'react-icons/hi'
import { apiActionMessage } from '../../../shared/api/client'
import { CustomSelect, DatePickerField } from '../../../shared/components'
import { todayKey } from '../../../shared/utils/date'
import {
  getAnalyticsDashboard,
  getAnalyticsActivityDetails,
  getAnalyticsMembers,
  type AnalyticsActivityDetailResponse,
  type AnalyticsActivityDetailType,
  type AnalyticsActivityItem,
  type AnalyticsChangeBucket,
  type AnalyticsDashboard,
  type AnalyticsMemberDetailType,
  type AnalyticsMemberListResponse,
  type AnalyticsMenuBucket,
} from '../api/admin'
import './analytics-dashboard.css'

const menuLabels: Record<string, string> = {
  home: '홈',
  calendar: '캘린더',
  ledger: '가계부',
  travel: '여행',
  baby: '육아',
  diary: '일기',
  family: '그룹관리',
  restaurant: '맛집',
  community: '커뮤니티',
  hotdeal: '특가',
  admin: '설정',
}

const entityLabels: Record<string, string> = {
  ledger_entry: '가계부',
  family_schedule: '일정',
  family_schedule_exception: '반복 일정',
  trip: '여행',
  travel_record: '여행 기록',
  baby_profile: '아이',
  baby_record: '육아 기록',
  family_diary: '일기',
  restaurant: '맛집',
  community_post: '게시글',
  community_comment: '댓글',
  common_code: '공통코드',
  common_code_group: '코드그룹',
  app_user: '계정',
}

const actionLabels: Record<string, string> = {
  create: '등록',
  update: '수정',
  delete: '삭제',
  withdraw: '탈퇴',
  GET: '조회',
  POST: '등록',
  PUT: '수정',
  PATCH: '수정',
  DELETE: '삭제',
}

function menuLabel(value: string) {
  return menuLabels[value] || '기타'
}

function entityLabel(value?: string) {
  return entityLabels[value || ''] || value || '-'
}

function actionLabel(value: string) {
  return actionLabels[value] || value
}

function loginProviderLabel(value: string) {
  return ({ password: '이메일', google: '구글', naver: '네이버', kakao: '카카오', auto: '자동' } as Record<string, string>)[value] || value
}

function formatActivityTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function formatActivityDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function formatVisitorTrendLabel(label: string, period: 'day' | 'week' | 'month' | 'year') {
  if (period === 'year') {
    const match = label.match(/-(\d{1,2})$/)
    if (match) return `${Number(match[1])}월`
  }

  if (period === 'month') {
    const match = label.match(/\/(\d{1,2})$/)
    if (match) return `${Number(match[1])}일`
  }

  return label
}

function totalMenuAccess(items: AnalyticsMenuBucket[]) {
  return items.reduce((sum, item) => sum + item.count, 0)
}

function totalDataChanges(items: AnalyticsChangeBucket[]) {
  return items.reduce((sum, item) => sum + item.count, 0)
}

type PieChartItem = { label: string; count: number; color: string }

function AnalyticsPieChart({ items, totalLabel }: { items: PieChartItem[]; totalLabel: string }) {
  const total = items.reduce((sum, item) => sum + item.count, 0)
  if (!total) return null
  let cursor = 0
  const stops = items.map((item) => {
    const start = cursor
    cursor += (item.count / total) * 100
    return `${item.color} ${start}% ${cursor}%`
  }).join(', ')
  return (
    <div className="fp-admin-pie-wrap">
      <div className="fp-admin-pie-chart" role="img" aria-label={`${totalLabel} 비중 원형 차트`} style={{ background: `conic-gradient(${stops})` }}>
        <span><strong>{total}</strong>{totalLabel}</span>
      </div>
      <div className="fp-admin-pie-legend">
        {items.map((item) => (
          <div key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{item.count}</strong></div>
        ))}
      </div>
    </div>
  )
}

function activityDescription(item: AnalyticsActivityItem) {
  if (item.eventType === 'menu_view') return `${menuLabel(item.menuKey)} 데이터 조회`
  if (item.eventType === 'data_change') return `${entityLabel(item.entityType)} ${actionLabel(item.action)}`
  return `${menuLabel(item.menuKey)} ${actionLabel(item.action)} API 호출`
}

const detailLabels: Record<AnalyticsActivityDetailType, string> = {
  visitor: '방문자',
  menu: '데이터 조회',
  change: '데이터 변경',
}

type AnalyticsDetailOptions = {
  hour?: number
  menuKey?: string
  entityType?: string
  action?: string
  title?: string
}

export function AnalyticsDashboard() {
  const [date, setDate] = useState(todayKey())
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('day')
  const [userQuery, setUserQuery] = useState('')
  const [appliedUserQuery, setAppliedUserQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(30)
  const [data, setData] = useState<AnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailType, setDetailType] = useState<AnalyticsActivityDetailType | null>(null)
  const [detailHour, setDetailHour] = useState<number | null>(null)
  const [detailOptions, setDetailOptions] = useState<AnalyticsDetailOptions>({})
  const [detailPage, setDetailPage] = useState(1)
  const [detailData, setDetailData] = useState<AnalyticsActivityDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [memberDetailType, setMemberDetailType] = useState<AnalyticsMemberDetailType | null>(null)
  const [memberDetailPage, setMemberDetailPage] = useState(1)
  const [memberDetailData, setMemberDetailData] = useState<AnalyticsMemberListResponse | null>(null)
  const [memberDetailLoading, setMemberDetailLoading] = useState(false)
  const [memberDetailError, setMemberDetailError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const nextData = await getAnalyticsDashboard({ date, period, userQuery: appliedUserQuery, page, pageSize })
        if (active) setData(nextData)
      } catch (loadError) {
        if (active) setError(apiActionMessage(loadError, '통계 데이터를 불러오지 못했습니다.'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [date, period, appliedUserQuery, page, pageSize])

  useEffect(() => {
    if (!detailType) return
    const activeDetailType = detailType
    let active = true
    async function loadDetails() {
      setDetailLoading(true)
      setDetailError('')
      try {
        const query = {
          type: activeDetailType,
          date,
          period,
          userQuery: appliedUserQuery,
          hour: detailHour ?? undefined,
          menuKey: detailOptions.menuKey,
          entityType: detailOptions.entityType,
          action: detailOptions.action,
          page: detailPage,
          pageSize,
        }
        let nextData: AnalyticsActivityDetailResponse
        try {
          nextData = await getAnalyticsActivityDetails(query)
        } catch {
          await new Promise((resolve) => window.setTimeout(resolve, 300))
          nextData = await getAnalyticsActivityDetails(query)
        }
        if (active) setDetailData(nextData)
      } catch (loadError) {
        if (active) setDetailError(apiActionMessage(loadError, '상세 이력을 불러오지 못했습니다.'))
      } finally {
        if (active) setDetailLoading(false)
      }
    }
    void loadDetails()
    return () => {
      active = false
    }
  }, [detailType, date, period, appliedUserQuery, detailHour, detailOptions, detailPage, pageSize])

  useEffect(() => {
    if (!memberDetailType) return
    const activeMemberDetailType = memberDetailType
    let active = true
    async function loadMembers() {
      setMemberDetailLoading(true)
      setMemberDetailError('')
      try {
        const nextData = await getAnalyticsMembers({
          type: activeMemberDetailType,
          date,
          period,
          userQuery: appliedUserQuery,
          page: memberDetailPage,
          pageSize,
        })
        if (active) setMemberDetailData(nextData)
      } catch (loadError) {
        if (active) setMemberDetailError(apiActionMessage(loadError, '회원 목록을 불러오지 못했습니다.'))
      } finally {
        if (active) setMemberDetailLoading(false)
      }
    }
    void loadMembers()
    return () => {
      active = false
    }
  }, [memberDetailType, date, period, appliedUserQuery, memberDetailPage, pageSize])

  useEffect(() => {
    if (!detailType && !memberDetailType) return

    const previousBodyOverflow = document.body.style.overflow
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehavior = previousBodyOverscroll
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [detailType, memberDetailType])

  const maxTrendVisitors = useMemo(() => Math.max(1, ...(data?.visitorTrend.map((item) => item.visitors) || [0])), [data])
  const maxMenuCount = useMemo(() => Math.max(1, ...(data?.menuAccess.map((item) => item.count) || [0])), [data])
  const maxChangeCount = useMemo(() => Math.max(1, ...(data?.dataChanges.map((item) => item.count) || [0])), [data])
  const visitors = data?.visitors || 0
  const totalPages = Math.max(1, Math.ceil((data?.activityTotal || 0) / pageSize))
  const detailTotalPages = Math.max(1, Math.ceil((detailData?.total || 0) / pageSize))
  const memberDetailTotalPages = Math.max(1, Math.ceil((memberDetailData?.total || 0) / pageSize))
  const trendTitle = period === 'day' ? '시간대별 방문자' : period === 'week' ? '일자별 방문자 (주간)' : period === 'month' ? '일자별 방문자 (월간)' : '월별 방문자 (연간)'
  const rangeLabel = data ? `${data.rangeStart} ~ ${data.rangeEnd}` : ''
  const menuPieItems = useMemo(() => (data?.menuAccess || []).map((item, index) => ({
    label: menuLabel(item.menuKey), count: item.count, color: ['#3182f6', '#00a889', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'][index % 6],
  })), [data])
  const changePieItems = useMemo(() => (data?.dataChanges || []).map((item, index) => ({
    label: `${entityLabel(item.entityType)} · ${actionLabel(item.action)}`, count: item.count, color: ['#3182f6', '#00a889', '#f04452', '#f59e0b', '#8b5cf6', '#14b8a6'][index % 6],
  })), [data])
  const visitorTrend = data?.visitorTrend || []

  function openDetails(type: AnalyticsActivityDetailType, options: AnalyticsDetailOptions = {}) {
    setMemberDetailType(null)
    setDetailType(type)
    setDetailHour(type === 'visitor' && Number.isInteger(options.hour) ? options.hour as number : null)
    setDetailOptions(options)
    setDetailPage(1)
    setDetailData(null)
  }

  function openMemberDetails(type: AnalyticsMemberDetailType) {
    setDetailType(null)
    setMemberDetailType(type)
    setMemberDetailPage(1)
    setMemberDetailData(null)
  }

  function detailDescription(type: AnalyticsActivityDetailType, item: NonNullable<AnalyticsActivityDetailResponse>['items'][number]) {
    if (type === 'visitor') return `${loginProviderLabel(item.action)} 로그인`
    if (type === 'menu') return `${menuLabel(item.menuKey)} 데이터 조회`
    return `${entityLabel(item.entityType)} ${actionLabel(item.action)}`
  }

  return (
    <section className="fp-admin-panel fp-admin-analytics-panel" aria-busy={loading}>
      <header className="fp-admin-panel-header fp-admin-analytics-header">
        <div>
          <h2>활동 대시보드</h2>
        </div>
        <div className="fp-admin-analytics-filters">
          <div className="fp-admin-analytics-periods" role="group" aria-label="조회 기간">
            {(['day', 'week', 'month', 'year'] as const).map((value) => (
              <button key={value} className={period === value ? 'active' : ''} type="button" onClick={() => { setPeriod(value); setPage(1) }}>
                {{ day: '일간', week: '주간', month: '월간', year: '연간' }[value]}
              </button>
            ))}
          </div>
          <DatePickerField className="fp-admin-analytics-date" label="기준일" value={date} onChange={(value) => { setDate(value); setPage(1) }} />
        </div>
      </header>

      <div className="fp-admin-analytics-search">
        <label>
          <span>아이디 또는 닉네임</span>
          <input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="아이디 또는 닉네임" onKeyDown={(event) => {
            if (event.key === 'Enter') { setAppliedUserQuery(userQuery); setPage(1) }
          }} />
        </label>
        <button className="fp-admin-analytics-search-button" type="button" onClick={() => { setAppliedUserQuery(userQuery); setPage(1) }}>조회</button>
        <button className="fp-admin-analytics-reset-button" type="button" onClick={() => { setUserQuery(''); setAppliedUserQuery(''); setPage(1) }}>초기화</button>
      </div>

      <div className="fp-admin-analytics-summary" aria-label="활동 요약">
        <button type="button" onClick={() => openDetails('visitor')}><span>방문자</span><strong>{visitors}명</strong></button>
        <button type="button" onClick={() => openDetails('menu')}><span>데이터 조회</span><strong>{totalMenuAccess(data?.menuAccess || [])}회</strong></button>
        <button type="button" onClick={() => openDetails('change')}><span>데이터 변경</span><strong>{totalDataChanges(data?.dataChanges || [])}건</strong></button>
        <button type="button" onClick={() => openMemberDetails('active')}><span>활성 회원</span><strong>{data?.activeUsers || 0}명</strong></button>
        <button type="button" onClick={() => openMemberDetails('registered')}><span>기간 가입</span><strong>{data?.registeredUsers || 0}명</strong></button>
      </div>

      {error ? <p className="fp-admin-analytics-error">{error}</p> : null}
      {loading ? <p className="fp-admin-empty">통계 데이터를 불러오는 중입니다.</p> : null}

      {!loading && !error ? (
        <div className="fp-admin-analytics-content">
          <section className="fp-admin-analytics-section">
            <header><h3>{trendTitle}</h3><span>{rangeLabel}</span></header>
            <div className="fp-admin-hour-chart-scroll">
              <div
                className="fp-admin-hour-chart"
                role="img"
                aria-label="시간대별 방문자 차트"
                style={{ '--trend-column-count': Math.max(1, visitorTrend.length) } as CSSProperties}
              >
                {visitorTrend.map((item) => {
                  const hour = Number(item.label)
                  const isHourlyVisitor = period === 'day' && Number.isInteger(hour)
                  const Tag = isHourlyVisitor ? 'button' : 'div'
                  const displayLabel = formatVisitorTrendLabel(item.label, period)
                  return (
                  <Tag
                    className={`fp-admin-hour-bar${isHourlyVisitor ? ' is-clickable' : ''}`}
                    key={item.label}
                    {...(isHourlyVisitor ? { type: 'button' as const, onClick: () => openDetails('visitor', { hour }), 'aria-label': `${item.label}시 방문자 ${item.visitors}명 보기` } : {})}
                  >
                    <span className="fp-admin-hour-value">{item.visitors || ''}</span>
                    <div className="fp-admin-hour-track"><i style={{ height: `${(item.visitors / maxTrendVisitors) * 100}%` }} /></div>
                    <small>{displayLabel}</small>
                  </Tag>
                  )
                })}
              </div>
            </div>
          </section>

          <div className="fp-admin-analytics-split">
            <section className="fp-admin-analytics-section">
              <header><h3>데이터 조회</h3><span>{totalMenuAccess(data?.menuAccess || [])}회</span></header>
              {data?.menuAccess.length ? (
                <div className="fp-admin-distribution-content">
                  <AnalyticsPieChart items={menuPieItems} totalLabel="회" />
                  <div className="fp-admin-ranking-chart">
                    {data.menuAccess.map((item) => (
                      <button className="fp-admin-ranking-row is-clickable" type="button" key={item.menuKey} onClick={() => openDetails('menu', {
                        menuKey: item.menuKey,
                        title: `${menuLabel(item.menuKey)} 데이터 조회`,
                      })}>
                        <strong>{menuLabel(item.menuKey)}</strong>
                        <div><i style={{ width: `${(item.count / maxMenuCount) * 100}%` }} /></div>
                        <span>{item.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : <p className="fp-admin-empty">데이터 조회 이력이 없습니다.</p>}
            </section>

            <section className="fp-admin-analytics-section">
              <header><h3>등록 · 수정 · 삭제</h3><span>{totalDataChanges(data?.dataChanges || [])}건</span></header>
              {data?.dataChanges.length ? (
                <div className="fp-admin-distribution-content">
                  <AnalyticsPieChart items={changePieItems} totalLabel="건" />
                  <div className="fp-admin-ranking-chart">
                    {data.dataChanges.map((item) => (
                      <button className="fp-admin-ranking-row is-clickable" type="button" key={`${item.entityType}-${item.action}`} onClick={() => openDetails('change', {
                        entityType: item.entityType,
                        action: item.action,
                        title: `${entityLabel(item.entityType)} ${actionLabel(item.action)}`,
                      })}>
                        <strong>{entityLabel(item.entityType)} · {actionLabel(item.action)}</strong>
                        <div><i className={`action-${item.action}`} style={{ width: `${(item.count / maxChangeCount) * 100}%` }} /></div>
                        <span>{item.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : <p className="fp-admin-empty">데이터 변경 이력이 없습니다.</p>}
            </section>
          </div>

          <section className="fp-admin-analytics-section fp-admin-recent-activity">
            <header>
              <h3>최근 활동</h3>
              <div className="fp-admin-activity-controls">
                <span>{data?.activityTotal || 0}건</span>
                <CustomSelect
                  className="fp-admin-activity-page-size-select"
                  ariaLabel="페이지당 기록 수"
                  value={String(pageSize)}
                  options={[10, 30, 50, 100].map((value) => ({ value: String(value), label: `${value}건` }))}
                  onChange={(value) => { setPageSize(Number(value)); setPage(1) }}
                />
              </div>
            </header>
            {data?.recentActivity.length ? (
              <div className="fp-admin-activity-list">
                {data.recentActivity.map((item, index) => (
                  <div className="fp-admin-activity-row" key={`${item.occurredAt}-${item.actor}-${item.action}-${index}`}>
                    <time>{formatActivityTime(item.occurredAt)}</time>
                    <strong>{item.actor}</strong>
                    <span>{activityDescription(item)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="fp-admin-empty">선택한 날짜의 활동 이력이 없습니다.</p>}
            {data?.activityTotal ? (
              <nav className="fp-admin-pagination" aria-label="활동 이력 페이지">
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>이전</button>
                <span>{page} / {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>다음</button>
              </nav>
            ) : null}
          </section>
        </div>
      ) : null}

      {detailType ? (
        <div className="fp-admin-analytics-detail-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDetailType(null)
        }}>
          <section className="fp-admin-analytics-detail-dialog" role="dialog" aria-modal="true" aria-label={`${detailLabels[detailType]} 상세 이력`}>
            <header>
              <div>
                <h3>{detailOptions.title || (detailHour !== null ? `${String(detailHour).padStart(2, '0')}시 방문자` : `${detailLabels[detailType]} 상세 이력`)}</h3>
                <span>{data ? `${data.rangeStart} ~ ${data.rangeEnd}` : ''}</span>
              </div>
              <button type="button" aria-label="닫기" onClick={() => setDetailType(null)}><HiOutlineX aria-hidden="true" /></button>
            </header>
            <div className="fp-admin-analytics-detail-list" aria-busy={detailLoading}>
              {detailLoading ? <p className="fp-admin-empty">상세 이력을 불러오는 중입니다.</p> : null}
              {detailError ? <p className="fp-admin-analytics-error">{detailError}</p> : null}
              {!detailLoading && !detailError && !detailData?.items.length ? <p className="fp-admin-empty">조회된 이력이 없습니다.</p> : null}
              {!detailLoading && !detailError ? detailData?.items.map((item, index) => (
                <div className="fp-admin-analytics-detail-row" key={`${item.occurredAt}-${item.actor}-${item.action}-${index}`}>
                  <time>{formatActivityDateTime(item.occurredAt)}</time>
                  <strong>{item.actor}</strong>
                  <span>{detailDescription(detailType, item)}</span>
                </div>
              )) : null}
            </div>
            {detailData?.total ? (
              <nav className="fp-admin-pagination" aria-label="상세 이력 페이지">
                <button type="button" disabled={detailPage <= 1} onClick={() => setDetailPage((current) => Math.max(1, current - 1))}>이전</button>
                <span>{detailPage} / {detailTotalPages}</span>
                <button type="button" disabled={detailPage >= detailTotalPages} onClick={() => setDetailPage((current) => Math.min(detailTotalPages, current + 1))}>다음</button>
              </nav>
            ) : null}
          </section>
        </div>
      ) : null}

      {memberDetailType ? (
        <div className="fp-admin-analytics-detail-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setMemberDetailType(null)
        }}>
          <section className="fp-admin-analytics-detail-dialog" role="dialog" aria-modal="true" aria-label={memberDetailType === 'active' ? '활성 회원 목록' : '기간 가입 회원 목록'}>
            <header>
              <div>
                <h3>{memberDetailType === 'active' ? '활성 회원' : '기간 가입 회원'}</h3>
                <span>{memberDetailType === 'active' ? '현재 탈퇴하지 않은 회원 목록' : (data ? `${data.rangeStart} ~ ${data.rangeEnd} 가입 내역` : '')}</span>
              </div>
              <button type="button" aria-label="닫기" onClick={() => setMemberDetailType(null)}><HiOutlineX aria-hidden="true" /></button>
            </header>
            <div className="fp-admin-analytics-detail-list" aria-busy={memberDetailLoading}>
              {memberDetailLoading ? <p className="fp-admin-empty">회원 목록을 불러오는 중입니다.</p> : null}
              {memberDetailError ? <p className="fp-admin-analytics-error">{memberDetailError}</p> : null}
              {!memberDetailLoading && !memberDetailError && !memberDetailData?.items.length ? <p className="fp-admin-empty">조회된 회원이 없습니다.</p> : null}
              {!memberDetailLoading && !memberDetailError ? memberDetailData?.items.map((item) => (
                <div className="fp-admin-analytics-detail-row" key={item.id}>
                  <time>{formatActivityDateTime(item.createdAt)}</time>
                  <strong>{item.nickname || item.loginId || `회원 ${item.id}`}</strong>
                  <span>{item.loginId || item.provider || '-'} · {item.status === 'WITHDRAWN' ? '탈퇴' : '활성'}</span>
                </div>
              )) : null}
            </div>
            {memberDetailData?.total ? (
              <nav className="fp-admin-pagination" aria-label="회원 목록 페이지">
                <button type="button" disabled={memberDetailPage <= 1} onClick={() => setMemberDetailPage((current) => Math.max(1, current - 1))}>이전</button>
                <span>{memberDetailPage} / {memberDetailTotalPages}</span>
                <button type="button" disabled={memberDetailPage >= memberDetailTotalPages} onClick={() => setMemberDetailPage((current) => Math.min(memberDetailTotalPages, current + 1))}>다음</button>
              </nav>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  )
}
