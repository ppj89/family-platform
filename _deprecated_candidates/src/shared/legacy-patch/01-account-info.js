  function openAccountInfoDialog() {
    var stored = readStoredAuthUser()
    renderAccountInfoDialog(stored)
    if (!getStoredAuthToken()) return
    apiRequest('/auth/me').then(function (response) {
      var nextUser = response || stored
      if (response && response.accessToken) {
        nextUser = storeAuthResponse(response, shouldPersistAuthSession())
      }
      renderAccountInfoDialog(nextUser)
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
