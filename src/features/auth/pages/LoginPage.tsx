import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../../shared/api/client'
import type { ApiError } from '../../../shared/api/client'
import { clearAuthSession, storeAuthSession } from '../../../shared/api/auth'
import type { AuthSessionResponse } from '../../../shared/api/auth'
import './login.css'

type AuthMode = 'login' | 'register'
type SsoProvider = 'naver' | 'kakao' | 'google'

interface SsoProviderInfo {
  provider: string
  configured?: boolean
  startUrl?: string
}

const rememberedEmailKey = 'family-platform-remember-email'
const autoLoginKey = 'family-platform-auto-login'
const providerOrder: SsoProvider[] = ['naver', 'kakao', 'google']
const providerLabels: Record<SsoProvider, string> = {
  naver: '네이버 로그인',
  kakao: '카카오 로그인',
  google: '구글 로그인',
}

function getApiBaseUrl() {
  const appWindow = window as Window & { FAMILY_PLATFORM_API_BASE_URL?: string }
  return appWindow.FAMILY_PLATFORM_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api'
}

function resolveStartUrl(provider: SsoProvider, configured?: SsoProviderInfo) {
  const startUrl = configured?.startUrl
  if (startUrl) {
    return startUrl.startsWith('http') ? startUrl : `${getApiBaseUrl()}${startUrl.startsWith('/') ? startUrl : `/${startUrl}`}`
  }
  return `${getApiBaseUrl()}/auth/oauth/${provider}/start`
}

function isDuplicateSession(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as ApiError).status) : 0
  if (status !== 409) {
    return false
  }
  const message = error instanceof Error ? String(error.message || '').toLowerCase() : ''
  return message.includes('active session') || message.includes('duplicate') || message.includes('session')
}

function getErrorMessage(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as ApiError).status) : 0
  if (status) {
    if (status === 401) {
      return '이메일 또는 비밀번호를 확인해주세요.'
    }
    if (status === 409) {
      return '이미 로그인된 세션이 있습니다.'
    }
    return error instanceof Error ? error.message || '요청을 처리하지 못했습니다.' : '요청을 처리하지 못했습니다.'
  }
  return '요청을 처리하지 못했습니다.'
}

