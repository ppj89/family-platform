import { FormEvent, useState } from 'react'
import { HiOutlineX } from 'react-icons/hi'
import { apiActionMessage } from '../../../shared/api/client'
import {
  getAdminUserData,
  searchAdminUsers,
  type AdminUserDataRecord,
  type AdminUserSearchItem,
} from '../api/admin'

const menuLabels: Record<string, string> = {
  account: '계정',
  calendar: '일정',
  ledger: '가계부',
  travel: '여행',
  baby: '육아',
  diary: '일기',
  family: '그룹',
  restaurant: '맛집',
  community: '커뮤니티',
  admin: '설정',
}

const actionLabels: Record<string, string> = {
  create: '등록',
  update: '수정',
  delete: '삭제',
  withdraw: '탈퇴',
}

function formatRecordAmount(value: unknown) {
  const numeric = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[^\d.-]/g, ''))

  return Number.isFinite(numeric) ? Math.round(numeric).toLocaleString('ko-KR') : String(value)
}

function formatRecordDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}`
}

function formatSnapshot(snapshot?: Record<string, unknown>) {
  if (!snapshot) return '저장된 상세 정보가 없습니다.'
  const formattedSnapshot = snapshot.amount === undefined || snapshot.amount === null || snapshot.amount === ''
    ? snapshot
    : { ...snapshot, amount: formatRecordAmount(snapshot.amount) }
  const fields = ['title', 'name', 'body', 'content', 'memo', 'amount', 'date', 'scheduleDate', 'nickname']
  const values = fields.flatMap((key) => {
    const value = formattedSnapshot[key]
    if (value === null || value === undefined || value === '') return []
    return [`${key === 'body' ? '내용' : key === 'amount' ? '금액' : key === 'date' || key === 'scheduleDate' ? '일자' : key === 'memo' ? '메모' : key === 'nickname' ? '닉네임' : key === 'title' ? '제목' : '이름'} ${String(value)}`]
  })
  if (values.length) return values.join(' · ').slice(0, 180)
  return `데이터 ID ${String(snapshot.id ?? '-')}`
}

function DataRecord({ item }: { item: AdminUserDataRecord }) {
  return (
    <article className="fp-admin-user-data-record">
      <div>
        <strong>{menuLabels[item.menuKey] || item.menuKey}</strong>
        <span>{actionLabels[item.action] || item.action}</span>
        <time>{formatRecordDateTime(item.createdAt)}</time>
      </div>
      <p>{formatSnapshot(item.snapshot)}</p>
    </article>
  )
}

export function AdminUserDataLookup() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<AdminUserSearchItem[]>([])
  const [selected, setSelected] = useState<AdminUserSearchItem | null>(null)
  const [records, setRecords] = useState<AdminUserDataRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  function close() {
    setOpen(false)
    setQuery('')
    setItems([])
    setSelected(null)
    setRecords([])
    setTotal(0)
    setMessage('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setMessage('')
    setSelected(null)
    setRecords([])
    try {
      setItems(await searchAdminUsers(query))
    } catch (error) {
      setItems([])
      setMessage(apiActionMessage(error, '회원 검색에 실패했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  async function openData(item: AdminUserSearchItem) {
    setLoading(true)
    setMessage('')
    try {
      const response = await getAdminUserData(item.id)
      setSelected(response.user)
      setRecords(response.items)
      setTotal(response.total)
    } catch (error) {
      setMessage(apiActionMessage(error, '회원 데이터를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="fp-card fp-admin-panel fp-admin-user-data-panel">
      <header className="fp-admin-panel-header panel-header">
        <div>
          <h2>회원 데이터 조회</h2>
          <p>운영·고객지원 목적으로 회원의 메뉴별 등록·수정 이력을 읽기 전용으로 확인합니다.</p>
        </div>
        <button className="edit-button" type="button" onClick={() => setOpen(true)}>조건 조회</button>
      </header>
      <p className="fp-admin-user-data-notice">관리자 조회는 운영·고객지원 목적으로만 사용하며, 대상 회원과 조회 시각이 감사 로그에 기록됩니다.</p>

      {open ? (
        <div className="fp-admin-user-data-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) close()
        }}>
          <section className="fp-admin-user-data-dialog" role="dialog" aria-modal="true" aria-label="회원 데이터 조건 조회">
            <header>
              <div>
                <h3>회원 데이터 조회</h3>
                <p>아이디 또는 닉네임을 입력하세요.</p>
              </div>
              <button type="button" aria-label="닫기" onClick={close}><HiOutlineX aria-hidden="true" /></button>
            </header>
            <form onSubmit={submit} className="fp-admin-user-data-search">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="아이디 또는 닉네임" autoFocus />
              <button type="submit" disabled={loading}>조회</button>
            </form>
            {message ? <p className="fp-admin-user-data-message">{message}</p> : null}
            {!selected ? (
              <div className="fp-admin-user-data-results" aria-busy={loading}>
                {items.map((item) => (
                  <button key={item.id} type="button" onClick={() => void openData(item)} disabled={loading}>
                    <span><strong>{item.nickname || '닉네임 없음'}</strong><small>{item.loginId || `회원 ID ${item.id}`}</small></span>
                    <em>데이터 보기</em>
                  </button>
                ))}
                {!loading && query && items.length === 0 && !message ? <p>검색 결과가 없습니다.</p> : null}
              </div>
            ) : (
              <div className="fp-admin-user-data-detail" aria-busy={loading}>
                <div className="fp-admin-user-data-profile">
                  <div><strong>{selected.nickname || '닉네임 없음'}</strong><span>{selected.loginId || `회원 ID ${selected.id}`}</span></div>
                  <button type="button" onClick={() => { setSelected(null); setRecords([]); setTotal(0) }}>검색 결과</button>
                </div>
                <p>전체 {total}건 중 최근 {records.length}건</p>
                <div className="fp-admin-user-data-records">
                  {records.map((item) => <DataRecord key={`${item.entityType}-${item.entityId}-${item.createdAt}`} item={item} />)}
                  {!loading && records.length === 0 ? <p>조회할 등록·수정 이력이 없습니다.</p> : null}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  )
}
