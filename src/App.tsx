import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Style, StatusBar } from '@capacitor/status-bar'
import { CgChevronLeft, CgChevronRight } from 'react-icons/cg'
import { HiChevronDown, HiChevronUp, HiOutlineX } from 'react-icons/hi'
import { PiReceiptLight } from 'react-icons/pi'
import HomePage from './features/home/pages/HomePage'
import CalendarPage from './features/calendar/pages/CalendarPage'
import LedgerPage from './features/ledger/pages/LedgerPage'
import TravelPage from './features/travel/pages/TravelPage'
import BabyPage from './features/baby/pages/BabyPage'
import DiaryPage from './features/diary/pages/DiaryPage'
import FamilyPage from './features/family/pages/FamilyPage'
import RestaurantPage from './features/restaurant/pages/RestaurantPage'
import CommunityPage from './features/community/pages/CommunityPage'
import HotDealPage from './features/hotdeal/pages/HotDealPage'
import AdminPage from './features/admin/pages/AdminPage'
import { LoginPage } from './features/auth/pages/LoginPage'
import { useTodayCalendarNotifications } from './features/calendar/notifications/useTodayCalendarNotifications'
import { initializePushNotifications } from './features/calendar/notifications/pushNotifications'
import { NotificationBell } from './shared/components/NotificationBell'
import { ConfirmDialog, ToastMessage } from './shared/components'
import { clearAuthSession, getStoredUser, hasAuthToken, normalizeAuthUser, storeAuthSession, type AuthSessionResponse, type StoredUser } from './shared/api/auth'
import { apiActionMessage, apiRequest, markApiDataViewQuery, setApiDataViewMenuKey } from './shared/api/client'
import { listReadableFamilies, selectReadableFamily } from './shared/api/family'
import './app.css'

type AppTheme = 'light' | 'dark'

type MenuItem = {
  label: string
  icon: ReactNode
  iconClass?: string
}

const appThemeKey = 'family-platform-app-theme'
// Native notification plugins are initialized only after the Android release
// has passed device validation. Running their permission/registration flow
// immediately after login can terminate affected Android builds.
const nativeNotificationBootstrapEnabled = false
const analyticsMenuKeys: Record<string, string> = {
  홈: 'home',
  캘린더: 'calendar',
  가계부: 'ledger',
  여행: 'travel',
  육아: 'baby',
  일기: 'diary',
  그룹관리: 'family',
  맛집: 'restaurant',
  커뮤니티: 'community',
  특가: 'hotdeal',
  설정: 'admin',
}

