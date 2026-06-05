import { useState } from 'react'
import { Baby, CalendarDays, FileText, Home, MapPinned, Settings, Users, WalletCards } from 'lucide-react'
import FamilyCalendar from './components/FamilyCalendar'
import './App.css'

type MenuKey = 'dashboard' | 'calendar' | 'ledger' | 'travel' | 'baby' | 'diary' | 'family' | 'restaurant' | 'admin'

const menus: Array<{ key: MenuKey; label: string; caption: string; icon: typeof Home }> = [
  { key: 'dashboard', label: '홈', caption: '오늘의 가족 기록', icon: Home },
  { key: 'calendar', label: '캘린더', caption: '가족 일정과 기념일 공유', icon: CalendarDays },
  { key: 'ledger', label: '가계부', caption: '수입, 지출, 카드 내역', icon: WalletCards },
  { key: 'travel', label: '여행', caption: '장소, 동선, 비용', icon: MapPinned },
  { key: 'baby', label: '육아', caption: '수유, 배변, 성장 기록', icon: Baby },
  { key: 'diary', label: '일기', caption: '사진, 날씨, 가족 일기', icon: FileText },
  { key: 'family', label: '가족그룹', caption: '공유와 권한 관리', icon: Users },
  { key: 'restaurant', label: '맛집', caption: '가족 맛집 리스트', icon: MapPinned },
  { key: 'admin', label: '관리자', caption: '메뉴와 공통코드 관리', icon: Settings },
]

export default function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>('calendar')
  const current = menus.find((menu) => menu.key === activeMenu) ?? menus[0]

  return (
    <div className="clean-shell">
      <aside className="clean-sidebar">
        <div className="clean-brand">
          <strong>FP</strong>
          <span>Family Platform</span>
        </div>
        <nav className="clean-nav" aria-label="주 메뉴">
          {menus.map((menu) => {
            const Icon = menu.icon
            return (
              <button className={activeMenu === menu.key ? 'active' : ''} key={menu.key} onClick={() => setActiveMenu(menu.key)} type="button">
                <Icon size={19} />
                <span>{menu.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>
      <main className="clean-workspace">
        <header className="clean-topbar">
          <div>
            <span>{current.caption}</span>
            <h1>{current.label}</h1>
          </div>
        </header>
        {activeMenu === 'calendar' ? (
          <FamilyCalendar />
        ) : (
          <section className="legacy-frame-card">
            <iframe src="/legacy/index.html" title="기존 가족 플랫폼 화면" />
          </section>
        )}
      </main>
    </div>
  )
}