export function LoginPage() {
  const rememberedEmail = useMemo(() => window.localStorage.getItem(rememberedEmailKey) || '', [])
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState(rememberedEmail)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [rememberEmail, setRememberEmail] = useState(Boolean(rememberedEmail))
  const [autoLogin, setAutoLogin] = useState(window.localStorage.getItem(autoLoginKey) === 'true')
  const [requiredConsent, setRequiredConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [providers, setProviders] = useState<Record<string, SsoProviderInfo>>({})
  const [sessionConfirmOpen, setSessionConfirmOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    apiRequest<SsoProviderInfo[]>('/auth/oauth/providers')
      .then((items) => {
        if (!mounted) {
          return
        }
        setProviders(
          (items || []).reduce<Record<string, SsoProviderInfo>>((acc, item) => {
            acc[item.provider] = item
            return acc
          }, {}),
        )
      })
      .catch(() => {
        if (mounted) {
          setProviders({})
        }
      })
    return () => {
      mounted = false
    }
  }, [])

  function resetMode(nextMode: AuthMode) {
    setMode(nextMode)
    setMessage('')
    setPassword('')
    setPasswordConfirm('')
    setRequiredConsent(false)
  }

  async function submitAuth(forceLogin = false) {
    if (busy) {
      return
    }
    setMessage('')

    if (!email.trim()) {
      setMessage('이메일을 입력해주세요.')
      return
    }
    if (!password) {
      setMessage('비밀번호를 입력해주세요.')
      return
    }
    if (mode === 'register') {
      if (!nickname.trim()) {
        setMessage('닉네임을 입력해주세요.')
        return
      }
      if (password !== passwordConfirm) {
        setMessage('비밀번호가 일치하지 않습니다.')
        return
      }
      if (!requiredConsent) {
        setMessage('필수 약관에 동의해주세요.')
        return
      }
    }

    setBusy(true)
    try {
      const response = await apiRequest<AuthSessionResponse>(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body:
          mode === 'login'
            ? { email: email.trim(), password, forceLogin }
            : {
                email: email.trim(),
                nickname: nickname.trim(),
                password,
                passwordConfirm,
                requiredConsent,
                forceLogin,
              },
      })

      if (rememberEmail) {
        window.localStorage.setItem(rememberedEmailKey, email.trim())
      } else {
        window.localStorage.removeItem(rememberedEmailKey)
      }
      window.localStorage.setItem(autoLoginKey, autoLogin ? 'true' : 'false')

      storeAuthSession(response, autoLogin)
      window.location.reload()
    } catch (error) {
      if (mode === 'login' && !forceLogin && isDuplicateSession(error)) {
        setSessionConfirmOpen(true)
        setMessage('')
      } else {
        setMessage(getErrorMessage(error))
      }
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitAuth(false)
  }

  function startSso(provider: SsoProvider) {
    const providerInfo = providers[provider]
    if (providerInfo && providerInfo.configured === false) {
      setMessage(`${providerLabels[provider]} 설정이 필요합니다.`)
      return
    }
    window.location.href = resolveStartUrl(provider, providerInfo)
  }

  function closeSessionConfirm() {
    setSessionConfirmOpen(false)
  }

  function forceLogin() {
    clearAuthSession()
    setSessionConfirmOpen(false)
    void submitAuth(true)
  }

  return (
    <main className="auth-shell theme-light">
      <section className="auth-layout">
        <div className="auth-visual" data-auth-landing-ready="true">
          <div className="brand auth-brand">
            <div className="brand-mark">FP</div>
            <div>
              <p>Family Platform</p>
              <span>가족 운영 워크스페이스</span>
            </div>
          </div>
          <section className="auth-copy">
            <span className="auth-kicker">가족을 위한 하나의 공간</span>
            <h1>
              가족 기록을
              <br />
              한곳에서 편하게
            </h1>
            <p>일정, 가계부, 여행, 육아, 일기를 가족끼리 공유하고 권한에 맞게 관리합니다.</p>
          </section>
          <div className="auth-preview">
            <div>
              <strong>공유 캘린더</strong>
              <span>생일, 병원, 학교, 가족 일정을 한 달력에서 확인</span>
            </div>
            <div>
              <strong>가족 가계부</strong>
              <span>지출과 수입을 메뉴별로 정리하고 기간별로 조회</span>
            </div>
            <div>
              <strong>육아 기록</strong>
              <span>수유, 배변, 키, 몸무게 변화를 기록</span>
            </div>
          </div>
        </div>

        <form className="auth-card" data-auth-mode={mode} onSubmit={handleSubmit}>
          <button className="auth-theme-button" type="button" aria-label="다크모드">
            다크모드
          </button>
          <div className="auth-tabs" role="tablist" aria-label="로그인 모드">
            <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => resetMode('login')}>
              로그인
            </button>
            <button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => resetMode('register')}>
              회원가입
            </button>
          </div>
          <div className="auth-heading">
            <strong>{mode === 'login' ? '로그인' : '회원가입'}</strong>
            <p>{mode === 'login' ? '가입한 이메일 또는 관리자 아이디로 접속합니다.' : '가족 운영 워크스페이스 계정을 만듭니다.'}</p>
          </div>

          <label>
            <span>이메일</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} inputMode="email" placeholder="이메일" type="text" autoComplete="username" />
          </label>
          {mode === 'register' ? (
            <label>
              <span>닉네임</span>
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="닉네임" type="text" autoComplete="nickname" />
            </label>
          ) : null}
          <label>
            <span>비밀번호</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8자 이상"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
            />
          </label>
          {mode === 'register' ? (
            <label>
              <span>비밀번호 확인</span>
              <input
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="비밀번호 재입력"
                type="password"
                autoComplete="new-password"
                minLength={8}
              />
            </label>
          ) : null}

          {mode === 'login' ? (
            <div className="auth-login-preferences">
              <label className={rememberEmail ? 'is-checked' : ''}>
                <input checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} type="checkbox" />
                <span>아이디 저장</span>
              </label>
              <label className={autoLogin ? 'is-checked' : ''}>
                <input checked={autoLogin} onChange={(event) => setAutoLogin(event.target.checked)} type="checkbox" />
                <span>자동 로그인</span>
              </label>
            </div>
          ) : (
            <label className="auth-required-consent">
              <input checked={requiredConsent} onChange={(event) => setRequiredConsent(event.target.checked)} type="checkbox" />
              <span>필수 약관과 개인정보 처리방침에 동의합니다.</span>
            </label>
          )}

          {message ? <div className="auth-message">{message}</div> : null}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? '처리 중' : mode === 'login' ? '로그인' : '회원가입'}
          </button>

          <div className="auth-sso-block">
            <div className="auth-sso-divider">SSO 로그인</div>
            {providerOrder.map((provider) => (
              <button key={provider} type="button" className={`auth-sso-button ${provider}`} onClick={() => startSso(provider)}>
                {providerLabels[provider]}
              </button>
            ))}
          </div>

          <div className="auth-helper">
            <button type="button">비밀번호 찾기</button>
            <button type="button">아이디 찾기</button>
            <button type="button">관리자 문의</button>
          </div>
        </form>
      </section>

      {sessionConfirmOpen ? (
        <div className="auth-session-backdrop" role="presentation">
          <section className="auth-session-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-session-title">
            <button className="auth-session-close" type="button" aria-label="닫기" onClick={closeSessionConfirm}>
              X
            </button>
            <h2 id="auth-session-title">이미 로그인된 세션이 있습니다</h2>
            <p>기존 세션을 종료하고 다시 로그인할까요?</p>
            <div className="auth-session-actions">
              <button type="button" onClick={closeSessionConfirm}>
                취소
              </button>
              <button type="button" onClick={forceLogin}>
                기존 세션 종료
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
