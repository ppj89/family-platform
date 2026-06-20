  function apiJson(path, body) {
    return fetch(API_BASE_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (message) {
          var error = new Error(message || ('API ' + response.status))
          error.status = response.status
          error.body = message
          throw error
        })
      }
      return response.json()
    })
  }

  function apiGetJson(path) {
    return fetch(API_BASE_URL + path).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (message) {
          var error = new Error(message || ('API ' + response.status))
          error.status = response.status
          error.body = message
          throw error
        })
      }
      return response.json()
    })
  }

  function parseAuthError(error) {
    var text = String(error && error.message ? error.message : error || '')
    if (text.indexOf('nickname is already registered') >= 0) return '\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC785\uB2C8\uB2E4. \uB2E4\uB978 \uB2C9\uB124\uC784\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.'
    if (text.indexOf('nickname format invalid') >= 0) return '\uB2C9\uB124\uC784\uC740 \uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC 12\uC790\uAE4C\uC9C0 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.'
    if (text.indexOf('daily mail request limit exceeded') >= 0 || text.indexOf('429') >= 0) return '\uC624\uB298 \uC694\uCCAD \uAC00\uB2A5\uD55C \uD69F\uC218\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4. \uB0B4\uC77C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.'
    if (text.indexOf('oauth email consent required') >= 0) return '\uC911\uBCF5 \uAC00\uC785 \uBC29\uC9C0\uB97C \uC704\uD574 \uC774\uBA54\uC77C \uC81C\uACF5 \uD544\uC218 \uB3D9\uC758\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.'
    if (text.indexOf('current password is invalid') >= 0) return '\uD604\uC7AC \uBE44\uBC00\uBC88\uD638\uAC00 \uB9DE\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'
    if (text.indexOf('password changed') >= 0) return '\uBE44\uBC00\uBC88\uD638\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.'
    if (text.indexOf('locked') >= 0 || text.indexOf('423') >= 0) {
      var seconds = Number((text.match(/(\d+)\s*seconds/i) || [])[1] || 0)
      var minutes = seconds ? Math.ceil(seconds / 60) : 5
      return '\uBE44\uBC00\uBC88\uD638 5\uD68C \uC2E4\uD328\uB85C \uACC4\uC815\uC774 \uC7A0\uAE40\uCC98\uB9AC\uB410\uC2B5\uB2C8\uB2E4. ' + minutes + '\uBD84 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.'
    }
    if (text.indexOf('email verification') >= 0 || text.indexOf('403') >= 0) return '\uC774\uBA54\uC77C \uC778\uC99D \uD6C4 \uB85C\uADF8\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uBC1B\uC740 \uBA54\uC77C\uC758 \uC778\uC99D \uB9C1\uD06C\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.'
    if (text.indexOf('already registered') >= 0 || text.indexOf('email is already registered') >= 0) return '이미 가입된 이메일입니다.'
    if (text.indexOf('Invalid email or password') >= 0) return '이메일/관리자 아이디 또는 비밀번호를 확인해주세요.'
    if (text.indexOf('length >= 8') >= 0 || text.indexOf('invalid') >= 0 || text.indexOf('400') >= 0) return '이메일, 닉네임, 8자 이상 비밀번호를 확인해주세요.'
    return '로그인 처리 중 오류가 발생했습니다.'
  }

  function isEmailVerificationError(error) {
    var text = String(error && error.message ? error.message : error || '')
    return text.indexOf('email verification') >= 0 || (error && error.status === 403)
  }

  function resendVerificationEmail(email, trigger) {
    var normalized = String(email || '').trim()
    if (!normalized) {
      showPatchToast('이메일을 먼저 입력해주세요.')
      return
    }
    if (trigger) {
      trigger.disabled = true
      trigger.textContent = '전송 중...'
    }
    apiJson('/auth/verification/resend', { email: normalized })
      .then(function () {
        showPatchToast('인증 메일을 다시 요청했습니다.')
      })
      .catch(function () {
        showPatchToast('인증 메일 요청 중 오류가 발생했습니다.')
      })
      .finally(function () {
        if (trigger) {
          trigger.disabled = false
          trigger.textContent = '인증메일 다시 받기'
        }
      })
  }

  function ensureVerificationResendAction(card, email) {
    if (!card) return
    var helper = card.querySelector('.auth-helper')
    if (!helper) return
    var button = helper.querySelector('[data-auth-resend-verification]')
    if (!button) {
      button = document.createElement('button')
      button.type = 'button'
      button.dataset.authResendVerification = 'true'
      button.className = 'auth-resend-verification'
      button.textContent = '인증메일 다시 받기'
      helper.appendChild(button)
    }
    button.hidden = false
    button.dataset.email = email || ''
    button.onclick = function () {
      resendVerificationEmail(button.dataset.email || getAuthPayload(card).email, button)
    }
  }

  function getAuthMode(card) {
    if (card && card.dataset.authMode) return card.dataset.authMode
    var active = card.querySelector('.auth-tabs button.active')
    var text = getCleanText(active)
    return text.indexOf('가입') >= 0 || text.toLowerCase().indexOf('register') >= 0 ? 'register' : 'login'
  }

  function getAuthPayload(card) {
    var inputs = Array.from(card.querySelectorAll('input'))
    var emailInput = inputs.find(function (input) {
      return input.dataset.field === 'auth-email' || input.type === 'email' || /@/.test(input.value || '') || /email|mail|이메일/i.test(input.placeholder || '')
    }) || inputs[0]
    var passwordInput = inputs.find(function (input) {
      return input.dataset.field === 'auth-password' || input.type === 'password' || /비밀번호|password/i.test(input.placeholder || '')
    }) || inputs[1]
    var nicknameInput = card.querySelector('[data-field="auth-nickname"]') || inputs.find(function (input) {
      if (input === emailInput || input === passwordInput) return false
      return input.type !== 'password'
    })

    return {
      email: emailInput ? String(emailInput.value || '').trim() : '',
      password: passwordInput ? String(passwordInput.value || '') : '',
      passwordConfirm: getFieldValue(card, '[data-field="auth-password-confirm"]'),
      nickname: nicknameInput ? String(nicknameInput.value || '').trim() : ''
    }
  }

  function isRequiredConsentChecked(card) {
    var checkbox = card && card.querySelector('[data-field="auth-required-consent"]')
    return !checkbox || checkbox.checked
  }

  function nicknameInputOf(card) {
    return card && card.querySelector('[data-field="auth-nickname"]')
  }

  function nicknameRuleMessage() {
    return '\uB2C9\uB124\uC784\uC740 \uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC 12\uC790\uAE4C\uC9C0 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.'
  }

  function isValidNicknameValue(nickname) {
    return /^[\uAC00-\uD7A3A-Za-z0-9]{1,12}$/.test(String(nickname || '').trim())
  }

  function setNicknameCheckState(card, state, message) {
    var status = card && card.querySelector('[data-auth-nickname-status]')
    var input = nicknameInputOf(card)
    if (!status) return
    status.dataset.state = state || 'idle'
    status.textContent = message || ''
    if (input) {
      input.dataset.nicknameCheckValue = state === 'available' || state === 'unavailable' ? String(input.value || '').trim() : ''
      input.dataset.nicknameAvailable = state === 'available' ? 'true' : state === 'unavailable' ? 'false' : ''
    }
  }

  function isNicknameUnavailable(card, nickname) {
    var input = nicknameInputOf(card)
    return !!(input && input.dataset.nicknameAvailable === 'false' && input.dataset.nicknameCheckValue === String(nickname || '').trim())
  }

  function ensureNicknameCheckControls(card, nicknameField) {
    var input = nicknameInputOf(card)
    if (!card || !nicknameField || !input) return
    input.maxLength = 12
    input.pattern = '[\uAC00-\uD7A3A-Za-z0-9]{1,12}'
    input.title = nicknameRuleMessage()
    var row = nicknameField.querySelector('.auth-nickname-row')
    if (!row) {
      row = document.createElement('div')
      row.className = 'auth-nickname-row'
      input.insertAdjacentElement('beforebegin', row)
      row.appendChild(input)
    }
    var button = row.querySelector('[data-auth-nickname-check]')
    if (!button) {
      button = document.createElement('button')
      button.type = 'button'
      button.dataset.authNicknameCheck = 'true'
      button.textContent = '\uD655\uC778'
      row.appendChild(button)
    }
    var status = nicknameField.querySelector('[data-auth-nickname-status]')
    if (!status) {
      status = document.createElement('p')
      status.dataset.authNicknameStatus = 'true'
      status.dataset.state = 'idle'
      nicknameField.appendChild(status)
    }
    if (nicknameField.dataset.nicknameCheckReady === 'true') return
    nicknameField.dataset.nicknameCheckReady = 'true'
    input.addEventListener('input', function () {
      setNicknameCheckState(card, 'idle', '')
    })
    button.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      var nickname = String(input.value || '').trim()
      if (!nickname) {
        input.focus()
        setNicknameCheckState(card, 'error', '\uB2C9\uB124\uC784\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.')
        showPatchToast('\uB2C9\uB124\uC784\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.')
        return
      }
      if (!isValidNicknameValue(nickname)) {
        input.focus()
        setNicknameCheckState(card, 'error', nicknameRuleMessage())
        showPatchToast(nicknameRuleMessage())
        return
      }
      button.disabled = true
      button.textContent = '\uD655\uC778 \uC911'
      setNicknameCheckState(card, 'checking', '\uB2C9\uB124\uC784\uC744 \uD655\uC778\uD558\uB294 \uC911\uC785\uB2C8\uB2E4.')
      apiJson('/auth/nickname/check', { nickname: nickname })
        .then(function (response) {
          if (response && response.available) {
            setNicknameCheckState(card, 'available', '\uC0AC\uC6A9 \uAC00\uB2A5\uD55C \uB2C9\uB124\uC784\uC785\uB2C8\uB2E4.')
          } else {
            setNicknameCheckState(card, 'unavailable', '\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC785\uB2C8\uB2E4.')
          }
        })
        .catch(function (error) {
          setNicknameCheckState(card, 'error', parseAuthError(error))
        })
        .finally(function () {
          button.disabled = false
          button.textContent = '\uD655\uC778'
        })
    })
  }

  function isAutoLoginEnabled() {
    return localStorage.getItem(AUTH_AUTO_LOGIN_STORAGE_KEY) === 'true'
  }

  function isRememberEmailEnabled() {
    var enabled = localStorage.getItem(AUTH_REMEMBER_EMAIL_ENABLED_STORAGE_KEY)
    if (enabled !== null) return enabled === 'true'
    return !!localStorage.getItem(AUTH_REMEMBER_EMAIL_STORAGE_KEY)
  }

  function isAppRuntime() {
    var userAgent = String(navigator.userAgent || '')
    var standalone = false
    try {
      standalone = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    } catch (error) {}
    return standalone || !!navigator.standalone || /FamilyPlatformApp|Capacitor|Cordova|\bwv\)/i.test(userAgent)
  }

  function clearLoggedOutQuery() {
    if (!window.history || !window.location || window.location.search.indexOf('loggedOut=') < 0) return
    try {
      var url = new URL(window.location.href)
      url.searchParams.delete('loggedOut')
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash)
    } catch (error) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }

  function shouldPersistAuthSession() {
    return isAutoLoginEnabled() || isAppRuntime()
  }

  function getStoredAuthToken() {
    return sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
      || (shouldPersistAuthSession() ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null)
  }

  function readStoredAuthUser() {
    try {
      return JSON.parse(sessionStorage.getItem(AUTH_USER_STORAGE_KEY)
        || (shouldPersistAuthSession() ? localStorage.getItem(AUTH_USER_STORAGE_KEY) : null)
        || 'null')
    } catch (error) {
      return null
    }
  }

  function writeAuthSession(token, user, persistent) {
    var target = persistent ? localStorage : sessionStorage
    var other = persistent ? sessionStorage : localStorage
    if (token) target.setItem(AUTH_TOKEN_STORAGE_KEY, token)
    else target.removeItem(AUTH_TOKEN_STORAGE_KEY)
    target.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user))
    other.removeItem(AUTH_TOKEN_STORAGE_KEY)
    other.removeItem(AUTH_USER_STORAGE_KEY)
  }

  function ensureLoginPreferenceControls(card, submit) {
    if (!card || card.querySelector('.auth-login-preferences')) return card && card.querySelector('.auth-login-preferences')
    var wrap = document.createElement('div')
    wrap.className = 'auth-login-preferences'
    wrap.innerHTML = [
      '<label><input data-field="auth-remember-email" type="checkbox" /><span>\uC544\uC774\uB514 \uC800\uC7A5</span></label>',
      '<label><input data-field="auth-auto-login" type="checkbox" /><span>\uC790\uB3D9 \uB85C\uADF8\uC778</span></label>'
    ].join('')
    if (submit) submit.insertAdjacentElement('beforebegin', wrap)
    else card.appendChild(wrap)
    return wrap
  }

  function applyLoginPreferences(card, emailInput) {
    if (!card) return
    var remember = card.querySelector('[data-field="auth-remember-email"]')
    var autoLogin = card.querySelector('[data-field="auth-auto-login"]')
    var savedEmail = localStorage.getItem(AUTH_REMEMBER_EMAIL_STORAGE_KEY) || ''
    if (remember) remember.checked = isRememberEmailEnabled()
    if (autoLogin) autoLogin.checked = isAutoLoginEnabled()
    syncLoginPreferenceClasses(card)
    if (isRememberEmailEnabled() && savedEmail && emailInput && !emailInput.value) {
      setNativeInputValue(emailInput, savedEmail)
    }
  }

  function persistLoginPreferences(card, email) {
    if (!card) return
    var remember = card.querySelector('[data-field="auth-remember-email"]')
    var autoLogin = card.querySelector('[data-field="auth-auto-login"]')
    var normalizedEmail = String(email || '').trim()
    if (remember && remember.checked) {
      localStorage.setItem(AUTH_REMEMBER_EMAIL_ENABLED_STORAGE_KEY, 'true')
      if (normalizedEmail) localStorage.setItem(AUTH_REMEMBER_EMAIL_STORAGE_KEY, normalizedEmail)
    } else {
      localStorage.setItem(AUTH_REMEMBER_EMAIL_ENABLED_STORAGE_KEY, 'false')
      localStorage.removeItem(AUTH_REMEMBER_EMAIL_STORAGE_KEY)
    }
    localStorage.setItem(AUTH_AUTO_LOGIN_STORAGE_KEY, autoLogin && autoLogin.checked ? 'true' : 'false')
    syncLoginPreferenceClasses(card)
  }

  function syncLoginPreferenceClasses(card) {
    if (!card) return
    Array.from(card.querySelectorAll('.auth-login-preferences label')).forEach(function (label) {
      var input = label.querySelector('input')
      label.classList.toggle('is-checked', !!(input && input.checked))
    })
  }

  function bindLoginPreferenceControls(card, emailInput) {
    var controls = card && card.querySelector('.auth-login-preferences')
    if (!controls || controls.dataset.preferenceReady === 'true') return
    controls.dataset.preferenceReady = 'true'
    controls.addEventListener('change', function () {
      persistLoginPreferences(card, emailInput && emailInput.value)
    })
    if (emailInput) {
      emailInput.addEventListener('input', function () {
        if (card.querySelector('[data-field="auth-remember-email"]') && card.querySelector('[data-field="auth-remember-email"]').checked) {
          persistLoginPreferences(card, emailInput.value)
        }
      })
    }
  }

  function focusEmptyAuthField(card, payload, mode) {
    var inputs = Array.from(card.querySelectorAll('input'))
    var target = null
    if (!payload.email) target = inputs[0]
    else if (!payload.password || payload.password.length < 8) target = inputs.find(function (input) { return input.type === 'password' }) || inputs[1]
    else if (mode === 'register' && !payload.nickname) target = inputs.find(function (input) { return input.type !== 'email' && input.type !== 'password' })
    if (target) {
      target.focus()
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (mode === 'register' && !isRequiredConsentChecked(card)) {
      var consent = card.querySelector('.auth-required-consent')
      if (consent) consent.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function normalizeAuthCopy(card, mode) {
    if (!card) return
    var heading = card.querySelector('.auth-heading strong')
    var description = card.querySelector('.auth-heading p')
    if (heading) heading.textContent = mode === 'register' ? '\uD68C\uC6D0\uAC00\uC785' : '\uB85C\uADF8\uC778'
    if (description) {
      description.textContent = mode === 'register'
        ? '\uB2C9\uB124\uC784\uC740 \uAC8C\uC2DC\uAE00\uACFC \uAC00\uC871 \uAE30\uB85D\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4.'
        : '\uAC00\uC785\uD55C \uC774\uBA54\uC77C \uB610\uB294 \uAD00\uB9AC\uC790 \uC544\uC774\uB514\uB85C \uC811\uC18D\uD569\uB2C8\uB2E4.'
    }
  }

  function completeAuth(button, response) {
    var persistent = shouldPersistAuthSession()
    var storedUser = storeAuthResponse(response, persistent)
    clearLoggedOutQuery()
    function persist() { storeAuthResponse(response, persistent) }
    persist()
    activateLegacyAuthScreen(button, storedUser)
    window.setTimeout(function () {
      persist()
      flushApiQueue()
      loadScheduleNotifications()
      if (document.querySelector('.auth-card')) activateLegacyAuthScreen(button, storedUser)
    }, 350)
    window.setTimeout(function () {
      if (button) delete button.dataset.authBypass
    }, 1400)
    ;[300, 800, 1500, 3000, 5000, 7500].forEach(function (delay) {
      window.setTimeout(persist, delay)
    })
    window.setTimeout(function () {
      if (document.querySelector('.auth-card') && getStoredAuthToken()) window.location.reload()
    }, 900)
  }

  function focusPasswordConfirm(card) {
    var field = card && card.querySelector('[data-field="auth-password-confirm"]')
    if (!field) return
    field.focus()
    field.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function storeAuthResponse(response, persistent) {
    var storedUser = {
      id: response.userId,
      email: response.email,
      nickname: response.nickname,
      platformAdmin: response.platformAdmin
    }
    var shouldPersist = persistent === undefined ? shouldPersistAuthSession() : !!persistent
    var token = response.accessToken || getStoredAuthToken()
    protectedAuthUntil = Date.now() + 365 * 24 * 60 * 60 * 1000
    protectedAuthSnapshot = { token: token, user: storedUser, persistent: shouldPersist }
    writeAuthSession(token, storedUser, shouldPersist)
    return storedUser
  }

  function isActiveSessionError(error) {
    var text = String(error && error.message ? error.message : error || '')
    return (error && error.status === 409) || text.toLowerCase().indexOf('active session exists') >= 0
  }

  function setAuthSubmitBusy(submit, mode, busy) {
    if (!submit) return
    if (busy) {
      submit.dataset.authBusy = 'true'
      submit.disabled = true
      submit.textContent = mode === 'register' ? '\uAC00\uC785 \uC911...' : '\uB85C\uADF8\uC778 \uC911...'
      return
    }
    delete submit.dataset.authBusy
    submit.disabled = false
    submit.textContent = mode === 'register' ? '\uAC00\uC785\uD558\uAE30' : '\uB85C\uADF8\uC778'
  }

  function getAuthRequestBody(mode, payload, forceLogin) {
    if (mode === 'register') return {
      email: payload.email,
      password: payload.password,
      nickname: payload.nickname
    }
    return {
      email: payload.email,
      password: payload.password,
      forceLogin: !!forceLogin
    }
  }

  function submitAuthRequest(mode, payload, submit, forceLogin) {
    setAuthSubmitBusy(submit, mode, true)
    return apiJson(mode === 'register' ? '/auth/register' : '/auth/login', getAuthRequestBody(mode, payload, forceLogin))
      .then(function (response) {
        if (mode === 'register' && response && response.emailVerificationRequired) {
          showPatchToast('\uD68C\uC6D0\uAC00\uC785\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC774\uBA54\uC77C \uC778\uC99D \uB9C1\uD06C\uB97C \uD655\uC778\uD55C \uB4A4 \uB85C\uADF8\uC778\uD574\uC8FC\uC138\uC694.')
          var loginTab = document.querySelector('.auth-tabs button')
          if (loginTab) loginTab.click()
          return
        }
        showPatchToast(mode === 'register' ? '\uD68C\uC6D0\uAC00\uC785\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : '\uB85C\uADF8\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
        if (mode === 'login') persistLoginPreferences(submit && submit.closest('.auth-card'), response.email || payload.email)
        completeAuth(submit, response)
      }).catch(function (error) {
        if (mode === 'login' && isActiveSessionError(error) && !forceLogin) {
          return submitAuthRequest(mode, payload, submit, true)
        }
        if (mode === 'login' && isEmailVerificationError(error)) {
          ensureVerificationResendAction(submit && submit.closest('.auth-card'), payload.email)
        }
        showPatchToast(parseAuthError(error))
      }).finally(function () {
        setAuthSubmitBusy(submit, mode, false)
      })
  }

  function syncLoginSessionInBackground(payload, submit) {
    if (!submit || submit.dataset.authApiSync === 'true') return
    submit.dataset.authApiSync = 'true'
    apiJson('/auth/login', {
      email: payload.email,
      password: payload.password,
      forceLogin: true
    }).then(function (response) {
      storeAuthResponse(response)
      flushApiQueue()
      loadScheduleNotifications()
    }).catch(function (error) {
      showPatchToast(parseAuthError(error))
    }).finally(function () {
      delete submit.dataset.authApiSync
    })
  }

  function shouldAllowLegacyLogin(card, submit) {
    return !!(submit && submit.dataset.authSkipApiSync === 'true')
  }

  function ensureAccountRecoveryActions(card) {
    if (!card || card.dataset.accountRecoveryReady) return
    card.dataset.accountRecoveryReady = 'true'
    var helper = card.querySelector('.auth-helper')
    var submit = card.querySelector('.auth-submit')
    if (!helper || !submit) return

    var panel = document.createElement('div')
    panel.className = 'auth-recovery-panel'
    panel.hidden = true
    submit.insertAdjacentElement('beforebegin', panel)

    function renderPanel(mode) {
      var isFindEmail = mode === 'find-email'
      var isResetPassword = mode === 'reset-password'
      var isInquiry = mode === 'inquiry'
      var title = isFindEmail ? '\uC544\uC774\uB514 \uCC3E\uAE30' : (isResetPassword ? '\uC0C8 \uBE44\uBC00\uBC88\uD638 \uC124\uC815' : (isInquiry ? '\uAD00\uB9AC\uC790 \uBB38\uC758' : '\uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30'))
      var label = isFindEmail ? '\uB2C9\uB124\uC784' : (isResetPassword ? '\uC0C8 \uBE44\uBC00\uBC88\uD638' : '\uC774\uBA54\uC77C')
      var placeholder = isFindEmail ? '\uB2C9\uB124\uC784' : (isResetPassword ? '8\uC790 \uC774\uC0C1' : 'email@example.com')
      var inputType = isResetPassword ? 'password' : (isFindEmail ? 'text' : 'email')
      panel.hidden = false
      panel.dataset.mode = mode
      if (isInquiry) {
        panel.innerHTML = [
          '<div class="auth-recovery-header"><strong>' + title + '</strong><button type="button" data-auth-recovery-close>X</button></div>',
          '<p class="auth-recovery-guide">\uC774\uBA54\uC77C\uC774\uB098 \uB2C9\uB124\uC784\uC774 \uAE30\uC5B5\uB098\uC9C0 \uC54A\uC744 \uB54C \uAD00\uB9AC\uC790\uC5D0\uAC8C \uACC4\uC815 \uD655\uC778\uC744 \uC694\uCCAD\uD569\uB2C8\uB2E4.</p>',
          '<div class="auth-recovery-grid">',
          '<label><span>\uC774\uBA54\uC77C</span><input data-recovery-email type="email" placeholder="email@example.com" /></label>',
          '<label><span>\uB2C9\uB124\uC784</span><input data-recovery-nickname type="text" placeholder="\uB2C9\uB124\uC784" /></label>',
          '</div>',
          '<label><span>\uC5F0\uB77D\uBC1B\uC744 \uC815\uBCF4</span><input data-recovery-contact type="text" placeholder="\uD68C\uC2E0\uBC1B\uC744 \uC774\uBA54\uC77C\uC774\uB098 \uC5F0\uB77D\uCC98" /></label>',
          '<label><span>\uBB38\uC758 \uB0B4\uC6A9</span><textarea data-recovery-message rows="4" placeholder="\uAE30\uC5B5\uB098\uB294 \uACC4\uC815 \uC815\uBCF4\uB098 \uC0C1\uD669\uC744 \uC801\uC5B4\uC8FC\uC138\uC694."></textarea></label>',
          '<button class="auth-recovery-submit" type="button">' + title + '</button>'
        ].join('')
        panel.querySelector('[data-auth-recovery-close]').addEventListener('click', function () {
          panel.hidden = true
        })
        panel.querySelector('.auth-recovery-submit').addEventListener('click', function () {
          var contactInput = panel.querySelector('[data-recovery-contact]')
          var payload = {
            email: String((panel.querySelector('[data-recovery-email]') || {}).value || '').trim(),
            nickname: String((panel.querySelector('[data-recovery-nickname]') || {}).value || '').trim(),
            contact: String((contactInput || {}).value || '').trim(),
            recoveryType: '\uAD00\uB9AC\uC790 \uACC4\uC815 \uBCF5\uAD6C \uBB38\uC758',
            message: String((panel.querySelector('[data-recovery-message]') || {}).value || '').trim()
          }
          if (!payload.email && !payload.contact) {
            if (contactInput) contactInput.focus()
            showPatchToast('\uD68C\uC2E0\uBC1B\uC744 \uC774\uBA54\uC77C\uC774\uB098 \uC5F0\uB77D\uCC98\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.')
            return
          }
          apiJson('/auth/recovery/inquiry', payload).then(function () {
            panel.hidden = true
            showPatchToast('\uAD00\uB9AC\uC790 \uBB38\uC758\uAC00 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
          }).catch(function (error) {
            showPatchToast(parseAuthError(error))
          })
        })
        var contact = panel.querySelector('[data-recovery-contact]')
        if (contact) contact.focus()
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      panel.innerHTML = [
        '<div class="auth-recovery-header"><strong>' + title + '</strong><button type="button" data-auth-recovery-close>X</button></div>',
        '<p class="auth-recovery-guide">\uC18C\uC15C \uACC4\uC815\uC73C\uB85C \uAC00\uC785\uD588\uB2E4\uBA74 \uC544\uB798 \uB124\uC774\uBC84, \uAD6C\uAE00, \uCE74\uCE74\uC624 \uB85C\uADF8\uC778\uC744 \uBA3C\uC800 \uC774\uC6A9\uD574\uC8FC\uC138\uC694.</p>',
        '<label><span>' + label + '</span><input data-auth-recovery-input type="' + inputType + '" placeholder="' + placeholder + '" /></label>',
        isResetPassword ? '<label><span>\uC0C8 \uBE44\uBC00\uBC88\uD638 \uD655\uC778</span><input data-auth-recovery-confirm type="password" autocomplete="new-password" placeholder="\uBE44\uBC00\uBC88\uD638 \uB2E4\uC2DC \uC785\uB825" minlength="8" /></label>' : '',
        '<button class="auth-recovery-submit" type="button">' + title + '</button>'
      ].join('')
      var input = panel.querySelector('[data-auth-recovery-input]')
      var confirmInput = panel.querySelector('[data-auth-recovery-confirm]')
      if (isResetPassword) {
        input.minLength = 8
        input.autocomplete = 'new-password'
      }
      panel.querySelector('[data-auth-recovery-close]').addEventListener('click', function () {
        panel.hidden = true
      })
      panel.querySelector('.auth-recovery-submit').addEventListener('click', function () {
        var value = String(input.value || '').trim()
        if (!value || (isResetPassword && value.length < 8)) {
          input.focus()
          showPatchToast(isResetPassword ? '\uBE44\uBC00\uBC88\uD638\uB294 8\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694.' : '\uD544\uC218\uAC12\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.')
          return
        }
        if (isResetPassword && confirmInput && value !== String(confirmInput.value || '')) {
          confirmInput.focus()
          showPatchToast('\uBE44\uBC00\uBC88\uD638 \uD655\uC778\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.')
          return
        }
        var request
        if (isFindEmail) {
          request = apiJson('/auth/recovery/find-email', { nickname: value }).then(function (response) {
            var emails = response && response.emails ? response.emails : []
            showPatchToast(emails.length ? '\uAC00\uC785 \uC774\uBA54\uC77C: ' + emails.join(', ') : '\uC77C\uCE58\uD558\uB294 \uACC4\uC815\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
          })
        } else if (isResetPassword) {
          request = apiJson('/auth/recovery/password/reset', {
            token: new URLSearchParams(window.location.search).get('resetToken') || '',
            password: value
          }).then(function () {
            window.history.replaceState({}, document.title, window.location.pathname)
            panel.hidden = true
            showPatchToast('\uBE44\uBC00\uBC88\uD638\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
          })
        } else {
          request = apiJson('/auth/recovery/password/request', { email: value }).then(function () {
            panel.hidden = true
            showPatchToast('\uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815 \uBA54\uC77C\uC744 \uBCF4\uB0C8\uC2B5\uB2C8\uB2E4.')
          })
        }
        request.catch(function (error) {
          showPatchToast(parseAuthError(error))
        })
      })
      input.focus()
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

  function recoveryButton(label) {
      var matches = Array.from(helper.querySelectorAll('button')).filter(function (button) {
        return getCleanText(button) === label
      })
      matches.slice(1).forEach(function (button) { button.remove() })
      if (matches[0]) return matches[0]
      var button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      helper.appendChild(button)
      return button
    }

    Array.from(helper.querySelectorAll('button')).forEach(function (button) {
      if (getCleanText(button) === '\uCD08\uB300\uCF54\uB4DC \uC785\uB825') button.remove()
    })

    var findButton = recoveryButton('\uC544\uC774\uB514 \uCC3E\uAE30')
    findButton.onclick = function () { renderPanel('find-email') }

    var resetButton = recoveryButton('\uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30')
    resetButton.onclick = function () { renderPanel('reset-request') }

    var inquiryButton = recoveryButton('\uAD00\uB9AC\uC790 \uBB38\uC758')
    inquiryButton.onclick = function () { renderPanel('inquiry') }

    if (new URLSearchParams(window.location.search).get('resetToken')) {
      renderPanel('reset-password')
    }
  }

  function normalizeAuthLanding() {
    var visual = document.querySelector('.auth-visual')
    if (!visual || visual.dataset.authLandingReady === 'true') return
    visual.dataset.authLandingReady = 'true'

    var brand = visual.querySelector('.auth-brand')
    if (brand) {
      var title = brand.querySelector('p, strong')
      var subtitle = brand.querySelector('span, small')
      if (title) title.textContent = 'Family Platform'
      if (subtitle) subtitle.textContent = '\uAC00\uC871 \uC6B4\uC601 \uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4'
    }

    var copy = visual.querySelector('.auth-copy')
    if (!copy) {
      copy = document.createElement('section')
      copy.className = 'auth-copy'
      if (brand) brand.insertAdjacentElement('afterend', copy)
      else visual.prepend(copy)
    }
    copy.innerHTML = [
      '<span class="auth-kicker">\uAC00\uC871\uC744 \uC704\uD55C \uD558\uB098\uC758 \uACF5\uAC04</span>',
      '<h1>\uAC00\uC871 \uAE30\uB85D\uC744<br />\uD55C\uACF3\uC5D0\uC11C \uD3B8\uD558\uAC8C</h1>',
      '<p>\uC77C\uC815, \uAC00\uACC4\uBD80, \uC5EC\uD589, \uC721\uC544, \uC77C\uAE30\uB97C \uAC00\uC871\uB07C\uB9AC \uACF5\uC720\uD558\uACE0 \uAD8C\uD55C\uC5D0 \uB9DE\uAC8C \uAD00\uB9AC\uD569\uB2C8\uB2E4.</p>'
    ].join('')

    var preview = visual.querySelector('.auth-preview')
    if (!preview) {
      preview = document.createElement('div')
      preview.className = 'auth-preview'
      copy.insertAdjacentElement('afterend', preview)
    }
    preview.innerHTML = [
      '<div><strong>\uACF5\uC720 \uCE98\uB9B0\uB354</strong><span>\uC0DD\uC77C, \uBCD1\uC6D0, \uD559\uAD50, \uAC00\uC871 \uC77C\uC815\uC744 \uD55C \uB2EC\uB825\uC5D0\uC11C \uD655\uC778</span></div>',
      '<div><strong>\uAC00\uC871 \uAC00\uACC4\uBD80</strong><span>\uC9C0\uCD9C\uACFC \uC218\uC785\uC744 \uBA54\uB274\uBCC4\uB85C \uC815\uB9AC\uD558\uACE0 \uAE30\uAC04\uBCC4\uB85C \uC870\uD68C</span></div>',
      '<div><strong>\uC721\uC544 \uAE30\uB85D</strong><span>\uC218\uC720, \uBC30\uBCC0, \uD0A4, \uBAB8\uBB34\uAC8C \uBCC0\uD654\uB97C \uAE30\uB85D</span></div>'
    ].join('')
  }

  function cleanupAuthActions() {
    document.querySelectorAll('.auth-helper button').forEach(function (button) {
      if (getCleanText(button) === '\uCD08\uB300\uCF54\uB4DC \uC785\uB825') button.remove()
    })
  }

  function submitLegacyAuthForm(button) {
    if (!button) return
    var wasDisabled = button.disabled
    var form = button.closest('form')
    button.disabled = false
    if (form && typeof form.requestSubmit === 'function') form.requestSubmit(button)
    else button.click()
    button.disabled = wasDisabled
  }

  function activateLegacyAuthScreen(button, user) {
    if (!button) return
    var card = button.closest('.auth-card') || document.querySelector('.auth-card')
    if (!card) return
    var inputs = Array.from(card.querySelectorAll('input'))
    var passwordInput = card.querySelector('[data-field="auth-password"]') || inputs.find(function (input) {
      return input.type === 'password'
    }) || inputs[1]
    if (passwordInput && !passwordInput.value) setNativeInputValue(passwordInput, 'authenticated-session')
    button.dataset.authSkipApiSync = 'true'
    button.dataset.authBypass = 'true'
    window.setTimeout(function () {
      delete button.dataset.authSkipApiSync
    }, 5000)
    window.setTimeout(function () {
      submitLegacyAuthForm(button)
    }, 80)
    window.setTimeout(function () {
      if (document.querySelector('.auth-card')) submitLegacyAuthForm(button)
    }, 260)
  }

  function ensureAuthRegisterFields() {
    var card = document.querySelector('.auth-card')
    if (!card) return

    var submit = card.querySelector('.auth-submit')
    var inputs = Array.from(card.querySelectorAll('input'))
    var emailInput = inputs.find(function (input) {
      return input.type === 'email' || /@/.test(input.value || '') || /email|mail|이메일/i.test(input.placeholder || '')
    }) || inputs[0]
    var passwordInput = inputs.find(function (input) {
      return input.type === 'password' || /비밀번호|password/i.test(input.placeholder || '')
    }) || inputs[1]

    if (emailInput) {
      emailInput.dataset.field = 'auth-email'
      emailInput.type = 'text'
      emailInput.autocomplete = 'username'
      emailInput.inputMode = 'email'
      emailInput.placeholder = '이메일'
    }
    if (passwordInput) {
      passwordInput.dataset.field = 'auth-password'
      passwordInput.type = 'password'
      passwordInput.autocomplete = 'current-password'
      passwordInput.minLength = 8
      passwordInput.placeholder = '8자 이상'
    }

    var tabs = card.querySelector('.auth-tabs')
    if (!tabs) {
      tabs = document.createElement('div')
      tabs.className = 'auth-tabs'
      var anchor = card.querySelector('.auth-heading') || card.firstElementChild
      if (anchor) anchor.insertAdjacentElement('beforebegin', tabs)
      else card.prepend(tabs)
    }

    var tabButtons = Array.from(tabs.querySelectorAll('button'))
    var loginTab = tabButtons.find(function (button) {
      return getCleanText(button).indexOf('로그인') >= 0 || getCleanText(button).toLowerCase().indexOf('login') >= 0
    })
    var registerTab = tabButtons.find(function (button) {
      var text = getCleanText(button)
      return text.indexOf('회원가입') >= 0 || text.indexOf('가입') >= 0 || text.toLowerCase().indexOf('register') >= 0
    })
    if (!registerTab) {
      registerTab = tabButtons.find(function (button) {
        return button !== loginTab
      })
    }

    if (!loginTab) {
      loginTab = document.createElement('button')
      loginTab.type = 'button'
      tabs.appendChild(loginTab)
    }
    loginTab.textContent = '로그인'

    if (!registerTab) {
      registerTab = document.createElement('button')
      registerTab.type = 'button'
      tabs.appendChild(registerTab)
    }
    registerTab.textContent = '회원가입'
    Array.from(tabs.querySelectorAll('button')).forEach(function (button) {
      if (button !== loginTab && button !== registerTab) button.remove()
    })

    var nicknameField = card.querySelector('.auth-nickname-field')
    if (!nicknameField) {
      nicknameField = document.createElement('label')
      nicknameField.className = 'auth-nickname-field'
      nicknameField.innerHTML = '<span>닉네임</span><input data-field="auth-nickname" autocomplete="nickname" maxlength="12" placeholder="닉네임" />'
      var passwordLabel = passwordInput && passwordInput.closest('label')
      if (passwordLabel) passwordLabel.insertAdjacentElement('beforebegin', nicknameField)
      else if (submit) submit.insertAdjacentElement('beforebegin', nicknameField)
      else card.appendChild(nicknameField)
    }
    ensureNicknameCheckControls(card, nicknameField)

    var passwordConfirmField = card.querySelector('.auth-password-confirm-field')
    if (!passwordConfirmField) {
      passwordConfirmField = document.createElement('label')
      passwordConfirmField.className = 'auth-password-confirm-field'
      passwordConfirmField.innerHTML = '<span>\uBE44\uBC00\uBC88\uD638 \uD655\uC778</span><input data-field="auth-password-confirm" type="password" autocomplete="new-password" minlength="8" placeholder="\uBE44\uBC00\uBC88\uD638 \uB2E4\uC2DC \uC785\uB825" />'
      var passwordLabel = passwordInput && passwordInput.closest('label')
      if (passwordLabel) passwordLabel.insertAdjacentElement('afterend', passwordConfirmField)
      else if (submit) submit.insertAdjacentElement('beforebegin', passwordConfirmField)
      else card.appendChild(passwordConfirmField)
    }

    var consentField = card.querySelector('.auth-required-consent')
    if (!consentField) {
      consentField = document.createElement('label')
      consentField.className = 'auth-required-consent'
      consentField.innerHTML = '<input data-field="auth-required-consent" type="checkbox" /><span><strong>\uD544\uC218 \uB3D9\uC758</strong> \uD68C\uC6D0\uAC00\uC785 \uBC0F \uC911\uBCF5 \uAC00\uC785 \uBC29\uC9C0\uB97C \uC704\uD574 \uC774\uBA54\uC77C, \uB2C9\uB124\uC784 \uC815\uBCF4\uB97C \uCC98\uB9AC\uD569\uB2C8\uB2E4.</span>'
      if (submit) submit.insertAdjacentElement('beforebegin', consentField)
      else card.appendChild(consentField)
    }
    var loginPreferences = ensureLoginPreferenceControls(card, submit)
    applyLoginPreferences(card, emailInput)
    bindLoginPreferenceControls(card, emailInput)
    if (!card.__familyAuthModeValues) {
      var activeAuthTab = tabs.querySelector('button.active')
      var initialMode = card.dataset.authMode || (activeAuthTab === registerTab ? 'register' : 'login')
      card.__familyAuthModeValues = {
        login: {
          email: initialMode === 'login' && emailInput ? emailInput.value : '',
          password: initialMode === 'login' && passwordInput ? passwordInput.value : ''
        },
        register: {
          email: initialMode === 'register' && emailInput ? emailInput.value : '',
          password: initialMode === 'register' && passwordInput ? passwordInput.value : '',
          passwordConfirm: initialMode === 'register' ? getFieldValue(card, '[data-field="auth-password-confirm"]') : '',
          nickname: initialMode === 'register' ? getFieldValue(card, '[data-field="auth-nickname"]') : ''
        }
      }
    }

    function authModeState(mode) {
      return card.__familyAuthModeValues[mode] || (card.__familyAuthModeValues[mode] = {})
    }

    function saveAuthModeValues(mode) {
      if (!mode) return
      var state = authModeState(mode)
      var emailField = card.querySelector('[data-field="auth-email"]') || emailInput
      var passwordField = card.querySelector('[data-field="auth-password"]') || passwordInput
      var passwordConfirmInput = card.querySelector('[data-field="auth-password-confirm"]')
      if (emailField) state.email = emailField.value || ''
      if (passwordField) state.password = passwordField.value || ''
      if (passwordConfirmInput) state.passwordConfirm = passwordConfirmInput.value || ''
      var nicknameInput = card.querySelector('[data-field="auth-nickname"]')
      if (nicknameInput) state.nickname = nicknameInput.value || ''
    }

    function restoreAuthModeValues(mode) {
      var state = authModeState(mode)
      var emailField = card.querySelector('[data-field="auth-email"]') || emailInput
      var passwordField = card.querySelector('[data-field="auth-password"]') || passwordInput
      var passwordConfirmInput = card.querySelector('[data-field="auth-password-confirm"]')
      if (emailField) setNativeInputValue(emailField, state.email || '')
      if (passwordField) setNativeInputValue(passwordField, state.password || '')
      if (passwordConfirmInput) setNativeInputValue(passwordConfirmInput, mode === 'register' ? (state.passwordConfirm || '') : '')
      var nicknameInput = card.querySelector('[data-field="auth-nickname"]')
      if (nicknameInput) setNativeInputValue(nicknameInput, mode === 'register' ? (state.nickname || '') : '')
    }

    if (!card.dataset.authModeValueReady) {
      card.dataset.authModeValueReady = 'true'
      card.addEventListener('input', function (event) {
        if (!event.target || !event.target.matches('[data-field="auth-email"], [data-field="auth-password"], [data-field="auth-password-confirm"], [data-field="auth-nickname"]')) return
        if (card.__familyAuthModeSwitchingUntil && Date.now() < card.__familyAuthModeSwitchingUntil) return
        saveAuthModeValues(card.dataset.authMode || 'login')
      }, true)
    }

    function setMode(mode) {
      var previousMode = card.dataset.authMode
      var modeChanged = previousMode !== mode
      if (previousMode && modeChanged) saveAuthModeValues(previousMode)
      if (modeChanged) card.__familyAuthModeSwitchingUntil = Date.now() + 650
      card.dataset.authMode = mode
      loginTab.classList.toggle('active', mode === 'login')
      registerTab.classList.toggle('active', mode === 'register')
      nicknameField.style.display = mode === 'register' ? '' : 'none'
      passwordConfirmField.style.display = mode === 'register' ? '' : 'none'
      consentField.style.display = mode === 'register' ? '' : 'none'
      if (loginPreferences) loginPreferences.style.display = mode === 'login' ? '' : 'none'
      var resendButton = card.querySelector('[data-auth-resend-verification]')
      if (resendButton) resendButton.hidden = true
      if (passwordInput) passwordInput.autocomplete = mode === 'register' ? 'new-password' : 'current-password'
      if (submit && submit.dataset.authBusy !== 'true') submit.textContent = mode === 'register' ? '회원가입' : '로그인'
      if (modeChanged) {
        restoreAuthModeValues(mode)
        window.clearTimeout(card.__familyAuthModeRestoreTimer)
        ;[80, 240, 520].forEach(function (delay) {
          window.setTimeout(function () {
            if (card.dataset.authMode === mode) restoreAuthModeValues(mode)
          }, delay)
        })
      }
      normalizeAuthCopy(card, mode)
    }

    if (!card.dataset.authMode) {
      var currentMode = getCleanText(tabs.querySelector('button.active')).indexOf('가입') >= 0 ? 'register' : 'login'
      setMode(currentMode)
    } else {
      setMode(card.dataset.authMode)
    }

    if (!tabs.dataset.authRegisterClickReady) {
      tabs.dataset.authRegisterClickReady = 'true'
      loginTab.addEventListener('click', function (event) {
        event.preventDefault()
        setMode('login')
      })
      registerTab.addEventListener('click', function (event) {
        event.preventDefault()
        setMode('register')
      })
    }
    ensureAccountRecoveryActions(card)
  }

  function setNativeInputValue(input, value) {
    if (!input) return
    var prototype = input instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : input instanceof window.HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype
    var descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
    if (descriptor && descriptor.set) descriptor.set.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function apiBaseUrlForAuth() {
    return window.FAMILY_PLATFORM_API_BASE_URL || localStorage.getItem('family-platform-api-base-url') || '/api'
  }

  function clearStoredAuth() {
    if (protectedAuthSnapshot && Date.now() < protectedAuthUntil) {
      writeAuthSession(protectedAuthSnapshot.token, protectedAuthSnapshot.user, protectedAuthSnapshot.persistent)
      return
    }
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(AUTH_USER_STORAGE_KEY)
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    sessionStorage.removeItem(AUTH_USER_STORAGE_KEY)
    localStorage.removeItem(AUTH_FAMILY_STORAGE_KEY)
    localStorage.removeItem(AUTH_TRIP_STORAGE_KEY)
  }

  function forceClearStoredAuth() {
    protectedAuthUntil = 0
    protectedAuthSnapshot = null
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(AUTH_USER_STORAGE_KEY)
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    sessionStorage.removeItem(AUTH_USER_STORAGE_KEY)
    localStorage.removeItem(AUTH_FAMILY_STORAGE_KEY)
    localStorage.removeItem(AUTH_TRIP_STORAGE_KEY)
  }

  var lastLogoutRequestAt = 0

  function logoutCurrentSession() {
    var now = Date.now()
    if (now - lastLogoutRequestAt < 800) return
    lastLogoutRequestAt = now
    protectedAuthUntil = 0
    protectedAuthSnapshot = null
    var token = getStoredAuthToken()
    if (!token) return
    fetch(apiBaseUrlForAuth() + '/auth/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      keepalive: true
    }).catch(function () {})
  }

  function findLogoutClickTarget(target) {
    var node = target
    var depth = 0
    while (node && node !== document.body && depth < 7) {
      if (node.nodeType === 1) {
        var tag = String(node.tagName || '').toLowerCase()
        var role = node.getAttribute && String(node.getAttribute('role') || '').toLowerCase()
        var isInteractive = tag === 'button' || tag === 'a' || role === 'button' || node.classList.contains('logout-button')
        var text = getCleanText(node).replace(/\s+/g, ' ').trim()
        if (isInteractive && (text === '\uB85C\uADF8\uC544\uC6C3' || text.toLowerCase() === 'logout')) {
          return node
        }
      }
      node = node.parentElement
      depth += 1
    }
    return null
  }

  function restoreAuthSession() {
    var card = document.querySelector('.auth-card')
    if (!card || card.dataset.sessionRestoreReady === 'true') return
    var token = getStoredAuthToken()
    var hasSessionToken = !!sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    if (!isAutoLoginEnabled() && !hasSessionToken && !isAppRuntime()) return
    var storedUser = readStoredAuthUser()
    if (!token || !storedUser || !storedUser.email) return

    card.dataset.sessionRestoreReady = 'true'
    fetch(apiBaseUrlForAuth() + '/auth/me', {
      headers: { Authorization: 'Bearer ' + token }
    }).then(function (response) {
      if (!response.ok) throw new Error('Invalid session')
      return response.json()
    }).then(function (response) {
      var storedUser = {
        id: response.userId,
        email: response.email,
        nickname: response.nickname,
        platformAdmin: response.platformAdmin
      }
      var persistent = isAppRuntime()
        || (isAutoLoginEnabled() && !!localStorage.getItem(AUTH_TOKEN_STORAGE_KEY))
      protectedAuthUntil = Date.now() + 365 * 24 * 60 * 60 * 1000
      protectedAuthSnapshot = { token: response.accessToken || token, user: storedUser, persistent: persistent }
      function persist() {
        writeAuthSession(response.accessToken || token, storedUser, persistent)
      }
      persist()
      var emailInput = card.querySelector('[data-field="login-email"]') || card.querySelector('input')
      var passwordInput = card.querySelector('[data-field="login-password"]') || card.querySelector('input[type="password"]')
      setNativeInputValue(emailInput, response.email || storedUser.email)
      if (passwordInput && !passwordInput.value) setNativeInputValue(passwordInput, 'authenticated-session')
      var submit = card.querySelector('.auth-submit')
      if (submit) {
        activateLegacyAuthScreen(submit, storedUser)
        window.setTimeout(function () {
          persist()
          flushApiQueue()
          loadScheduleNotifications()
          if (document.querySelector('.auth-card')) activateLegacyAuthScreen(submit, storedUser)
        }, 350)
        window.setTimeout(function () {
          delete submit.dataset.authBypass
        }, 1400)
        ;[300, 800, 1500, 3000, 5000, 7500].forEach(function (delay) {
          window.setTimeout(persist, delay)
        })
      }
    }).catch(function () {
      forceClearStoredAuth()
      delete card.dataset.sessionRestoreReady
    })
  }

  function validateStoredAuthSession() {
    var token = getStoredAuthToken()
    if (!token) return
    fetch(apiBaseUrlForAuth() + '/auth/me', {
      headers: { Authorization: 'Bearer ' + token }
    }).then(function (response) {
      if (response.ok) return response.json()
      throw new Error('invalid session')
    }).then(function (response) {
      if (response && response.accessToken) {
        storeAuthResponse(response)
      }
    }).catch(function () {
      forceClearStoredAuth()
      if (document.querySelector('.app-shell')) window.location.reload()
    })
  }

  function consumeSsoFragment() {
    var hash = String(window.location.hash || '')
    if (hash.indexOf('sso_token=') < 0) return false
    var params = new URLSearchParams(hash.replace(/^#/, ''))
    var token = params.get('sso_token')
    var userText = params.get('sso_user')
    if (!token || !userText) return false
    try {
      var user = JSON.parse(userText)
      var persistent = shouldPersistAuthSession()
      writeAuthSession(token, user, persistent)
      localStorage.setItem('family-platform-sso-complete', String(Date.now()))
      protectedAuthUntil = Date.now() + 365 * 24 * 60 * 60 * 1000
      protectedAuthSnapshot = { token: token, user: user, persistent: persistent }
      clearLoggedOutQuery()
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
      window.setTimeout(function () {
        if (document.querySelector('.auth-card')) window.location.reload()
      }, 200)
      return true
    } catch (error) {
      return false
    }
  }

  function closePasswordChangeDialog() {
    var dialog = document.querySelector('.account-password-backdrop')
    if (dialog) dialog.remove()
  }

  function openPasswordChangeDialog() {
    closePasswordChangeDialog()
    var backdrop = document.createElement('div')
    backdrop.className = 'account-password-backdrop'
    backdrop.innerHTML = [
      '<section class="account-password-dialog" role="dialog" aria-modal="true" aria-label="\uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD">',
      '<div class="account-password-header"><strong>\uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD</strong><button type="button" data-password-dialog-close>X</button></div>',
      '<p>\uD604\uC7AC \uBE44\uBC00\uBC88\uD638\uB97C \uD655\uC778\uD55C \uB4A4 \uC0C8 \uBE44\uBC00\uBC88\uD638\uB85C \uBCC0\uACBD\uD569\uB2C8\uB2E4. \uC18C\uC15C \uACC4\uC815\uC740 \uD604\uC7AC \uBE44\uBC00\uBC88\uD638\uB97C \uBE44\uC6CC\uB450\uACE0 \uC124\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>',
      '<label><span>\uD604\uC7AC \uBE44\uBC00\uBC88\uD638</span><input data-current-password type="password" autocomplete="current-password" placeholder="\uD604\uC7AC \uBE44\uBC00\uBC88\uD638" /></label>',
      '<label><span>\uC0C8 \uBE44\uBC00\uBC88\uD638</span><input data-new-password type="password" autocomplete="new-password" placeholder="8\uC790 \uC774\uC0C1" minlength="8" /></label>',
      '<label><span>\uC0C8 \uBE44\uBC00\uBC88\uD638 \uD655\uC778</span><input data-confirm-password type="password" autocomplete="new-password" placeholder="\uB2E4\uC2DC \uC785\uB825" minlength="8" /></label>',
      '<div class="account-password-actions"><button type="button" class="cancel-button" data-password-dialog-close>\uCDE8\uC18C</button><button type="button" class="save-button" data-password-change-submit>\uBCC0\uACBD</button></div>',
      '</section>'
    ].join('')
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop || (event.target.closest && event.target.closest('[data-password-dialog-close]'))) {
        closePasswordChangeDialog()
      }
    })
    var submit = backdrop.querySelector('[data-password-change-submit]')
    submit.addEventListener('click', function () {
      var current = String((backdrop.querySelector('[data-current-password]') || {}).value || '')
      var next = String((backdrop.querySelector('[data-new-password]') || {}).value || '')
      var confirm = String((backdrop.querySelector('[data-confirm-password]') || {}).value || '')
      if (next.length < 8) {
        backdrop.querySelector('[data-new-password]').focus()
        showPatchToast('\uC0C8 \uBE44\uBC00\uBC88\uD638\uB294 8\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694.')
        return
      }
      if (next !== confirm) {
        backdrop.querySelector('[data-confirm-password]').focus()
        showPatchToast('\uC0C8 \uBE44\uBC00\uBC88\uD638 \uD655\uC778\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.')
        return
      }
      if (!getStoredAuthToken()) {
        showPatchToast('\uB2E4\uC2DC \uB85C\uADF8\uC778 \uD6C4 \uBCC0\uACBD\uD574\uC8FC\uC138\uC694.')
        return
      }
      submit.disabled = true
      submit.textContent = '\uBCC0\uACBD \uC911'
      apiRequest('/auth/password/change', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next })
      }).then(function () {
        closePasswordChangeDialog()
        showPatchToast('\uBE44\uBC00\uBC88\uD638\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
      }).catch(function (error) {
        submit.disabled = false
        submit.textContent = '\uBCC0\uACBD'
        showPatchToast(parseAuthError(error))
      })
    })
    document.body.appendChild(backdrop)
    var firstInput = backdrop.querySelector('[data-current-password]')
    if (firstInput) firstInput.focus()
  }

  function closeAccountInfoDialog() {
    var dialog = document.querySelector('.account-info-backdrop')
    if (dialog) dialog.remove()
  }

  function accountDisplayValue(value) {
    return escapeHtml(value || '-')
  }

  function renderAccountInfoDialog(user) {
    closeAccountInfoDialog()
    user = user || readStoredAuthUser() || {}
    var loginId = user.email || user.loginId || user.identifier || ''
    var nickname = user.nickname || ''
    var backdrop = document.createElement('div')
    backdrop.className = 'account-info-backdrop'
    backdrop.innerHTML = [
      '<section class="account-info-dialog" role="dialog" aria-modal="true" aria-label="\uB0B4 \uC815\uBCF4">',
      '<div class="account-password-header"><strong>\uB0B4 \uC815\uBCF4</strong><button type="button" data-account-info-close>X</button></div>',
      '<div class="account-info-list">',
      '<div><span>\uC811\uC18D ID</span><strong>' + accountDisplayValue(loginId) + '</strong></div>',
      '<div><span>\uB2C9\uB124\uC784</span><strong>' + accountDisplayValue(nickname) + '</strong></div>',
      '</div>',
      '<div class="account-password-actions account-info-actions">',
      '<button type="button" class="cancel-button" data-account-info-close>\uB2EB\uAE30</button>',
      '<button type="button" class="save-button" data-account-info-password>\uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD</button>',
      '</div>',
      '</section>'
    ].join('')
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop || (event.target.closest && event.target.closest('[data-account-info-close]'))) {
        closeAccountInfoDialog()
        return
      }
      if (event.target.closest && event.target.closest('[data-account-info-password]')) {
        closeAccountInfoDialog()
        openPasswordChangeDialog()
      }
    })
    document.body.appendChild(backdrop)
  }

  function openAccountInfoDialog() {
    var stored = readStoredAuthUser()
    renderAccountInfoDialog(stored)
    if (!getStoredAuthToken()) return
    apiRequest('/auth/me').then(function (response) {
      if (response && response.accessToken) {
        writeAuthSession(response.accessToken, response, shouldPersistAuthSession())
      }
      renderAccountInfoDialog(response || stored)
    }).catch(function () {})
  }

  function ensurePasswordChangeAction() {
    if (document.querySelector('.auth-card')) return
    var actions = document.querySelector('.top-actions')
    if (!actions) return
    actions.querySelectorAll('[data-account-password-change]').forEach(function (button) {
      button.remove()
    })
    if (actions.querySelector('[data-account-info]')) return
    var logout = Array.from(actions.querySelectorAll('button')).find(function (button) {
      return getCleanText(button).replace(/\s+/g, '') === '\uB85C\uADF8\uC544\uC6C3'
    })
    if (!logout) return
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'secondary-action account-password-change'
    button.dataset.accountInfo = 'true'
    button.textContent = '\uB0B4 \uC815\uBCF4'
    button.addEventListener('click', openAccountInfoDialog)
    if (logout) actions.insertBefore(button, logout)
    else actions.appendChild(button)
  }

  function enhanceAuthApi() {
    var card = document.querySelector('.auth-card')
    if (!card || card.dataset.authApiReady) return
    card.dataset.authApiReady = 'true'

    var submit = card.querySelector('.auth-submit')
    if (!submit) return

    submit.addEventListener('click', function (event) {
      if (submit.dataset.authBypass === 'true') return
      if (document.querySelector('.app-shell')) return
      if (shouldAllowLegacyLogin(card, submit)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()

      var mode = getAuthMode(card)
      var payload = getAuthPayload(card)
      if (!payload.email || !payload.password || payload.password.length < 8 || (mode === 'register' && !payload.nickname)) {
        focusEmptyAuthField(card, payload, mode)
        showPatchToast(mode === 'register' ? '\uC774\uBA54\uC77C, \uB2C9\uB124\uC784, 8\uC790 \uC774\uC0C1 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.' : '\uC774\uBA54\uC77C\uACFC 8\uC790 \uC774\uC0C1 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.')
        return
      }
      if (mode === 'register' && payload.password !== payload.passwordConfirm) {
        focusPasswordConfirm(card)
        showPatchToast('\uBE44\uBC00\uBC88\uD638 \uD655\uC778\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.')
        return
      }
      if (mode === 'register' && !isValidNicknameValue(payload.nickname)) {
        focusEmptyAuthField(card, payload, mode)
        setNicknameCheckState(card, 'error', nicknameRuleMessage())
        showPatchToast(nicknameRuleMessage())
        return
      }
      if (mode === 'register' && isNicknameUnavailable(card, payload.nickname)) {
        focusEmptyAuthField(card, payload, mode)
        showPatchToast('\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC785\uB2C8\uB2E4. \uB2E4\uB978 \uB2C9\uB124\uC784\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.')
        return
      }
      if (mode === 'register' && !isRequiredConsentChecked(card)) {
        focusEmptyAuthField(card, payload, mode)
        showPatchToast('\uD544\uC218 \uB3D9\uC758 \uD6C4 \uD68C\uC6D0\uAC00\uC785\uC744 \uC9C4\uD589\uD574\uC8FC\uC138\uC694.')
        return
      }

      submitAuthRequest(mode, payload, submit, false)
    }, true)
  }

  function submitAuthViaApi(card, submit) {
    if (!card || !submit || submit.dataset.authBypass === 'true' || submit.dataset.authBusy === 'true') return
    if (document.querySelector('.app-shell')) return
    if (shouldAllowLegacyLogin(card, submit)) return

    var activeTab = card.querySelector('.auth-tabs button.active')
    var activeText = getCleanText(activeTab)
    var mode = getAuthMode(card)
    var payload = getAuthPayload(card)
    if (!payload.email || !payload.password || payload.password.length < 8 || (mode === 'register' && !payload.nickname)) {
      focusEmptyAuthField(card, payload, mode)
      showPatchToast(mode === 'register' ? '\uC774\uBA54\uC77C, \uB2C9\uB124\uC784, 8\uC790 \uC774\uC0C1 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.' : '\uC774\uBA54\uC77C\uACFC 8\uC790 \uC774\uC0C1 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.')
      return
    }
    if (mode === 'register' && payload.password !== payload.passwordConfirm) {
      focusPasswordConfirm(card)
      showPatchToast('\uBE44\uBC00\uBC88\uD638 \uD655\uC778\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.')
      return
    }
    if (mode === 'register' && !isValidNicknameValue(payload.nickname)) {
      focusEmptyAuthField(card, payload, mode)
      setNicknameCheckState(card, 'error', nicknameRuleMessage())
      showPatchToast(nicknameRuleMessage())
      return
    }
    if (mode === 'register' && isNicknameUnavailable(card, payload.nickname)) {
      focusEmptyAuthField(card, payload, mode)
      showPatchToast('\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC785\uB2C8\uB2E4. \uB2E4\uB978 \uB2C9\uB124\uC784\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.')
      return
    }
    if (mode === 'register' && !isRequiredConsentChecked(card)) {
      focusEmptyAuthField(card, payload, mode)
      showPatchToast('\uD544\uC218 \uB3D9\uC758 \uD6C4 \uD68C\uC6D0\uAC00\uC785\uC744 \uC9C4\uD589\uD574\uC8FC\uC138\uC694.')
      return
    }

    submitAuthRequest(mode, payload, submit, false)
  }

