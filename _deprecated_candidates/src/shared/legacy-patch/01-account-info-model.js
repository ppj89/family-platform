  function accountProviderKey(provider) {
    return String(provider || '').toLowerCase()
  }

  function accountIsSsoProvider(provider) {
    var key = accountProviderKey(provider)
    return key === 'naver' || key === 'google' || key === 'kakao'
  }

  function accountProviderLabel(provider, loginId) {
    var key = accountProviderKey(provider)
    if (key === 'naver') return '\uB124\uC774\uBC84'
    if (key === 'google') return '\uAD6C\uAE00'
    if (key === 'kakao') return '\uCE74\uCE74\uC624'
    if (key === 'admin') return '\uAD00\uB9AC\uC790 ID'
    if (key === 'password') return loginId && loginId.indexOf('@') < 0 ? '\uAD00\uB9AC\uC790 ID' : '\uC774\uBA54\uC77C'
    return loginId && loginId.indexOf('@') < 0 ? '\uAD00\uB9AC\uC790 ID' : '\uC774\uBA54\uC77C'
  }

  function getAccountInfoModel(user) {
    user = user || readStoredAuthUser() || {}
    var loginId = user.loginEmail || user.email || user.loginId || user.identifier || ''
    var nickname = user.nickname || ''
    var provider = accountProviderKey(user.provider)
    var providerLabel = accountProviderLabel(provider, loginId)
    return {
      isSso: accountIsSsoProvider(provider),
      loginId: loginId,
      loginIdLabel: loginId && loginId.indexOf('@') >= 0 ? '\uC774\uBA54\uC77C' : '\uC811\uC18D ID',
      nickname: nickname,
      provider: provider,
      providerLabel: providerLabel
    }
  }

  function getAccountInfoRows(model) {
    var rows = [
      { label: '\uB85C\uADF8\uC778 \uBC29\uC2DD', value: model.providerLabel }
    ]
    if (model.loginId) {
      rows.push({ label: model.loginIdLabel, value: model.loginId })
    }
    rows.push({ label: '\uB2C9\uB124\uC784', value: model.nickname })
    return rows
  }
