import { type ReactNode, useState } from 'react'
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
import { LoginPage } from './features/auth/pages/LoginPage'
import { NotificationBell } from './shared/components/NotificationBell'
import { hasAuthToken } from './shared/api/auth'
import './app.css'

type MenuItem = {
  label: string
  icon: ReactNode
  iconClass?: string
}

function MenuSvg({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      {children}
    </svg>
  )
}

const menuItems: MenuItem[] = [
  {
    label: '홈',
    icon: (
      <MenuSvg>
        <path d="m3 9 9-7 9 7" />
        <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
      </MenuSvg>
    ),
  },
  {
    label: '캘린더',
    icon: (
      <MenuSvg>
        <path d="M8 2v4M16 2v4M3 10h18" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
      </MenuSvg>
    ),
  },
  {
    label: '가계부',
    icon: (
      <MenuSvg>
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
        <path d="M18 12h.01" />
      </MenuSvg>
    ),
  },
  {
    label: '여행',
    icon: (
      <MenuSvg>
        <path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11Z" />
        <circle cx="12" cy="10" r="2.2" />
      </MenuSvg>
    ),
  },
  {
    label: '육아',
    icon: (
      <MenuSvg>
        <path d="M9 12h.01M15 12h.01" />
        <path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" />
        <path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 1 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c1 0 1.9.2 2.8.5" />
        <path d="M16.5 3.5c1.7 0 3 1.3 3 3 0 1.4-1 2.6-2.3 2.9" />
      </MenuSvg>
    ),
  },
  {
    label: '일기',
    icon: (
      <MenuSvg>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8" />
      </MenuSvg>
    ),
  },
  {
    label: '가족그룹',
    icon: (
      <MenuSvg>
        <path d="M18 21a8 8 0 0 0-16 0" />
        <circle cx="10" cy="8" r="5" />
        <path d="M22 20c0-3.4-2-6.3-5-7.6" />
        <path d="M17 3.3a5 5 0 0 1 0 9.4" />
      </MenuSvg>
    ),
  },
  {
    label: '맛집',
    icon: (
      <MenuSvg>
        <path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11Z" />
        <circle cx="12" cy="10" r="2.2" />
      </MenuSvg>
    ),
  },
  {
    label: '커뮤니티',
    icon: <span className="fp-community-letter">C</span>,
    iconClass: 'community',
  },
  {
    label: '관리자',
    icon: (
      <MenuSvg>
        <path d="M9.8 4.3 10.4 3h3.2l.6 1.3 1.5.6 1.3-.5 2.2 2.2-.5 1.3.6 1.5 1.3.6v3.2l-1.3.6-.6 1.5.5 1.3-2.2 2.2-1.3-.5-1.5.6-.6 1.3h-3.2l-.6-1.3-1.5-.6-1.3.5-2.2-2.2.5-1.3-.6-1.5-1.3-.6V10l1.3-.6.6-1.5-.5-1.3 2.2-2.2 1.3.5z" />
        <circle cx="12" cy="11.6" r="3" />
      </MenuSvg>
    ),
  },
]

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
  const pageEyebrow = activeMenu === '홈' ? '오늘의 가족 기록' : '가족 공유 운영'

  if (!hasAuthToken()) {
    return <LoginPage />
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
              className={item.label === activeMenu ? 'active' : ''}
              key={item.label}
              type="button"
              onClick={() => setActiveMenu(item.label)}
            >
              <span className={['fp-nav-icon', item.iconClass].filter(Boolean).join(' ')}>{item.icon}</span>
              <span className="fp-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="fp-main">
        <header className="fp-topbar">
          <div>
            <span className="fp-eyebrow">{pageEyebrow}</span>
            <h1>{activeMenu}</h1>
          </div>
          <div className="fp-topbar-actions">
            <button className="fp-topbar-button fp-icon-button" type="button" aria-label="다크모드">
              <svg className="fp-action-icon" aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
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
