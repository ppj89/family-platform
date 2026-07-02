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
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
      {children}
    </svg>
  )
}

const menuItems: MenuItem[] = [
  {
    label: '홈',
    icon: (
      <MenuSvg>
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
        <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </MenuSvg>
    ),
  },
  {
    label: '캘린더',
    icon: (
      <MenuSvg>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
        <path d="M16 14h.01" />
        <path d="M8 18h.01" />
        <path d="M12 18h.01" />
        <path d="M16 18h.01" />
      </MenuSvg>
    ),
  },
  {
    label: '가계부',
    icon: (
      <MenuSvg>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" />
        <path d="M3 11h3c.8 0 1.6.3 2.1.9l1.1.9c1.6 1.6 4.1 1.6 5.7 0l1.1-.9c.5-.5 1.3-.9 2.1-.9H21" />
      </MenuSvg>
    ),
  },
  {
    label: '여행',
    icon: (
      <MenuSvg>
        <path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0" />
        <circle cx="12" cy="8" r="2" />
        <path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712" />
      </MenuSvg>
    ),
  },
  {
    label: '육아',
    icon: (
      <MenuSvg>
        <path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" />
        <path d="M15 12h.01" />
        <path d="M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1" />
        <path d="M9 12h.01" />
      </MenuSvg>
    ),
  },
  {
    label: '일기',
    icon: (
      <MenuSvg>
        <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
        <path d="M14 2v5a1 1 0 0 0 1 1h5" />
        <path d="M10 9H8" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
      </MenuSvg>
    ),
  },
  {
    label: '가족그룹',
    icon: (
      <MenuSvg>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <path d="M16 3.128a4 4 0 0 1 0 7.744" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <circle cx="9" cy="7" r="4" />
      </MenuSvg>
    ),
  },
  {
    label: '맛집',
    icon: (
      <MenuSvg>
        <path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0" />
        <circle cx="12" cy="8" r="2" />
        <path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712" />
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
        <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
        <circle cx="12" cy="12" r="3" />
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
  const pageEyebrow = activeMenu === '홈'
    ? '오늘의 가족 기록'
    : activeMenu === '관리자'
      ? '권한과 설정 관리'
      : activeMenu === '가계부' || activeMenu === '여행'
        ? ''
        : '가족 공유 운영'

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
            {pageEyebrow ? <span className="fp-eyebrow">{pageEyebrow}</span> : null}
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
