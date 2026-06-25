import { useState, type ReactNode } from 'react'
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
import { hasAuthToken } from './shared/api/auth'
import './app.css'

const menuItems = [
  { key: '홈', icon: 'home' },
  { key: '캘린더', icon: 'calendar' },
  { key: '가계부', icon: 'ledger' },
  { key: '여행', icon: 'travel' },
  { key: '육아', icon: 'baby' },
  { key: '일기', icon: 'diary' },
  { key: '가족그룹', icon: 'family' },
  { key: '맛집', icon: 'place' },
  { key: '커뮤니티', icon: 'community' },
  { key: '관리자', icon: 'admin' },
] as const

function NavIcon({ name }: { name: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  }
  const paths: Record<string, ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10.5V20h5v-5h4v5h5v-9.5" /></>,
    calendar: <><path d="M7 3v4M17 3v4" /><path d="M4 8h16" /><rect x="4" y="5" width="16" height="16" rx="2.5" /></>,
    ledger: <><path d="M5 7h14M5 12h14M5 17h9" /><rect x="3" y="4" width="18" height="16" rx="2.5" /></>,
    travel: <><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
    baby: <><circle cx="12" cy="12" r="8" /><path d="M9.2 10.5h.01M14.8 10.5h.01M9 15c1.6 1.2 4.4 1.2 6 0M12 4.5c0 1.6-1.3 2.8-2.8 2.8" /></>,
    diary: <><path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M15 3v5h5M8 13h8M8 17h6" /></>,
    family: <><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M3.5 20c.6-3.2 2.1-5 4.5-5s3.9 1.8 4.5 5M11.5 20c.6-3.2 2.1-5 4.5-5 2.1 0 3.5 1.4 4.2 4" /></>,
    place: <><path d="M12 21s7-4.8 7-11a7 7 0 0 0-14 0c0 6.2 7 11 7 11Z" /><path d="M9.5 10.5h5M10.5 13.5h3" /></>,
    community: <><path d="M7 8h10M7 12h7" /><path d="M5 19.5V18H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-4 1.5Z" /></>,
    admin: <><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6l-8-3Z" /><path d="M9 12l2 2 4-5" /></>,
  }
  return <svg className="fp-nav-icon" {...common}>{paths[name]}</svg>
}

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
              className={item.key === activeMenu ? 'active' : ''}
              key={item.key}
              type="button"
              onClick={() => setActiveMenu(item.key)}
            >
              <NavIcon name={item.icon} />
              <span>{item.key}</span>
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
            <button className="fp-icon-button" type="button" aria-label="테마">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 14.4A7.8 7.8 0 0 1 9.6 3a8.6 8.6 0 1 0 11.4 11.4Z" />
              </svg>
            </button>
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
