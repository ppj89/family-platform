import { useEffect, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import type { FamilyGroup } from '../../family/types'
import { getCurrentUserProfile, listAdminVisibleFamilies, type CurrentUserProfile } from '../api/admin'
import './admin-page.css'

const migratedMenus = ['홈', '캘린더', '가계부', '여행', '육아', '일기', '가족그룹', '맛집', '커뮤니티', '관리자']

function providerLabel(provider?: string) {
  if (provider === 'naver') return '네이버'
  if (provider === 'kakao') return '카카오'
  if (provider === 'google') return '구글'
  if (provider === 'admin') return '관리자 ID'
  return '이메일'
}

export default function AdminPage() {
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null)
  const [families, setFamilies] = useState<FamilyGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setMessage('')
      try {
        const [nextProfile, nextFamilies] = await Promise.all([
          getCurrentUserProfile(),
          listAdminVisibleFamilies(),
        ])
        if (!alive) return
        setProfile(nextProfile)
        setFamilies(nextFamilies)
      } catch (error) {
        if (!alive) return
        setMessage(apiActionMessage(error, '관리자 정보를 불러오지 못했습니다.'))
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [])

  const isPlatformAdmin = Boolean(profile?.platformAdmin)

  return (
    <section className="fp-admin">
      {loading ? <div className="fp-loading-blocker">관리자 정보 확인 중</div> : null}
      <header className="fp-card fp-admin-header">
        <div>
          <h2>관리자</h2>
          <p>실제 제공되는 API 기준으로 계정 권한과 운영 점검 상태를 확인합니다.</p>
        </div>
        <span className={isPlatformAdmin ? 'active' : ''}>{isPlatformAdmin ? '플랫폼 관리자' : '일반 사용자'}</span>
      </header>

      {message ? <p className="fp-message">{message}</p> : null}

      <div className="fp-admin-grid">
        <section className="fp-card fp-admin-panel">
          <h3>계정 정보</h3>
          <dl>
            <div>
              <dt>로그인 방식</dt>
              <dd>{providerLabel(profile?.loginProvider)}</dd>
            </div>
            <div>
              <dt>이메일</dt>
              <dd>{profile?.email || '-'}</dd>
            </div>
            <div>
              <dt>닉네임</dt>
              <dd>{profile?.nickname || '-'}</dd>
            </div>
            <div>
              <dt>권한</dt>
              <dd>{isPlatformAdmin ? '플랫폼 관리자' : '가족/개인 사용자'}</dd>
            </div>
          </dl>
        </section>

        <section className="fp-card fp-admin-panel">
          <h3>가족 그룹</h3>
          <div className="fp-admin-metric">
            <span>접근 가능한 가족 그룹</span>
            <strong>{families.length.toLocaleString('ko-KR')}개</strong>
          </div>
          <div className="fp-admin-list">
            {families.length ? families.map((family) => (
              <article key={family.id}>
                <strong>{family.name}</strong>
                <span>ID {family.id}</span>
              </article>
            )) : <p className="fp-empty-text">가족 그룹이 없습니다.</p>}
          </div>
        </section>

        <section className="fp-card fp-admin-panel span-2">
          <h3>React 이관 상태</h3>
          <div className="fp-admin-menu-grid">
            {migratedMenus.map((menu) => (
              <article key={menu}>
                <strong>{menu}</strong>
                <span>React 페이지 연결</span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}
