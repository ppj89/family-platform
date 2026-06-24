import { useMemo, useState } from 'react'
import HomePage from './features/home/pages/HomePage'
import CalendarPage from './features/calendar/pages/CalendarPage'
import LedgerPage from './features/ledger/pages/LedgerPage'
import TravelPage from './features/travel/pages/TravelPage'
import BabyPage from './features/baby/pages/BabyPage'
import DiaryPage from './features/diary/pages/DiaryPage'
import FamilyPage from './features/family/pages/FamilyPage'
import RestaurantPage from './features/restaurant/pages/RestaurantPage'
import CommunityPage from './features/community/pages/CommunityPage'
import AdminPage from './features/admin/pages/AdminPage'
import { NotificationBell } from './shared/components/NotificationBell'
import { getStoredUser, hasAuthToken } from './shared/api/auth'
import './app.css'

const menuItems = ['홈', '캘린더', '가계부', '여행', '육아', '일기', '가족그룹', '맛집', '커뮤니티', '관리자']

function LegacyNotice({ label }: { label: string }) {
  return (
    <section className="fp-card fp-empty-panel">
      <h2>{label}</h2>
      <p>이 메뉴는 아직 React 이관 전입니다. 캘린더 검증 후 순서대로 옮깁니다.</p>
    </section>
  )
}

export default function App() {
  const [activeMenu, setActiveMenu] = useState('홈')
  const user = useMemo(() => getStoredUser(), [])

  if (!hasAuthToken()) {
    return (
      <main className="fp-auth-bridge">
        <section className="fp-card">
          <h1>로그인이 필요합니다</h1>
          <p>React 이관 화면은 로그인 세션이 있을 때 확인할 수 있습니다.</p>
          <button
            className="fp-button fp-button-primary"
            type="button"
            onClick={() => {
              window.localStorage.removeItem('family-platform-react-migration')
              window.location.href = '/'
            }}
          >
            로그인 화면으로 이동
          </button>
        </section>
      </main>
    )
  }

  return (
    <div className="fp-shell">
      <aside className="fp-sidebar">
        <div className="fp-brand">
          <span>FP</span>
          <div>
            <strong>Family Platform</strong>
            <small>가족 운영 워크스페이스</small>
          </div>
        </div>
        <nav className="fp-nav" aria-label="주 메뉴">
          {menuItems.map((item) => (
            <button
              className={item === activeMenu ? 'active' : ''}
              key={item}
              type="button"
              onClick={() => setActiveMenu(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>
      <main className="fp-main">
        <header className="fp-topbar">
          <div>
            <span className="fp-eyebrow">가족 공유 운영</span>
            <h1>{activeMenu}</h1>
          </div>
          <div className="fp-topbar-actions">
            <NotificationBell />
            <button className="fp-topbar-button" type="button">내 정보</button>
            <button
              className="fp-topbar-button"
              type="button"
              onClick={() => {
                window.localStorage.removeItem('family-platform-access-token')
                window.sessionStorage.removeItem('family-platform-access-token')
                window.localStorage.removeItem('family-platform-react-migration')
                window.location.href = '/'
              }}
            >
              로그아웃
            </button>
          </div>
        </header>
        <div className="fp-user-line">{user?.nickname || user?.email || '사용자'}</div>
        {activeMenu === '홈' ? <HomePage /> : null}
        {activeMenu === '캘린더' ? <CalendarPage /> : null}
        {activeMenu === '가계부' ? <LedgerPage /> : null}
        {activeMenu === '여행' ? <TravelPage /> : null}
        {activeMenu === '육아' ? <BabyPage /> : null}
        {activeMenu === '일기' ? <DiaryPage /> : null}
        {activeMenu === '가족그룹' ? <FamilyPage /> : null}
        {activeMenu === '맛집' ? <RestaurantPage /> : null}
        {activeMenu === '커뮤니티' ? <CommunityPage /> : null}
        {activeMenu === '관리자' ? <AdminPage /> : null}
        {activeMenu !== '홈' && activeMenu !== '캘린더' && activeMenu !== '가계부' && activeMenu !== '여행' && activeMenu !== '육아' && activeMenu !== '일기' && activeMenu !== '가족그룹' && activeMenu !== '맛집' && activeMenu !== '커뮤니티' && activeMenu !== '관리자' ? <LegacyNotice label={activeMenu} /> : null}
      </main>
    </div>
  )
}
