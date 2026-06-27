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
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M6.5 10.5V20h4.2v-5.7h2.6V20h4.2v-9.5" />
      </MenuSvg>
    ),
  },
  {
    label: '캘린더',
    icon: (
      <MenuSvg>
        <path d="M7 3.7v3M17 3.7v3M4.8 9.1h14.4" />
        <rect width="16.8" height="16.2" x="3.6" y="5.2" rx="2.8" />
        <path d="M8.1 13h.1M12 13h.1M15.9 13h.1M8.1 16.6h.1M12 16.6h.1M15.9 16.6h.1" />
      </MenuSvg>
    ),
  },
  {
    label: '가계부',
    icon: (
      <MenuSvg>
        <rect width="16.4" height="13.6" x="3.8" y="5.2" rx="2" />
        <path d="m4.5 7 7.5 5.2L19.5 7" />
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
        <path d="M16.7 7.2a5.3 5.3 0 1 0 1.4 6.8" />
        <path d="M18.4 6.2c.5.2 1.2.8 1.2 1.8 0 1.4-1.2 2.1-2.4 2.1h-1.1" />
        <path d="M9.8 13.2c.8.7 2.5.7 3.3 0" />
        <path d="M9.2 10h.1M14.6 10h.1" />
      </MenuSvg>
    ),
  },
  {
    label: '일기',
    icon: (
      <MenuSvg>
        <path d="M6.5 3.8h7.7l3.3 3.4v13H6.5z" />
        <path d="M14 3.8v3.7h3.5M9.2 11.2h5.6M9.2 14.4h5.6M9.2 17.6h3.2" />
      </MenuSvg>
    ),
  },
  {
    label: '가족그룹',
    icon: (
      <MenuSvg>
        <circle cx="8.2" cy="8.4" r="3" />
        <circle cx="16.1" cy="9.1" r="2.5" />
        <path d="M3.8 19.8c.5-3 2.2-5 4.4-5s3.9 2 4.4 5" />
        <path d="M13.7 15.4c2.2.2 3.9 1.7 4.5 4.4" />
      </MenuSvg>
    ),
  },
  {
    label: '맛집',
    icon: (
      <MenuSvg>
        <path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11Z" />
        <path d="M10.6 8.2v4.4M13.5 8.2v4.4M10.5 10.4h3.1" />
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
