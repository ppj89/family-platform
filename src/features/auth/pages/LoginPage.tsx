import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../../shared/api/client'
import type { ApiError } from '../../../shared/api/client'
import { clearAuthSession, storeAuthSession } from '../../../shared/api/auth'
import type { AuthSessionResponse } from '../../../shared/api/auth'
import { ToastMessage } from '../../../shared/components/ToastMessage'
import { LoginFields, RegisterFields } from '../components/AuthModeFields'
import {
  createFindEmailFormState,
  createInquiryFormState,
  createLoginFormState,
  createRegisterFormState,
  createResetPasswordFormState,
  createResetRequestFormState,
} from '../types/formState'
import './login.css'

type AuthMode = 'login' | 'register'
type AuthTheme = 'light' | 'dark'
type RecoveryMode = 'find-email' | 'reset-request' | 'reset-password' | 'inquiry'
type SsoProvider = 'naver' | 'kakao' | 'google'
type NicknameCheckState = 'idle' | 'checking' | 'available' | 'unavailable' | 'error'

interface SsoProviderInfo {
  provider: string
  configured?: boolean
  startUrl?: string
}

interface FindEmailAccount {
  email?: string
  loginProvider?: string
}

const rememberedEmailKey = 'family-platform-remember-email'
const autoLoginKey = 'family-platform-auto-login'
const authThemeKey = 'family-platform-auth-theme'
const providerOrder: SsoProvider[] = ['naver', 'kakao', 'google']
const providerLabels: Record<SsoProvider, string> = {
  naver: '네이버 로그인',
  kakao: '카카오 로그인',
  google: '구글 로그인',
}
const providerDisplayNames: Record<string, string> = {
  naver: '네이버',
  kakao: '카카오',
  google: '구글',
  password: '이메일',
  admin: '관리자',
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
  return (
    message.includes('active session') ||
    message.includes('duplicate') ||
    message.includes('session') ||
    message.includes('이미 로그인된 세션') ||
    message.includes('로그인된 세션') ||
    message.includes('세션이 있습니다')
  )
}

function getErrorMessage(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as ApiError).status) : 0
  const message = error instanceof Error ? String(error.message || '') : ''
  if (status) {
    if (status === 401) {
      return '이메일 또는 비밀번호를 확인해주세요.'
    }
    if (status === 409) {
      return '이미 로그인된 세션이 있습니다.'
    }
    return message || '요청을 처리하지 못했습니다.'
  }
  return message || '요청을 처리하지 못했습니다.'
}

function isValidNicknameValue(value: string) {
  return /^[가-힣A-Za-z0-9]{1,12}$/.test(value.trim())
}

function formatFoundAccount(account: FindEmailAccount) {
  const provider = (account.loginProvider || 'password').toLowerCase()
  const providerName = providerDisplayNames[provider] || provider
  const email = account.email?.trim()
  if (provider === 'password' || provider === 'admin') {
    return email ? `${providerName}: ${email}` : providerName
  }
  return email ? `${providerName} 계정: ${email}` : `${providerName} 계정`
}

