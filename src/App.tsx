import { FormEvent, useEffect, useState } from 'react'
import { Baby, CalendarDays, FileText, Home, MapPinned, MessageSquareText, Moon, Settings, Sun, Users, WalletCards } from 'lucide-react'
import FamilyCalendar from './components/FamilyCalendar'
import { ApiError, authToken } from './api/client'
import { AuthResponse, findAccountEmail, login, logout, me, register, requestLogout, requestPasswordReset, resetPassword } from './api/auth'
import './App.css'

type MenuKey = 'dashboard' | 'calendar' | 'ledger' | 'travel' | 'baby' | 'diary' | 'family' | 'restaurant' | 'community' | 'admin'
type AuthMode = 'login' | 'register' | 'find-email' | 'reset-request' | 'reset-password'

const menus: Array<{ key: MenuKey; label: string; caption: string; icon: typeof Home }> = [
  { key: 'dashboard', label: '홈', caption: '오늘의 가족 기록', icon: Home },
  { key: 'calendar', label: '캘린더', caption: '', icon: CalendarDays },
  { key: 'ledger', label: '가계부', caption: '수입, 지출, 카드 내역', icon: WalletCards },
  { key: 'travel', label: '여행', caption: '장소, 동선, 비용 기록', icon: MapPinned },
  { key: 'baby', label: '육아', caption: '수유, 배변, 성장 기록', icon: Baby },
  { key: 'diary', label: '일기', caption: '사진, 날씨, 가족 일기', icon: FileText },
  { key: 'family', label: '가족그룹', caption: '공유와 권한 관리', icon: Users },
  { key: 'restaurant', label: '맛집', caption: '가족 맛집 리스트', icon: MapPinned },
  { key: 'community', label: '커뮤니티', caption: '공지, 자유게시판, 문의사항', icon: MessageSquareText },
  { key: 'admin', label: '관리자', caption: '메뉴와 공통코드 관리', icon: Settings },
]

const initialAuthForm = {
  email: '',
  nickname: '',
  password: '',
  resetToken: '',
}

function clearLoggedOutQuery() {
  if (!window.location.search.includes('loggedOut=')) return
  const url = new URL(window.location.href)
  url.searchParams.delete('loggedOut')
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
}

function authMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403 && error.message.includes('email verification')) {
      return '이메일 인증 후 로그인할 수 있습니다. 받은 메일의 인증 링크를 확인해주세요.'
    }
    if (error.status === 409) {
      if (error.message.includes('active session')) {
        return '이미 로그인되어 있는 계정입니다.'
      }
      return '이미 가입된 이메일입니다.'
    }
    if (error.status === 423) {
      return '비밀번호를 5회 틀려 5분 동안 잠겼습니다.'
    }
    if (error.status === 401) {
      return '이메일 또는 비밀번호가 맞지 않습니다.'
    }
  }
  return error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.'
}

