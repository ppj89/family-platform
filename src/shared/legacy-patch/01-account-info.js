  function closeAccountInfoDialog() {
    var dialog = document.querySelector('.account-info-backdrop')
    if (dialog) dialog.remove()
  }

  function accountDisplayValue(value) {
    return escapeHtml(value || '-')
  }

  function accountProviderLabel(provider, loginId) {
    var key = String(provider || '').toLowerCase()
    if (key === 'naver') return '\uB124\uC774\uBC84'
    if (key === 'google') return '\uAD6C\uAE00'
    if (key === 'kakao') return '\uCE74\uCE74\uC624'
    if (key === 'admin') return '\uAD00\uB9AC\uC790 ID'
    if (key === 'password') return loginId && loginId.indexOf('@') < 0 ? '\uAD00\uB9AC\uC790 ID' : '\uC774\uBA54\uC77C'
    return loginId && loginId.indexOf('@') < 0 ? '\uAD00\uB9AC\uC790 ID' : '\uC774\uBA54\uC77C'
  }

  function accountProviderKey(provider) {
    return String(provider || '').toLowerCase()
  }

  function accountIsSsoProvider(provider) {
    var key = accountProviderKey(provider)
    return key === 'naver' || key === 'google' || key === 'kakao'
  }

  function getAccountInfoModel(user) {
    user = user || readStoredAuthUser() || {}
    var loginId = user.email || user.loginId || user.identifier || ''
    var nickname = user.nickname || ''
    var provider = accountProviderKey(user.provider)
    var providerLabel = accountProviderLabel(provider, loginId)
    var loginIdLabel = accountIsSsoProvider(provider) ? '\uC5F0\uB3D9 \uC774\uBA54\uC77C' : '\uC811\uC18D ID'
    return {
      loginId: loginId,
      loginIdLabel: loginIdLabel,
      nickname: nickname,
      provider: provider,
      providerLabel: providerLabel
    }
  }

  function getAccountInfoRows(model) {
    return [
      { label: '\uB85C\uADF8\uC778 \uBC29\uC2DD', value: model.providerLabel },
      { label: model.loginIdLabel, value: model.loginId },
      { label: '\uB2C9\uB124\uC784', value: model.nickname }
    ]
  }

  function renderAccountInfoRows(rows) {
    return rows.map(function (row) {
      return '<div><span>' + accountDisplayValue(row.label) + '</span><strong>' + accountDisplayValue(row.value) + '</strong></div>'
    }).join('')
  }

  function renderAccountInfoDialog(user) {
    closeAccountInfoDialog()
    var model = getAccountInfoModel(user)
    var backdrop = document.createElement('div')
    backdrop.className = 'account-info-backdrop'
    backdrop.innerHTML = [
      '<section class="account-info-dialog" role="dialog" aria-modal="true" aria-label="\uB0B4 \uC815\uBCF4">',
      '<div class="account-password-header"><strong>\uB0B4 \uC815\uBCF4</strong><button type="button" data-account-info-close>X</button></div>',
      '<div class="account-info-list">',
      renderAccountInfoRows(getAccountInfoRows(model)),
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

  function ensureAccountInfoAction() {
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