function initialAppTheme(): AppTheme {
  const stored = window.localStorage.getItem(appThemeKey)
  if (stored === 'dark' || stored === 'light') return stored
  return 'light'
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
    iconClass: 'ledger',
    icon: <PiReceiptLight />,
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
    label: '그룹관리',
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
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
        <path d="M7 2v20" />
        <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
      </MenuSvg>
    ),
  },
  {
    label: '커뮤니티',
    icon: <span className="fp-community-letter">C</span>,
    iconClass: 'community',
  },
  {
    label: '특가',
    icon: (
      <MenuSvg>
        <path d="M20.5 13.5 13.5 20.5a2.1 2.1 0 0 1-3 0L3.5 13.5V3.5h10l7 7a2.1 2.1 0 0 1 0 3Z" />
        <circle cx="8.5" cy="8.5" r="1" />
      </MenuSvg>
    ),
    iconClass: 'hotdeal',
  },
  {
    label: '설정',
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

function providerLabel(provider?: string) {
  const key = (provider || '').toLowerCase()
  if (key === 'naver') return '네이버'
  if (key === 'kakao') return '카카오'
  if (key === 'google') return '구글'
  if (key === 'admin') return '관리자 ID'
  return '이메일'
}

function accountRoleLabel(platformAdmin?: boolean, familyRole?: string) {
  if (platformAdmin) return '플랫폼 관리자'
  return familyRole === 'FAMILY_ADMIN' ? '그룹관리자' : '구성원'
}

function AccountInfoDialog({
  familyRole,
  loading,
  withdrawBusy,
  user,
  onClose,
  onWithdraw,
  morningSchedulePushEnabled,
  onMorningSchedulePushEnabledChange,
}: {
  familyRole?: string
  loading: boolean
  withdrawBusy: boolean
  user: StoredUser | null
  onClose: () => void
  onWithdraw: () => void
  morningSchedulePushEnabled: boolean
  onMorningSchedulePushEnabledChange: (enabled: boolean) => void
}) {
  return (
    <div className="fp-confirm-backdrop" role="presentation">
      <section className="fp-confirm-dialog fp-account-dialog" role="dialog" aria-modal="true" aria-labelledby="fp-account-title" aria-busy={loading}>
        {loading ? <div className="fp-loading-blocker" role="status" aria-label="내정보 불러오는 중" /> : null}
        <header>
          <h2 id="fp-account-title">내정보</h2>
          <button type="button" aria-label="닫기" onClick={onClose}>
            <HiOutlineX aria-hidden="true" />
          </button>
        </header>
        <dl className="fp-account-info-list">
          <div>
            <dt>로그인 방식</dt>
            <dd>{providerLabel(user?.loginProvider)}</dd>
          </div>
          <div>
            <dt>이메일/아이디</dt>
            <dd>{user?.email || user?.loginEmail || '-'}</dd>
          </div>
          <div>
            <dt>닉네임</dt>
            <dd>{user?.nickname || '-'}</dd>
          </div>
          <div>
            <dt>권한</dt>
            <dd>{accountRoleLabel(user?.platformAdmin, familyRole)}</dd>
          </div>
        </dl>
        <div className="fp-account-push-setting">
          <span>오전 9시 일정 알림</span>
          <label className="fp-account-push-checkbox">
            <input
              type="checkbox"
              aria-label="오전 9시 일정 알림 받기"
              checked={morningSchedulePushEnabled}
              disabled={loading}
              onChange={(event) => onMorningSchedulePushEnabledChange(event.target.checked)}
            />
          </label>
        </div>
        <div className="fp-account-danger-zone">
          <button className="fp-button fp-button-danger" type="button" disabled={loading || withdrawBusy} onClick={onWithdraw}>
            회원탈퇴
          </button>
        </div>
      </section>
    </div>
  )
}

export default function App() {
  const [activeMenu, setActiveMenu] = useState('홈')
  const [, setAuthRevision] = useState(0)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => window.localStorage.getItem('family-platform-sidebar-collapsed') === 'true',
  )
  const [accountInfo, setAccountInfo] = useState<StoredUser | null>(getStoredUser())
  const [accountFamilyRole, setAccountFamilyRole] = useState('')
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [isAccountLoading, setIsAccountLoading] = useState(false)
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [isWithdrawConfirmOpen, setIsWithdrawConfirmOpen] = useState(false)
  const [isWithdrawBusy, setIsWithdrawBusy] = useState(false)
  const [morningSchedulePushEnabled, setMorningSchedulePushEnabled] = useState(true)
  const [toastMessage, setToastMessage] = useState('')
  const [theme, setTheme] = useState<AppTheme>(initialAppTheme)
  const sessionRestoreRecorded = useRef(false)
  const authenticated = hasAuthToken()
  // 자식 화면의 데이터 조회 effect보다 먼저 현재 메뉴 컨텍스트를 설정한다.
  setApiDataViewMenuKey(authenticated ? analyticsMenuKeys[activeMenu] : '')
  useTodayCalendarNotifications(authenticated && nativeNotificationBootstrapEnabled)
  useEffect(() => {
    // Every popup/dialog in the app shares the same "*-backdrop" naming
    // convention (see the body[class$="backdrop"] safe-area rule in
    // app.css). Watch for one being mounted anywhere and lock the page's
    // own scroll behind it — a fixed-position overlay alone doesn't stop
    // a touch drag on it from rubber-band-scrolling the page underneath.
    const applyLock = () => {
      const hasOpenDialog = Boolean(document.querySelector('[class$="backdrop"]'))
      document.body.classList.toggle('fp-scroll-locked', hasOpenDialog)
    }
    applyLock()
    const observer = new MutationObserver(applyLock)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!nativeNotificationBootstrapEnabled) return
    void initializePushNotifications(authenticated)
  }, [authenticated])
  useEffect(() => {
    if (!authenticated || sessionRestoreRecorded.current) return
    sessionRestoreRecorded.current = true

    // A password/SSO login is already recorded by the login endpoint. Skip
    // only that immediate reload.  The marker is timestamped so a WebView that
    // was closed before React mounted cannot suppress a later automatic-login
    // history entry indefinitely.
    const justCompletedAt = Number(window.sessionStorage.getItem('family-platform-login-just-completed') || '0')
    if (justCompletedAt > 0 && Date.now() - justCompletedAt < 30_000) {
      window.sessionStorage.removeItem('family-platform-login-just-completed')
      return
    }
    window.sessionStorage.removeItem('family-platform-login-just-completed')

    let cancelled = false
    const recordAutomaticLogin = async () => {
      // A mobile WebView can briefly be online before its API connection is
      // ready. Retry the dedicated history request instead of silently losing
      // that app-start login event.
      for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
        try {
          await apiRequest<null>('/auth/session/restore', { method: 'POST' })
          return
        } catch {
          if (attempt < 2) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, (attempt + 1) * 1_000))
          }
        }
      }
    }
    void recordAutomaticLogin()
    return () => {
      cancelled = true
    }
  }, [authenticated])
  useEffect(() => {
    if (!authenticated) {
      setAccountFamilyRole('')
      return
    }

    let active = true
    void (async () => {
      try {
        // Keep the authenticated family context in sync before feature pages
        // request their data. This prevents a fresh native app launch from
        // falling back to familyId=0 while the group page is being opened.
        const response = await apiRequest<AuthSessionResponse>('/auth/me')
        const user = normalizeAuthUser(response)
        storeAuthSession(response, Boolean(window.localStorage.getItem('family-platform-access-token')))
        if (!active) return
        // auth/me already contains the authenticated user's current group.
        // Do not wait for the separate group-list request before updating the
        // page state: a delayed request previously left Group Management on
        // the empty "create group" screen.
        setAccountInfo(user)
        setAccountFamilyRole(user.familyRole || '')
        try {
          const selectedFamily = selectReadableFamily(await listReadableFamilies())
          if (active) setAccountFamilyRole(selectedFamily?.role || user.familyRole || '')
        } catch {
          // The authenticated group context above remains usable as a safe
          // fallback while the separate list endpoint is unavailable.
        }
      } catch {
        // The feature page will show its own actionable error. Do not clear
        // a still-valid local session because a transient network request
        // failed during initial hydration.
      }
    })()

    return () => {
      active = false
    }
  }, [authenticated])
  useEffect(() => {
    if (!authenticated) return
    const isDataQueryControl = (element: Element | null) => /조회|검색|불러오기/.test((element?.textContent || '').replace(/\s/g, ''))
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (isDataQueryControl(target?.closest('button, [role="button"]') || null)) markApiDataViewQuery()
    }
    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null
      const submitter = event.submitter instanceof Element ? event.submitter : null
      if (isDataQueryControl(submitter) || isDataQueryControl(form?.querySelector('button[type="submit"]') || null)) markApiDataViewQuery()
    }
    document.addEventListener('click', handleClick, true)
    document.addEventListener('submit', handleSubmit, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('submit', handleSubmit, true)
    }
  }, [authenticated])
  useEffect(() => {
    function handleAuthInvalid() {
      setToastMessage('')
      setAuthRevision((value) => value + 1)
    }

    window.addEventListener('family-platform-auth-invalid', handleAuthInvalid)
    return () => window.removeEventListener('family-platform-auth-invalid', handleAuthInvalid)
  }, [])

  useEffect(() => {
    const openCommunity = () => {
      const communityMenu = Object.entries(analyticsMenuKeys).find(([, menuKey]) => menuKey === 'community')?.[0]
      if (communityMenu) setActiveMenu(communityMenu)
    }
    window.addEventListener('family-platform-community-open', openCommunity)
    return () => window.removeEventListener('family-platform-community-open', openCommunity)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.body.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem(appThemeKey, theme)

    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('StatusBar')) {
      // Android 15/16 force edge-to-edge and ignore setBackgroundColor, so the
      // status bar area is painted by the app's own CSS (see .fp-shell
      // safe-area padding in app.css). Only the icon/text color can actually
      // be controlled here, and it must follow the active theme.
      void StatusBar.setOverlaysWebView({ overlay: true })
      // Style.Dark = dark status bar surface -> light/white icons.
      // Style.Light = light status bar surface -> dark icons.
      // This was previously inverted, so the icons/clock rendered the same
      // color as the (now opaque) body::before status-bar strip and were
      // invisible: white-on-white in light theme, dark-on-dark in dark theme.
      void StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light })
    }
  }, [theme])

  useEffect(() => {
    // CSS env(safe-area-inset-top) is not reliably reported inside an
    // embedded Android WebView (unlike a real mobile browser), so don't
    // depend on it alone. Ask the native StatusBar plugin for the real,
    // measured status bar height and publish it as a CSS variable; app.css
    // prefers this variable and only falls back to env() when it is unset
    // (web/other platforms).
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('StatusBar')) return

    let cancelled = false
    const applyStatusBarHeight = () => {
      StatusBar.getInfo()
        .then((info) => {
          if (cancelled || !info.height) return
          document.documentElement.style.setProperty('--status-bar-height', `${info.height}px`)
        })
        .catch(() => undefined)
    }
    applyStatusBarHeight()
    // The height can be 0 on the very first frame before the window finishes
    // laying out edge-to-edge; check again shortly after mount.
    const retryTimer = window.setTimeout(applyStatusBarHeight, 500)
    return () => {
      cancelled = true
      window.clearTimeout(retryTimer)
    }
  }, [])

  if (!authenticated) {
    return <LoginPage />
  }

  async function openAccountInfo() {
    setIsAccountOpen(true)
    setIsAccountLoading(true)
    setAccountFamilyRole('')
    try {
      const response = await apiRequest<AuthSessionResponse>('/auth/me')
      const user = normalizeAuthUser(response)
      setAccountInfo(user)
      storeAuthSession(response, Boolean(window.localStorage.getItem('family-platform-access-token')))
      try {
        const selectedFamily = selectReadableFamily(await listReadableFamilies())
        setAccountFamilyRole(selectedFamily?.role || user.familyRole || '')
      } catch {
        setAccountFamilyRole(user.familyRole || '')
      }
      try {
        const preference = await apiRequest<{ morningSchedulePushEnabled: boolean }>('/notification-preferences')
        setMorningSchedulePushEnabled(preference.morningSchedulePushEnabled)
      } catch {
        setMorningSchedulePushEnabled(true)
      }
    } catch (error) {
      setToastMessage(apiActionMessage(error, '내정보를 불러오지 못했습니다.'))
    } finally {
      setIsAccountLoading(false)
    }
  }

  async function logout() {
    setIsLogoutConfirmOpen(false)
    try {
      await apiRequest<null>('/auth/logout', { method: 'POST' })
    } catch {
      // 서버 세션이 이미 만료된 경우에도 클라이언트 세션은 정리합니다.
    } finally {
      clearAuthSession()
      window.localStorage.removeItem('family-platform-react-migration')
      window.location.href = '/'
    }
  }

  async function withdrawAccount() {
    setIsWithdrawBusy(true)
    try {
      await apiRequest<null>('/auth/me', { method: 'DELETE' })
      clearAuthSession()
      window.localStorage.removeItem('family-platform-react-migration')
      window.location.href = '/'
    } catch (error) {
      setToastMessage(apiActionMessage(error, '회원탈퇴를 처리하지 못했습니다.'))
      setIsWithdrawConfirmOpen(false)
    } finally {
      setIsWithdrawBusy(false)
    }
  }

  function toggleSidebar() {
    setIsSidebarCollapsed((previous) => {
      const next = !previous
      window.localStorage.setItem('family-platform-sidebar-collapsed', String(next))
      return next
    })
  }

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  function handleAdminUnauthorized() {
    setToastMessage('잘못된 접근 입니다.')
    setActiveMenu('홈')
  }

  return (
    <div className={['fp-shell', `theme-${theme}`, isSidebarCollapsed ? 'sidebar-collapsed' : ''].filter(Boolean).join(' ')}>
      <aside className="fp-sidebar">
        <div className="fp-brand">
          <span>FP</span>
          <div>
            <strong>함께 쓰는 기록들</strong>
            <small>함께 쓰는 워크스페이스</small>
          </div>
        </div>
        <nav className="fp-nav" aria-label="주 메뉴">
          {menuItems.map((item) => (
            <button
              className={item.label === activeMenu ? 'active' : ''}
              key={item.label}
              type="button"
              title={item.label}
              onClick={() => setActiveMenu(item.label)}
            >
              <span className={['fp-nav-icon', item.iconClass].filter(Boolean).join(' ')}>{item.icon}</span>
              <span className="fp-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <button
          className="fp-sidebar-toggle"
          type="button"
          aria-expanded={!isSidebarCollapsed}
          aria-label={isSidebarCollapsed ? '메뉴 열기' : '메뉴 닫기'}
          title={isSidebarCollapsed ? '메뉴 열기' : '메뉴 닫기'}
          onClick={toggleSidebar}
        >
          <span className="fp-sidebar-toggle-icon" aria-hidden="true">
            <span className="fp-sidebar-toggle-icon-desktop">
              {isSidebarCollapsed ? <CgChevronRight /> : <CgChevronLeft />}
            </span>
            <span className="fp-sidebar-toggle-icon-mobile">
              {isSidebarCollapsed ? <HiChevronDown /> : <HiChevronUp />}
            </span>
          </span>
          <span className="fp-sidebar-toggle-text">{isSidebarCollapsed ? '메뉴 열기' : '메뉴 닫기'}</span>
        </button>
      </aside>
      <main className="fp-main">
        <header className="fp-topbar">
          <div>
            <h1>{activeMenu}</h1>
          </div>
          <div className="fp-topbar-actions">
            <button
              className="fp-topbar-button fp-icon-button"
              type="button"
              aria-label={theme === 'dark' ? '라이트모드' : '다크모드'}
              title={theme === 'dark' ? '라이트모드' : '다크모드'}
              onClick={toggleTheme}
            >
              <svg className="fp-action-icon" aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            </button>
            <NotificationBell />
            <button className="fp-topbar-button" type="button" onClick={openAccountInfo}>내정보</button>
            <button
              className="fp-topbar-button"
              type="button"
              onClick={() => setIsLogoutConfirmOpen(true)}
            >
              로그아웃
            </button>
          </div>
        </header>
        {activeMenu === '홈' ? <HomePage onNavigate={setActiveMenu} /> : null}
        {activeMenu === '캘린더' ? <CalendarPage /> : null}
        {activeMenu === '가계부' ? <LedgerPage /> : null}
        {activeMenu === '여행' ? <TravelPage /> : null}
        {activeMenu === '육아' ? <BabyPage /> : null}
        {activeMenu === '일기' ? <DiaryPage /> : null}
        {activeMenu === '그룹관리' ? <FamilyPage currentUser={accountInfo} /> : null}
        {activeMenu === '맛집' ? <RestaurantPage /> : null}
        {activeMenu === '커뮤니티' ? <CommunityPage /> : null}
        {activeMenu === '특가' ? <HotDealPage /> : null}
        {activeMenu === '설정' ? <AdminPage onUnauthorized={handleAdminUnauthorized} /> : null}
        {activeMenu !== '홈' && activeMenu !== '캘린더' && activeMenu !== '가계부' && activeMenu !== '여행' && activeMenu !== '육아' && activeMenu !== '일기' && activeMenu !== '그룹관리' && activeMenu !== '맛집' && activeMenu !== '커뮤니티' && activeMenu !== '특가' && activeMenu !== '설정' ? <LegacyNotice label={activeMenu} /> : null}
      </main>
      {isAccountOpen ? (
        <AccountInfoDialog
          familyRole={accountFamilyRole}
          loading={isAccountLoading}
          withdrawBusy={isWithdrawBusy}
          user={accountInfo}
          onClose={() => setIsAccountOpen(false)}
          onWithdraw={() => setIsWithdrawConfirmOpen(true)}
          morningSchedulePushEnabled={morningSchedulePushEnabled}
          onMorningSchedulePushEnabledChange={(enabled) => {
            setMorningSchedulePushEnabled(enabled)
            void apiRequest('/notification-preferences', { method: 'PATCH', body: { morningSchedulePushEnabled: enabled } }).catch((error) => {
              setMorningSchedulePushEnabled(!enabled)
              setToastMessage(apiActionMessage(error, '오전 9시 일정 알림 설정을 저장하지 못했습니다.'))
            })
          }}
        />
      ) : null}
      {isLogoutConfirmOpen ? (
        <ConfirmDialog
          title="로그아웃"
          body="로그아웃하시겠습니까?"
          confirmLabel="로그아웃"
          onConfirm={logout}
          onCancel={() => setIsLogoutConfirmOpen(false)}
        />
      ) : null}
      {isWithdrawConfirmOpen ? (
        <ConfirmDialog
          title="회원탈퇴"
          body="회원탈퇴하면 현재 계정으로 다시 로그인할 수 없습니다. 작성한 기록 이력은 보관하고, 그룹 공유에서는 탈퇴한 계정의 멤버십을 정리합니다. 진행하시겠습니까?"
          confirmLabel="탈퇴"
          busy={isWithdrawBusy}
          busyLabel="탈퇴 처리 중"
          danger
          onConfirm={withdrawAccount}
          onCancel={() => {
            if (!isWithdrawBusy) setIsWithdrawConfirmOpen(false)
          }}
        />
      ) : null}
      <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />
    </div>
  )
}
