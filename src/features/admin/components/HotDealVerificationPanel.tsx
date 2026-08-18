import { useEffect, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import { ConfirmDialog } from '../../../shared/components'
import {
  getAdminHotDealVerification,
  updateAdminHotDealPublished,
  type AdminHotDealVerification,
} from '../api/admin'
import './hotdeal-verification-panel.css'

type HotDealVerificationPanelProps = {
  onToast: (message: string) => void
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function HotDealVerificationPanel({ onToast }: HotDealVerificationPanelProps) {
  const [data, setData] = useState<AdminHotDealVerification | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishTarget, setPublishTarget] = useState<boolean | null>(null)

  async function load(forceRefresh = false) {
    setLoading(true)
    try {
      setData(await getAdminHotDealVerification(forceRefresh))
    } catch (error) {
      onToast(apiActionMessage(error, '특가 검증 정보를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(true)
    // The protected panel intentionally refreshes its source links only when opened or requested.
  }, [])

  async function savePublishState() {
    if (publishTarget === null) return
    setSaving(true)
    try {
      const result = await updateAdminHotDealPublished(publishTarget)
      setData((current) => (current ? { ...current, published: result.published } : current))
      onToast(result.published ? '특가 탭을 공개했습니다.' : '특가 탭을 비공개로 전환했습니다.')
      setPublishTarget(null)
    } catch (error) {
      onToast(apiActionMessage(error, '특가 공개 상태를 저장하지 못했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  const collectedSources = (data?.sources || []).filter((source) => source.collectionEnabled)

  return (
    <section className="fp-card fp-admin-panel fp-hotdeal-verification">
      <header className="fp-admin-panel-header panel-header">
        <div>
          <h2>특가 검증</h2>
          <p>원문 링크와 출처만 수집합니다. 제목·본문·이미지는 저장하지 않습니다.</p>
        </div>
        <div className="fp-hotdeal-verification-actions">
          <span className={data?.published ? 'published' : 'unpublished'}>{data?.published ? '회원 공개 중' : '비공개·검증 중'}</span>
          <button className="fp-button fp-button-muted" type="button" disabled={loading || saving} onClick={() => void load(true)}>최신 목록 갱신</button>
          <button
            className={data?.published ? 'fp-button fp-button-muted' : 'fp-button fp-button-primary'}
            type="button"
            disabled={loading || saving || !data}
            onClick={() => setPublishTarget(!data?.published)}
          >
            {data?.published ? '회원 공개 중지' : '회원에게 공개'}
          </button>
        </div>
      </header>

      <div className="fp-hotdeal-verification-summary" aria-busy={loading}>
        <div><span>수집 원문</span><strong>{data?.items.length || 0}건</strong></div>
        <div><span>자동 수집 출처</span><strong>{collectedSources.length}곳</strong></div>
        <div><span>최근 수집</span><strong>{data?.refreshedAt ? formatDateTime(data.refreshedAt) : '-'}</strong></div>
      </div>

      <section className="fp-hotdeal-verification-section">
        <h3>수집 원문 링크</h3>
        {loading ? <p className="fp-empty-text">특가 원문을 확인 중입니다.</p> : null}
        {!loading && data?.items.length ? (
          <div className="fp-hotdeal-verification-items">
            {data.items.map((item) => (
              <a key={item.originalUrl} href={item.originalUrl} target="_blank" rel="noreferrer noopener" title={item.originalUrl}>
                <div className="fp-hotdeal-verification-item-content">
                  <div className="fp-hotdeal-verification-item-meta"><span>{item.sourceLabel}</span>{item.price ? <b>{item.price}</b> : null}</div>
                  <strong>{item.title || '특가 원문'}</strong>
                  {item.summary ? <p>{item.summary}</p> : null}
                </div>
                <small>원문 확인 · {formatDateTime(item.collectedAt)}</small>
              </a>
            ))}
          </div>
        ) : null}
        {!loading && !data?.items.length ? <p className="fp-empty-text">자동 수집된 원문 링크가 없습니다. 재수집 후 출처별 링크를 확인하세요.</p> : null}
      </section>

      <section className="fp-hotdeal-verification-section">
        <h3>출처 상태</h3>
        <div className="fp-hotdeal-verification-sources">
          {(data?.sources || []).map((source) => (
            <a key={source.key} href={source.listingUrl} target="_blank" rel="noreferrer noopener">
              <span>{source.label}</span>
              <small>{source.collectionEnabled ? '자동 수집 · 검증 가능' : '원문 게시판 링크'}</small>
            </a>
          ))}
        </div>
      </section>

      {publishTarget !== null ? (
        <ConfirmDialog
          title={publishTarget ? '특가 탭 회원 공개' : '특가 탭 회원 공개 중지'}
          body={publishTarget ? '현재 검증 화면의 특가 목록을 모든 회원에게 공개합니다.' : '회원에게 특가 목록이 보이지 않도록 즉시 비공개 전환합니다.'}
          confirmLabel={publishTarget ? '회원에게 공개' : '공개 중지'}
          busy={saving}
          busyLabel="저장 중"
          danger={!publishTarget}
          onConfirm={() => void savePublishState()}
          onCancel={() => setPublishTarget(null)}
        />
      ) : null}
    </section>
  )
}