export default function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>('calendar')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authForm, setAuthForm] = useState(initialAuthForm)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [currentUser, setCurrentUser] = useState<AuthResponse | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const current = menus.find((menu) => menu.key === activeMenu) ?? menus[0]

  useEffect(() => {
    clearLoggedOutQuery()
    const resetToken = new URLSearchParams(window.location.search).get('resetToken')
    if (resetToken) {
      setAuthMode('reset-password')
      setAuthForm((prev) => ({ ...prev, resetToken }))
    }
  }, [])

  useEffect(() => {
    if (!authToken()) {
      setIsAuthChecking(false)
      return
    }
    me()
      .then(setCurrentUser)
      .catch(() => {
        logout()
        setCurrentUser(null)
      })
      .finally(() => setIsAuthChecking(false))
  }, [])

  function updateAuthField(field: keyof typeof initialAuthForm, value: string) {
    setAuthForm((prev) => ({ ...prev, [field]: value }))
    setAuthError('')
    setAuthNotice('')
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = authForm.email.trim()
    const nickname = authForm.nickname.trim()
    const password = authForm.password
    const resetToken = authForm.resetToken.trim()

    if (authMode === 'find-email') {
      if (!nickname) {
        setAuthError('닉네임을 입력해주세요.')
        return
      }
      setIsAuthSubmitting(true)
      setAuthError('')
      setAuthNotice('')
      try {
        const response = await findAccountEmail(nickname)
        setAuthNotice(response.emails.length ? `가입 이메일: ${response.emails.join(', ')}` : '일치하는 계정을 찾지 못했습니다.')
      } catch (error) {
        setAuthError(authMessage(error))
      } finally {
        setIsAuthSubmitting(false)
      }
      return
    }

    if (authMode === 'reset-request') {
      if (!email) {
        setAuthError('이메일을 입력해주세요.')
        return
      }
      setIsAuthSubmitting(true)
      setAuthError('')
      setAuthNotice('')
      try {
        await requestPasswordReset(email)
        setAuthNotice('비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해주세요.')
      } catch (error) {
        setAuthError(authMessage(error))
      } finally {
        setIsAuthSubmitting(false)
      }
      return
    }

    if (authMode === 'reset-password') {
      if (!resetToken) {
        setAuthError('비밀번호 재설정 토큰이 없습니다.')
        return
      }
      if (password.length < 8) {
        setAuthError('비밀번호는 8자 이상 입력해주세요.')
        return
      }
      setIsAuthSubmitting(true)
      setAuthError('')
      setAuthNotice('')
      try {
        await resetPassword(resetToken, password)
        window.history.replaceState({}, document.title, window.location.pathname)
        setAuthMode('login')
        setAuthForm(initialAuthForm)
        setAuthNotice('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.')
      } catch (error) {
        setAuthError(authMessage(error))
      } finally {
        setIsAuthSubmitting(false)
      }
      return
    }

    if (!email) {
      setAuthError('이메일을 입력해주세요.')
      return
    }
    if (authMode === 'register' && !nickname) {
      setAuthError('닉네임을 입력해주세요.')
      return
    }
    if (password.length < 8) {
      setAuthError('비밀번호는 8자 이상 입력해주세요.')
      return
    }

    setIsAuthSubmitting(true)
    setAuthError('')
    setAuthNotice('')
    try {
      const response =
        authMode === 'register'
          ? await register({ email, nickname, password })
          : await login({ email, password })
      if (response.emailVerificationRequired) {
        setAuthMode('login')
        setAuthForm((prev) => ({ ...prev, password: '', nickname: '' }))
        setAuthNotice('회원가입되었습니다. 이메일 인증 링크를 확인한 뒤 로그인해주세요.')
        return
      }
      clearLoggedOutQuery()
      setCurrentUser(response)
      setAuthForm(initialAuthForm)
      setAuthNotice(authMode === 'register' ? '회원가입되었습니다.' : '로그인되었습니다.')
    } catch (error) {
      if (authMode === 'login' && error instanceof ApiError && error.status === 409) {
        const shouldForceLogin = window.confirm('현재 로그인이 되어있습니다. 기존 로그인을 종료하고 로그인하시겠습니까?')
        if (shouldForceLogin) {
          try {
            const response = await login({ email, password, forceLogin: true })
            clearLoggedOutQuery()
            setCurrentUser(response)
            setAuthForm(initialAuthForm)
            setAuthNotice('기존 로그인을 종료하고 로그인되었습니다.')
            return
          } catch (forceError) {
            setAuthError(authMessage(forceError))
            return
          }
        }
      }
      setAuthError(authMessage(error))
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  async function handleLogout() {
    try {
      await requestLogout()
    } catch {
      logout()
    }
    setCurrentUser(null)
    setAuthMode('login')
    clearLoggedOutQuery()
  }

  const authTitle =
    authMode === 'find-email'
      ? '아이디 찾기'
      : authMode === 'reset-request'
        ? '비밀번호 찾기'
        : authMode === 'reset-password'
          ? '새 비밀번호 설정'
          : authMode === 'login'
            ? '로그인'
            : '회원가입'
  const authDescription =
    authMode === 'find-email'
      ? '닉네임으로 가입 이메일을 확인합니다.'
      : authMode === 'reset-request'
        ? '가입 이메일로 비밀번호 재설정 링크를 보냅니다.'
        : authMode === 'reset-password'
          ? '새 비밀번호는 8자 이상 입력해주세요.'
          : authMode === 'login'
            ? '가입한 이메일과 비밀번호로 접속합니다.'
            : '닉네임은 게시글과 가족 기록에 표시됩니다.'
  const authSubmitLabel =
    authMode === 'find-email'
      ? '아이디 찾기'
      : authMode === 'reset-request'
        ? '재설정 메일 보내기'
        : authMode === 'reset-password'
          ? '비밀번호 변경'
          : authMode === 'login'
            ? '로그인'
            : '회원가입'
  const showEmailField = authMode === 'login' || authMode === 'register' || authMode === 'reset-request'
  const showPasswordField = authMode === 'login' || authMode === 'register' || authMode === 'reset-password'

  if (isAuthChecking) {
    return <div className="legacy-loading">로그인 상태를 확인하는 중입니다.</div>
  }

  if (!currentUser) {
    return (
      <div className={`auth-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
        <div className="auth-layout">
          <section className="auth-visual" aria-label="서비스 소개">
            <div className="clean-brand auth-brand">
              <strong>FP</strong>
              <span>Family Platform</span>
            </div>
            <div className="auth-copy">
              <h1>가족 일정, 기록, 돈 관리를 한 곳에서.</h1>
              <p>가계부, 캘린더, 여행, 육아, 일기와 커뮤니티까지 가족 단위 권한으로 안전하게 공유합니다.</p>
            </div>
            <div className="auth-preview" aria-hidden="true">
              <div>
                <strong>가족별 데이터 분리</strong>
                <span>다른 가족의 기록은 볼 수 없도록 가족 그룹 기준으로 관리합니다.</span>
              </div>
              <div>
                <strong>계정 보안</strong>
                <span>비밀번호 8자 이상, 5회 실패 잠금, 중복 로그인 방지를 적용합니다.</span>
              </div>
              <div>
                <strong>1인 1계정</strong>
                <span>동일 이메일은 중복 가입할 수 없습니다. SSO 연결 시 제공자 계정 기준으로 확장합니다.</span>
              </div>
            </div>
          </section>

          <form className="auth-card" onSubmit={submitAuth}>
            <button className="auth-theme-button" type="button" onClick={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              {theme === 'dark' ? '라이트' : '다크'}
            </button>

            <div className="auth-tabs" role="tablist" aria-label="로그인 회원가입 선택">
              <button className={authMode === 'login' ? 'active' : ''} type="button" onClick={() => setAuthMode('login')}>
                로그인
              </button>
              <button className={authMode === 'register' ? 'active' : ''} type="button" onClick={() => setAuthMode('register')}>
                회원가입
              </button>
            </div>

            <div className="auth-heading">
              <strong>{authTitle}</strong>
              <p>{authDescription}</p>
            </div>

            {showEmailField && (
              <label>
                <span>이메일</span>
                <input autoComplete="email" inputMode="email" placeholder="email@example.com" value={authForm.email} onChange={(event) => updateAuthField('email', event.target.value)} />
              </label>
            )}

            {(authMode === 'register' || authMode === 'find-email') && (
              <label>
                <span>닉네임</span>
                <input autoComplete="nickname" maxLength={30} placeholder="닉네임" value={authForm.nickname} onChange={(event) => updateAuthField('nickname', event.target.value)} />
              </label>
            )}

            {showPasswordField && (
              <label>
                <span>비밀번호</span>
                <input autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={8} placeholder="8자 이상" type="password" value={authForm.password} onChange={(event) => updateAuthField('password', event.target.value)} />
              </label>
            )}

            {authError && <p className="auth-message error">{authError}</p>}
            {authNotice && <p className="auth-message success">{authNotice}</p>}

            <button className="auth-submit" disabled={isAuthSubmitting} type="submit">
              {isAuthSubmitting ? '처리 중' : authSubmitLabel}
            </button>

            <div className="auth-helper">
              <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
                {authMode === 'login' ? '처음이면 회원가입' : '로그인으로 돌아가기'}
              </button>
              <button type="button" onClick={() => setAuthMode('find-email')}>
                아이디 찾기
              </button>
              <button type="button" onClick={() => setAuthMode('reset-request')}>
                비밀번호 찾기
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

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
          <div className="clean-user-actions">
            <span>{currentUser.nickname}</span>
            <button type="button" onClick={handleLogout}>
              로그아웃
            </button>
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
