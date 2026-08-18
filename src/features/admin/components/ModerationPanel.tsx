import { useEffect, useState } from 'react'
import { HiOutlineX } from 'react-icons/hi'
import { apiActionMessage } from '../../../shared/api/client'
import { ConfirmDialog } from '../../../shared/components'
import {
  cancelModerationWarning,
  issueModerationWarning,
  listModerationUsers,
  listModerationWarnings,
  releaseModerationUser,
  updateMediaFileSizeUnlimited,
  updateMediaStorageUnlimited,
  type ModerationWarning,
  type ModerationUser,
} from '../api/admin'
import './moderation-panel.css'

type ModerationPanelProps = {
  onToast: (message: string) => void
}

const moderationPageSize = 10
const warningHistoryPageSize = 10

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function userIdentifier(user: ModerationUser) {
  return user.email || user.loginId || '-'
}

function formatStorage(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export function ModerationPanel({ onToast }: ModerationPanelProps) {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<ModerationUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [warningTarget, setWarningTarget] = useState<ModerationUser | null>(null)
  const [warningReason, setWarningReason] = useState('')
  const [savingWarning, setSavingWarning] = useState(false)
  const [releaseTarget, setReleaseTarget] = useState<ModerationUser | null>(null)
  const [storageTarget, setStorageTarget] = useState<ModerationUser | null>(null)
  const [fileSizeTarget, setFileSizeTarget] = useState<ModerationUser | null>(null)
  const [cancelWarningTarget, setCancelWarningTarget] = useState<{ user: ModerationUser; warningId: number } | null>(null)
  const [historyTarget, setHistoryTarget] = useState<ModerationUser | null>(null)
  const [historyItems, setHistoryItems] = useState<ModerationWarning[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / moderationPageSize))

  async function loadUsers(nextQuery = query, nextPage = page) {
    setLoading(true)
    try {
      const response = await listModerationUsers(nextQuery, nextPage, moderationPageSize)
      setUsers(response.items)
      setTotal(response.total)
      setPage(response.page)
    } catch (error) {
      onToast(apiActionMessage(error, '정지 대상 목록을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers('', 1)
    // The panel loads once when the protected tab is opened. Searches are explicit.
  }, [])

  async function submitWarning() {
    if (!warningTarget) return
    const reason = warningReason.trim()
    if (!reason) {
      onToast('경고 사유를 입력해주세요.')
      return
    }
    setSavingWarning(true)
    try {
      const updated = await issueModerationWarning(warningTarget.id, reason)
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setWarningTarget(null)
      setWarningReason('')
      onToast(updated.suspended ? '경고 3회 누적으로 계정을 정지했습니다.' : '경고를 부여했습니다.')
    } catch (error) {
      onToast(apiActionMessage(error, '경고를 부여하지 못했습니다.'))
    } finally {
      setSavingWarning(false)
    }
  }

  async function confirmRelease() {
    if (!releaseTarget) return
    try {
      const updated = await releaseModerationUser(releaseTarget.id)
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      onToast('계정 정지를 해제했습니다. 다시 로그인할 수 있습니다.')
    } catch (error) {
      onToast(apiActionMessage(error, '계정 정지를 해제하지 못했습니다.'))
    } finally {
      setReleaseTarget(null)
    }
  }

  async function confirmWarningCancel() {
    if (!cancelWarningTarget) return
    try {
      const updated = await cancelModerationWarning(cancelWarningTarget.warningId)
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      if (historyTarget?.id === updated.id) void loadWarningHistory(updated, historyPage)
      onToast(updated.suspended ? '경고를 취소했지만 계정은 정지 상태입니다.' : '경고를 취소했습니다.')
    } catch (error) {
      onToast(apiActionMessage(error, '경고를 취소하지 못했습니다.'))
    } finally {
      setCancelWarningTarget(null)
    }
  }

  async function confirmStoragePolicy() {
    if (!storageTarget) return
    const unlimited = !storageTarget.mediaStorageUnlimited
    try {
      const updated = await updateMediaStorageUnlimited(storageTarget.id, unlimited)
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      onToast(unlimited ? '이 계정의 미디어 용량 제한을 해제했습니다.' : '이 계정에 기본 미디어 용량 제한을 적용했습니다.')
    } catch (error) {
      onToast(apiActionMessage(error, '미디어 용량 정책을 변경하지 못했습니다.'))
    } finally {
      setStorageTarget(null)
    }
  }

  async function confirmFileSizePolicy() {
    if (!fileSizeTarget) return
    const unlimited = !fileSizeTarget.mediaFileSizeUnlimited
    try {
      const updated = await updateMediaFileSizeUnlimited(fileSizeTarget.id, unlimited)
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      onToast(unlimited ? '이 계정의 사진·영상 파일 크기 제한을 해제했습니다.' : '이 계정에 기본 파일 크기 제한을 적용했습니다.')
    } catch (error) {
      onToast(apiActionMessage(error, '파일 크기 제한을 변경하지 못했습니다.'))
    } finally {
      setFileSizeTarget(null)
    }
  }

  async function loadWarningHistory(target: ModerationUser, nextPage = 1) {
    setHistoryLoading(true)
    try {
      const response = await listModerationWarnings(target.id, nextPage, warningHistoryPageSize)
      setHistoryTarget(target)
      setHistoryItems(response.items)
      setHistoryTotal(response.total)
      setHistoryPage(response.page)
    } catch (error) {
      onToast(apiActionMessage(error, '경고 이력을 불러오지 못했습니다.'))
    } finally {
      setHistoryLoading(false)
    }
  }

  return (
    <section className="fp-card fp-admin-panel fp-moderation-panel">
      <header className="fp-admin-panel-header panel-header">
        <h2>정지</h2>
        <form
          className="fp-moderation-search"
          onSubmit={(event) => {
            event.preventDefault()
            void loadUsers(query, 1)
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="아이디 또는 닉네임"
          />
          <button className="save-button" type="submit" disabled={loading}>조회</button>
        </form>
      </header>

      <div className="fp-moderation-list" aria-busy={loading}>
        {loading ? <p className="fp-admin-empty">정지 대상 목록을 불러오는 중입니다.</p> : null}
        {!loading && users.length === 0 ? <p className="fp-admin-empty">조회된 사용자가 없습니다.</p> : null}
        {users.map((user) => (
          <article
            className={`fp-moderation-user fp-moderation-user-selectable${user.suspended ? ' suspended' : ''}`}
            key={user.id}
            role="button"
            tabIndex={0}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button, input, textarea, select, a')) return
              void loadWarningHistory(user)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              if ((event.target as HTMLElement).closest('button, input, textarea, select, a')) return
              event.preventDefault()
              void loadWarningHistory(user)
            }}
          >
            <div className="fp-moderation-user-main">
              <div>
                <strong>{user.nickname || '닉네임 없음'}</strong>
                <span>{userIdentifier(user)}</span>
              </div>
              <span className={`fp-moderation-warning-count${user.suspended ? ' suspended' : ''}`}>경고 {user.warningCount}/3</span>
            </div>
            {user.suspended ? (
              <div className="fp-moderation-suspension">
                <strong>정지 중</strong>
                <span>{user.suspensionReason || '커뮤니티 경고 3회 누적'}</span>
              </div>
            ) : null}
            <div className="fp-moderation-storage">
              <span>미디어 사용량 {formatStorage(user.mediaStorageBytes)}</span>
              <div className="fp-moderation-storage-status">
                <strong className={user.mediaStorageUnlimited ? 'unlimited' : ''}>{user.mediaStorageUnlimited ? '용량 제한 없음' : '기본 한도 적용'}</strong>
                <strong className={user.mediaFileSizeUnlimited ? 'unlimited' : ''}>{user.mediaFileSizeUnlimited ? '파일 크기 제한 없음' : '기본 파일 제한 적용'}</strong>
              </div>
            </div>
            <ul className="fp-moderation-history">
              {user.warnings.length === 0 ? <li>경고 이력이 없습니다.</li> : user.warnings.map((warning) => (
                <li className={warning.cancelled ? 'cancelled' : ''} key={warning.id}>
                  <div>
                    <span>{formatDate(warning.createdAt)} · {warning.issuerName}{warning.cancelled ? ' · 취소됨' : ''}</span>
                    {!warning.cancelled ? (
                      <button type="button" onClick={() => setCancelWarningTarget({ user, warningId: warning.id })}>경고 취소</button>
                    ) : null}
                  </div>
                  <strong>{warning.reason}</strong>
                </li>
              ))}
            </ul>
            <div className="fp-moderation-actions">
              <button
                className="edit-button"
                type="button"
                onClick={() => {
                  setWarningTarget(user)
                  setWarningReason('')
                }}
              >
                경고 부여
              </button>
              {user.suspended ? (
                <button className="fp-moderation-release" type="button" onClick={() => setReleaseTarget(user)}>
                  정지 해제
                </button>
              ) : null}
              <button
                className="fp-moderation-storage-toggle"
                type="button"
                onClick={() => setStorageTarget(user)}
              >
                {user.mediaStorageUnlimited ? '한도 적용' : '한도 해제'}
              </button>
              <button
                className="fp-moderation-storage-toggle"
                type="button"
                onClick={() => setFileSizeTarget(user)}
              >
                {user.mediaFileSizeUnlimited ? '파일 제한 적용' : '파일 크기 해제'}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!loading && total > 0 ? (
        <div className="fp-moderation-pagination">
          <span>총 {total}명</span>
          {totalPages > 1 ? (
            <nav aria-label="정지 사용자 페이지">
              <button type="button" disabled={page <= 1} onClick={() => void loadUsers(query, page - 1)}>이전</button>
              <strong>{page} / {totalPages}</strong>
              <button type="button" disabled={page >= totalPages} onClick={() => void loadUsers(query, page + 1)}>다음</button>
            </nav>
          ) : null}
        </div>
      ) : null}

      {warningTarget ? (
        <div className="fp-moderation-dialog-backdrop" role="presentation" onClick={() => !savingWarning && setWarningTarget(null)}>
          <form
            className="fp-moderation-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="커뮤니티 경고 부여"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void submitWarning()
            }}
          >
            <header>
              <div>
                <strong>경고 부여</strong>
                <span>{warningTarget.nickname} · 현재 경고 {warningTarget.warningCount}/3</span>
              </div>
              <button type="button" aria-label="닫기" disabled={savingWarning} onClick={() => setWarningTarget(null)}>
                <HiOutlineX aria-hidden="true" />
              </button>
            </header>
            <label>
              <span>경고 사유</span>
              <textarea
                autoFocus
                maxLength={500}
                value={warningReason}
                onChange={(event) => setWarningReason(event.target.value)}
                placeholder="욕설, 비방 등 정지 사유를 입력하세요."
              />
            </label>
            <footer>
              <button className="cancel-button" type="button" disabled={savingWarning} onClick={() => setWarningTarget(null)}>취소</button>
              <button className="save-button" type="submit" disabled={savingWarning}>{savingWarning ? '처리 중' : '경고 부여'}</button>
            </footer>
          </form>
        </div>
      ) : null}

      {historyTarget ? (
        <div className="fp-moderation-dialog-backdrop" role="presentation" onClick={() => !historyLoading && setHistoryTarget(null)}>
          <section className="fp-moderation-history-dialog" role="dialog" aria-modal="true" aria-label="경고 이력" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>경고 이력</strong>
                <span>{historyTarget.nickname || userIdentifier(historyTarget)} · 전체 {historyTotal}건</span>
              </div>
              <button type="button" aria-label="닫기" disabled={historyLoading} onClick={() => setHistoryTarget(null)}><HiOutlineX aria-hidden="true" /></button>
            </header>
            <div className="fp-moderation-history-dialog-content" aria-busy={historyLoading}>
              {historyLoading ? <p className="fp-admin-empty">경고 이력을 불러오는 중입니다.</p> : null}
              {!historyLoading && historyItems.length === 0 ? <p className="fp-admin-empty">경고 이력이 없습니다.</p> : null}
              {!historyLoading && historyItems.length ? (
                <ul className="fp-moderation-history">
                  {historyItems.map((warning) => (
                    <li className={warning.cancelled ? 'cancelled' : ''} key={warning.id}>
                      <div>
                        <span>{formatDate(warning.createdAt)} · {warning.issuerName}{warning.cancelled ? ' · 취소됨' : ''}</span>
                        {!warning.cancelled ? <button type="button" onClick={() => setCancelWarningTarget({ user: historyTarget, warningId: warning.id })}>경고 취소</button> : null}
                      </div>
                      <strong>{warning.reason}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <footer>
              <span>{historyTotal > 0 ? `${historyPage} / ${Math.max(1, Math.ceil(historyTotal / warningHistoryPageSize))}` : ''}</span>
              <div>
                <button type="button" disabled={historyLoading || historyPage <= 1} onClick={() => void loadWarningHistory(historyTarget, historyPage - 1)}>이전</button>
                <button type="button" disabled={historyLoading || historyPage >= Math.ceil(historyTotal / warningHistoryPageSize)} onClick={() => void loadWarningHistory(historyTarget, historyPage + 1)}>다음</button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}

      {releaseTarget ? (
        <ConfirmDialog
          title="계정 정지 해제"
          body={`${releaseTarget.nickname || '선택한 사용자'} 계정의 정지를 해제합니다. 기존 경고 이력은 유지됩니다.`}
          confirmLabel="정지 해제"
          onCancel={() => setReleaseTarget(null)}
          onConfirm={() => void confirmRelease()}
        />
      ) : null}

      {cancelWarningTarget ? (
        <ConfirmDialog
          title="경고 취소"
          body={`${cancelWarningTarget.user.nickname || '선택한 사용자'}의 경고를 취소합니다. 유효 경고가 3회 미만이면 정지도 함께 해제됩니다.`}
          confirmLabel="경고 취소"
          danger
          onCancel={() => setCancelWarningTarget(null)}
          onConfirm={() => void confirmWarningCancel()}
        />
      ) : null}

      {storageTarget ? (
        <ConfirmDialog
          title={storageTarget.mediaStorageUnlimited ? '미디어 용량 한도 적용' : '미디어 용량 제한 해제'}
          body={storageTarget.mediaStorageUnlimited
            ? `${storageTarget.nickname || '선택한 사용자'} 계정에 기본 미디어 용량 한도를 다시 적용합니다.`
            : `${storageTarget.nickname || '선택한 사용자'} 계정은 사진·영상 총 용량 한도 없이 업로드할 수 있게 됩니다.`}
          confirmLabel={storageTarget.mediaStorageUnlimited ? '한도 적용' : '한도 해제'}
          onCancel={() => setStorageTarget(null)}
          onConfirm={() => void confirmStoragePolicy()}
        />
      ) : null}

      {fileSizeTarget ? (
        <ConfirmDialog
          title={fileSizeTarget.mediaFileSizeUnlimited ? '파일 크기 제한 적용' : '파일 크기 제한 해제'}
          body={fileSizeTarget.mediaFileSizeUnlimited
            ? `${fileSizeTarget.nickname || '선택한 사용자'} 계정에 사진·영상 1개당 기본 파일 크기 제한을 다시 적용합니다.`
            : `${fileSizeTarget.nickname || '선택한 사용자'} 계정은 사진·영상 1개당 파일 크기 제한 없이 업로드할 수 있게 합니다.`}
          confirmLabel={fileSizeTarget.mediaFileSizeUnlimited ? '제한 적용' : '파일 크기 해제'}
          onCancel={() => setFileSizeTarget(null)}
          onConfirm={() => void confirmFileSizePolicy()}
        />
      ) : null}
    </section>
  )
}
