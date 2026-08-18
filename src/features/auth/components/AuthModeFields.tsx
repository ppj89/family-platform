import type { Dispatch, SetStateAction } from 'react'
import type { LoginFormState, RegisterFormState } from '../types/formState'

interface LoginFieldsProps {
  autoLogin: boolean
  loginForm: LoginFormState
  rememberEmail: boolean
  setAutoLogin: Dispatch<SetStateAction<boolean>>
  setLoginForm: Dispatch<SetStateAction<LoginFormState>>
  setRememberEmail: Dispatch<SetStateAction<boolean>>
}

interface RegisterFieldsProps {
  checkNickname: () => void
  disabled?: boolean
  handleNicknameChange: (value: string) => void
  nicknameCheckMessage: string
  nicknameCheckState: string
  registerForm: RegisterFormState
  requiredConsent: boolean
  setRegisterForm: Dispatch<SetStateAction<RegisterFormState>>
  setRequiredConsent: Dispatch<SetStateAction<boolean>>
}

export function LoginFields({ autoLogin, loginForm, rememberEmail, setAutoLogin, setLoginForm, setRememberEmail }: LoginFieldsProps) {
  return (
    <>
      <label>
        <span>이메일</span>
        <input
          value={loginForm.email}
          onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
          inputMode="email"
          placeholder="이메일"
          type="text"
          autoComplete="username"
        />
      </label>
      <label>
        <span>비밀번호</span>
        <input
          value={loginForm.password}
          onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
          placeholder="8자 이상"
          type="password"
          autoComplete="current-password"
          minLength={8}
        />
      </label>
      <div className="auth-login-preferences">
        <label className={`auth-login-preference-check${rememberEmail ? ' is-checked' : ''}`}>
          <input checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} type="checkbox" />
          <span>아이디 저장</span>
        </label>
        <label className={`auth-login-preference-check${autoLogin ? ' is-checked' : ''}`}>
          <input checked={autoLogin} onChange={(event) => setAutoLogin(event.target.checked)} type="checkbox" />
          <span>자동 로그인</span>
        </label>
      </div>
    </>
  )
}

export function RegisterFields({
  checkNickname,
  disabled = false,
  handleNicknameChange,
  nicknameCheckMessage,
  nicknameCheckState,
  registerForm,
  requiredConsent,
  setRegisterForm,
  setRequiredConsent,
}: RegisterFieldsProps) {
  return (
    <>
      <label>
        <span>이메일</span>
        <input
          value={registerForm.email}
          onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))}
          disabled={disabled}
          inputMode="email"
          placeholder="이메일"
          type="text"
          autoComplete="username"
        />
      </label>
      <label className="auth-nickname-field">
        <span>닉네임</span>
        <div className="auth-nickname-row">
          <input value={registerForm.nickname} onChange={(event) => handleNicknameChange(event.target.value)} disabled={disabled} placeholder="닉네임" type="text" autoComplete="nickname" maxLength={12} />
          <button type="button" onClick={checkNickname} disabled={disabled || nicknameCheckState === 'checking'}>
            {nicknameCheckState === 'checking' ? '확인 중' : '중복확인'}
          </button>
        </div>
        {nicknameCheckMessage ? <small className={`auth-nickname-status ${nicknameCheckState}`}>{nicknameCheckMessage}</small> : null}
      </label>
      <label>
        <span>비밀번호</span>
        <input
          value={registerForm.password}
          onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))}
          disabled={disabled}
          placeholder="8자 이상"
          type="password"
          autoComplete="new-password"
          minLength={8}
        />
      </label>
      <label>
        <span>비밀번호 확인</span>
        <input
          value={registerForm.passwordConfirm}
          onChange={(event) => setRegisterForm((current) => ({ ...current, passwordConfirm: event.target.value }))}
          disabled={disabled}
          placeholder="비밀번호 재입력"
          type="password"
          autoComplete="new-password"
          minLength={8}
        />
      </label>
      <label className="auth-required-consent">
        <input checked={requiredConsent} onChange={(event) => setRequiredConsent(event.target.checked)} disabled={disabled} type="checkbox" />
        <span>필수 약관과 개인정보 처리방침에 동의합니다.</span>
      </label>
    </>
  )
}
