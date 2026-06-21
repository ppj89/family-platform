  function closeAccountInfoDialog() {
    var dialog = document.querySelector('.account-info-backdrop')
    if (dialog) dialog.remove()
  }

  function accountDisplayValue(value) {
    return escapeHtml(value || '-')
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