export function LoginPage() {
  const rememberedEmail = useMemo(() => window.localStorage.getItem(rememberedEmailKey) || '', [])
  const initialTheme = useMemo<AuthTheme>(() => {
    const stored = window.localStorage.getItem(authThemeKey)
    if (stored === 'dark' || stored === 'light') return stored
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
  }, [])
  const resetToken = useMemo(() => new URLSearchParams(window.location.search).get('resetToken') || '', [])
  const [mode, setMode] = useState<AuthMode>('login')
  const [theme, setTheme] = useState<AuthTheme>(initialTheme)
  const [loginForm, setLoginForm] = useState(() => createLoginFormState(rememberedEmail))
  const [registerForm, setRegisterForm] = useState(() => createRegisterFormState())
  const [nicknameCheckState, setNicknameCheckState] = useState<NicknameCheckState>('idle')
  const [nicknameCheckMessage, setNicknameCheckMessage] = useState('')
  const [nicknameCheckedValue, setNicknameCheckedValue] = useState('')
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode | null>(resetToken ? 'reset-password' : null)
  const [findEmailForm, setFindEmailForm] = useState(() => createFindEmailFormState())
  const [resetRequestForm, setResetRequestForm] = useState(() => createResetRequestFormState())
  const [resetPasswordForm, setResetPasswordForm] = useState(() => createResetPasswordFormState())
  const [inquiryForm, setInquiryForm] = useState(() => createInquiryFormState())
  const [recoveryResult, setRecoveryResult] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(Boolean(rememberedEmail))
  const [autoLogin, setAutoLogin] = useState(window.localStorage.getItem(autoLoginKey) === 'true')
  const [requiredConsent, setRequiredConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [providers, setProviders] = useState<Record<string, SsoProviderInfo>>({})
  const [sessionConfirmOpen, setSessionConfirmOpen] = useState(false)

  function showToast(nextMessage: string) {
    setToastMessage(nextMessage)
  }

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

  useEffect(() => {
    window.localStorage.setItem(authThemeKey, theme)
  }, [theme])

  function resetMode(nextMode: AuthMode) {
    setMode(nextMode)
    setRecoveryMode(null)
    setRequiredConsent(false)
    setNicknameCheckState('idle')
    setNicknameCheckMessage('')
    setNicknameCheckedValue('')
  }

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  function openRecovery(nextMode: RecoveryMode) {
    setRecoveryMode(nextMode)
    setRecoveryResult('')
  }

  function closeRecovery() {
    setRecoveryMode(null)
    setRecoveryResult('')
    if (resetToken) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }

  function handleNicknameChange(value: string) {
    setRegisterForm((current) => ({ ...current, nickname: value }))
    if (value.trim() !== nicknameCheckedValue) {
      setNicknameCheckState('idle')
      setNicknameCheckMessage('')
      setNicknameCheckedValue('')
    }
  }

  async function checkNickname() {
    const value = registerForm.nickname.trim()
    if (!value) {
      setNicknameCheckState('error')
      setNicknameCheckMessage('닉네임을 입력해주세요.')
      return
    }
    if (!isValidNicknameValue(value)) {
      setNicknameCheckState('error')
      setNicknameCheckMessage('닉네임은 한글, 영문, 숫자 12자 이내로 입력해주세요.')
      return
    }
    setNicknameCheckState('checking')
    setNicknameCheckMessage('닉네임을 확인하고 있습니다.')
    try {
      const response = await apiRequest<{ available?: boolean; exists?: boolean; nickname?: string }>('/auth/nickname/check', {
        method: 'POST',
        body: { nickname: value },
      })
      const available = response.available ?? !response.exists
      if (available) {
        setNicknameCheckState('available')
        setNicknameCheckMessage('사용할 수 있는 닉네임입니다.')
        setNicknameCheckedValue(value)
      } else {
        setNicknameCheckState('unavailable')
        setNicknameCheckMessage('이미 사용 중인 닉네임입니다.')
        setNicknameCheckedValue('')
      }
    } catch (error) {
      setNicknameCheckState('error')
      setNicknameCheckMessage(getErrorMessage(error))
      setNicknameCheckedValue('')
    }
  }

  function recoveryTitle(currentMode: RecoveryMode) {
    if (currentMode === 'find-email') return '아이디 찾기'
    if (currentMode === 'reset-password') return '새 비밀번호 설정'
    if (currentMode === 'inquiry') return '관리자 문의'
    return '비밀번호 찾기'
  }

  async function submitRecovery() {
    if (!recoveryMode || recoveryBusy) {
      return
    }
    setRecoveryResult('')

    if (recoveryMode === 'find-email') {
      const value = findEmailForm.nickname.trim()
      if (!value) {
        setRecoveryResult('닉네임을 입력해주세요.')
        return
      }
      setRecoveryBusy(true)
      try {
        const response = await apiRequest<{ emails?: string[]; accounts?: FindEmailAccount[] }>('/auth/recovery/find-email', {
          method: 'POST',
          body: { nickname: value },
        })
        const accounts = response.accounts?.length ? response.accounts : (response.emails || []).map((foundEmail) => ({ email: foundEmail, loginProvider: 'password' }))
        setRecoveryResult(accounts.length ? `가입 계정: ${accounts.map(formatFoundAccount).join(', ')}` : '일치하는 계정을 찾지 못했습니다.')
      } catch (error) {
        setRecoveryResult(getErrorMessage(error))
      } finally {
        setRecoveryBusy(false)
      }
      return
    }

    if (recoveryMode === 'reset-request') {
      const value = resetRequestForm.email.trim()
      if (!value) {
        setRecoveryResult('이메일을 입력해주세요.')
        return
      }
      setRecoveryBusy(true)
      try {
        await apiRequest('/auth/recovery/password/request', {
          method: 'POST',
          body: { email: value },
        })
        setRecoveryResult('비밀번호 재설정 메일을 보냈습니다.')
      } catch (error) {
        setRecoveryResult(getErrorMessage(error))
      } finally {
        setRecoveryBusy(false)
      }
      return
    }

    if (recoveryMode === 'reset-password') {
      if (resetPasswordForm.password.length < 8) {
        setRecoveryResult('비밀번호는 8자 이상 입력해주세요.')
        return
      }
      if (resetPasswordForm.password !== resetPasswordForm.passwordConfirm) {
        setRecoveryResult('비밀번호 확인이 일치하지 않습니다.')
        return
      }
      setRecoveryBusy(true)
      try {
        await apiRequest('/auth/recovery/password/reset', {
          method: 'POST',
          body: { token: resetToken, password: resetPasswordForm.password },
        })
        window.history.replaceState({}, document.title, window.location.pathname)
        setRecoveryResult('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.')
      } catch (error) {
        setRecoveryResult(getErrorMessage(error))
      } finally {
        setRecoveryBusy(false)
      }
      return
    }

    if (!inquiryForm.email.trim() && !inquiryForm.contact.trim()) {
      setRecoveryResult('회신받을 이메일이나 연락처를 입력해주세요.')
      return
    }
    setRecoveryBusy(true)
    try {
      await apiRequest('/auth/recovery/inquiry', {
        method: 'POST',
        body: {
          email: inquiryForm.email.trim(),
          nickname: inquiryForm.nickname.trim(),
          contact: inquiryForm.contact.trim(),
          recoveryType: '관리자 계정 복구 문의',
          message: inquiryForm.message.trim(),
        },
      })
      setRecoveryResult('관리자 문의가 접수되었습니다.')
    } catch (error) {
      setRecoveryResult(getErrorMessage(error))
    } finally {
      setRecoveryBusy(false)
    }
  }

  async function submitAuth(forceLogin = false) {
    if (busy) {
      return
    }
    const activeEmail = mode === 'login' ? loginForm.email : registerForm.email
    const activePassword = mode === 'login' ? loginForm.password : registerForm.password

    if (!activeEmail.trim()) {
      showToast('이메일을 입력해주세요.')
      return
    }
    if (!activePassword) {
      showToast('비밀번호를 입력해주세요.')
      return
    }
    if (mode === 'register') {
      if (!registerForm.nickname.trim()) {
        showToast('닉네임을 입력해주세요.')
        return
      }
      if (!isValidNicknameValue(registerForm.nickname)) {
        showToast('닉네임은 한글, 영문, 숫자 12자 이내로 입력해주세요.')
        return
      }
      if (nicknameCheckState !== 'available' || nicknameCheckedValue !== registerForm.nickname.trim()) {
        showToast('닉네임 중복확인을 해주세요.')
        return
      }
      if (registerForm.password !== registerForm.passwordConfirm) {
        showToast('비밀번호가 일치하지 않습니다.')
        return
      }
      if (!requiredConsent) {
        showToast('필수 약관에 동의해주세요.')
        return
      }
    }

    setBusy(true)
    try {
      const response = await apiRequest<AuthSessionResponse>(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body:
          mode === 'login'
            ? { email: loginForm.email.trim(), password: loginForm.password, forceLogin }
            : {
                email: registerForm.email.trim(),
                nickname: registerForm.nickname.trim(),
                password: registerForm.password,
              },
      })

      if (mode === 'register' && response.emailVerificationRequired) {
        showToast('인증 메일을 보냈습니다. 메일에서 인증을 완료한 뒤 로그인해주세요.')
        setMode('login')
        setLoginForm((current) => ({ ...current, email: registerForm.email.trim(), password: '' }))
        setRegisterForm(createRegisterFormState())
        setRequiredConsent(false)
        setNicknameCheckState('idle')
        setNicknameCheckMessage('')
        setNicknameCheckedValue('')
        return
      }

      if (mode === 'login') {
        if (rememberEmail) {
          window.localStorage.setItem(rememberedEmailKey, loginForm.email.trim())
        } else {
          window.localStorage.removeItem(rememberedEmailKey)
        }
      }
      window.localStorage.setItem(autoLoginKey, autoLogin ? 'true' : 'false')

      storeAuthSession(response, autoLogin)
      window.location.reload()
    } catch (error) {
      if (mode === 'login' && !forceLogin && isDuplicateSession(error)) {
        setSessionConfirmOpen(true)
      } else {
        showToast(getErrorMessage(error))
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
      showToast(`${providerLabels[provider]} 설정이 필요합니다.`)
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
    <main className={`auth-shell theme-${theme}`}>
      <section className="auth-layout">
        <div className="auth-visual" data-auth-landing-ready="true">
          <div className="brand auth-brand">
            <div className="brand-mark">FP</div>
            <div>
              <p>Family Platform</p>
              <span>함께 쓰는 워크스페이스</span>
            </div>
          </div>
          <section className="auth-copy">
            <span className="auth-kicker">가족, 커플, 지인을 위한 하나의 공간</span>
            <p>일정, 가계부, 여행, 육아, 일기를 필요한 사람들과 메뉴별로 공유하고 관리합니다.</p>
          </section>
        </div>

        <form className="auth-card" data-auth-mode={mode} onSubmit={handleSubmit}>
          <button className="auth-theme-button" type="button" aria-label={theme === 'dark' ? '라이트모드' : '다크모드'} onClick={toggleTheme}>
            {theme === 'dark' ? '라이트모드' : '다크모드'}
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
            {mode === 'register' ? <p className="auth-verification-notice">회원가입 신청 후 이메일 인증이 필요합니다.</p> : null}
          </div>

          {mode === 'login' ? (
            <LoginFields
              autoLogin={autoLogin}
              loginForm={loginForm}
              rememberEmail={rememberEmail}
              setAutoLogin={setAutoLogin}
              setLoginForm={setLoginForm}
              setRememberEmail={setRememberEmail}
            />
          ) : (
            <RegisterFields
              checkNickname={checkNickname}
              handleNicknameChange={handleNicknameChange}
              nicknameCheckMessage={nicknameCheckMessage}
              nicknameCheckState={nicknameCheckState}
              registerForm={registerForm}
              requiredConsent={requiredConsent}
              setRegisterForm={setRegisterForm}
              setRequiredConsent={setRequiredConsent}
            />
          )}

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
            <button type="button" onClick={() => openRecovery('reset-request')}>
              비밀번호 찾기
            </button>
            <button type="button" onClick={() => openRecovery('find-email')}>
              아이디 찾기
            </button>
            <button type="button" onClick={() => openRecovery('inquiry')}>
              관리자 문의
            </button>
          </div>
        </form>
      </section>

      {recoveryMode ? (
        <div className="auth-recovery-backdrop" role="presentation">
          <section className="auth-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-recovery-title">
            <div className="auth-recovery-header">
              <strong id="auth-recovery-title">{recoveryTitle(recoveryMode)}</strong>
              <button type="button" aria-label="닫기" onClick={closeRecovery}>
                X
              </button>
            </div>
            {recoveryMode === 'inquiry' ? (
              <>
                <p className="auth-recovery-guide">이메일이나 닉네임이 기억나지 않을 때 관리자에게 계정 확인을 요청합니다.</p>
                <div className="auth-recovery-grid">
                  <label>
                    <span>이메일</span>
                    <input value={inquiryForm.email} onChange={(event) => setInquiryForm((current) => ({ ...current, email: event.target.value }))} type="email" placeholder="email@example.com" />
                  </label>
                  <label>
                    <span>닉네임</span>
                    <input value={inquiryForm.nickname} onChange={(event) => setInquiryForm((current) => ({ ...current, nickname: event.target.value }))} type="text" placeholder="닉네임" />
                  </label>
                </div>
                <label>
                  <span>연락받을 정보</span>
                  <input value={inquiryForm.contact} onChange={(event) => setInquiryForm((current) => ({ ...current, contact: event.target.value }))} type="text" placeholder="회신받을 이메일이나 연락처" />
                </label>
                <label>
                  <span>문의 내용</span>
                  <textarea value={inquiryForm.message} onChange={(event) => setInquiryForm((current) => ({ ...current, message: event.target.value }))} rows={4} placeholder="기억나는 계정 정보나 상황을 적어주세요." />
                </label>
              </>
            ) : recoveryMode === 'find-email' ? (
              <>
                <p className="auth-recovery-guide">닉네임으로 가입 계정과 로그인 방식을 확인합니다. 소셜 계정은 해당 SSO 버튼으로 로그인해주세요.</p>
                <label>
                  <span>닉네임</span>
                  <input value={findEmailForm.nickname} onChange={(event) => setFindEmailForm((current) => ({ ...current, nickname: event.target.value }))} type="text" placeholder="닉네임" />
                </label>
              </>
            ) : recoveryMode === 'reset-password' ? (
              <>
                <p className="auth-recovery-guide">메일로 받은 링크에서 새 비밀번호를 설정합니다.</p>
                <label>
                  <span>새 비밀번호</span>
                  <input
                    value={resetPasswordForm.password}
                    onChange={(event) => setResetPasswordForm((current) => ({ ...current, password: event.target.value }))}
                    type="password"
                    autoComplete="new-password"
                    placeholder="8자 이상"
                  />
                </label>
                <label>
                  <span>새 비밀번호 확인</span>
                  <input
                    value={resetPasswordForm.passwordConfirm}
                    onChange={(event) => setResetPasswordForm((current) => ({ ...current, passwordConfirm: event.target.value }))}
                    type="password"
                    autoComplete="new-password"
                    placeholder="비밀번호 다시 입력"
                  />
                </label>
              </>
            ) : (
              <>
                <p className="auth-recovery-guide">소셜 계정으로 가입했다면 네이버, 카카오, 구글 로그인을 먼저 이용해주세요.</p>
                <label>
                  <span>이메일</span>
                  <input value={resetRequestForm.email} onChange={(event) => setResetRequestForm((current) => ({ ...current, email: event.target.value }))} type="email" placeholder="email@example.com" />
                </label>
              </>
            )}
            {recoveryResult ? <div className="auth-recovery-result">{recoveryResult}</div> : null}
            <button className="auth-recovery-submit" type="button" onClick={submitRecovery} disabled={recoveryBusy}>
              {recoveryBusy ? '처리 중' : recoveryTitle(recoveryMode)}
            </button>
          </section>
        </div>
      ) : null}

      {sessionConfirmOpen ? (
        <div className="auth-session-backdrop" role="presentation">
          <section className="auth-session-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-session-title">
            <button className="auth-session-close" type="button" aria-label="닫기" onClick={closeSessionConfirm}>
              X
            </button>
            <h2 id="auth-session-title">이미 로그인 되어 있습니다.</h2>
            <p>기존 로그인을 종료하고 다시 로그인할까요?</p>
            <div className="auth-session-actions">
              <button type="button" onClick={closeSessionConfirm}>
                취소
              </button>
              <button type="button" onClick={forceLogin}>
                확인
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />
    </main>
  )
}
