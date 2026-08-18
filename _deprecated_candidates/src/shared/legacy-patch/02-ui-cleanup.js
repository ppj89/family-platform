  function replaceButtonWithBadge(button, className) {
    if (!button || button.dataset.passiveBadgeReady) return
    var badge = document.createElement('span')
    badge.className = className || 'passive-header-chip'
    badge.textContent = getCleanText(button)
    badge.dataset.passiveBadgeReady = 'true'
    button.replaceWith(badge)
  }

  function ensureUiCleanupStyles() {
    if (document.getElementById('family-platform-ui-cleanup-style')) return
    var style = document.createElement('style')
    style.id = 'family-platform-ui-cleanup-style'
    style.textContent = [
      '.passive-header-chip{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 14px;border-radius:999px;background:#f1f5f9;color:#64748b;font-size:13px;font-weight:700;white-space:nowrap}',
      '.family-group-panel{display:grid;gap:18px}',
      '.family-group-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
      '.family-group-summary article,.family-group-list article{background:#f8fafc;border:1px solid #e5eaf2;border-radius:18px;padding:18px}',
      '.family-group-summary span,.family-group-list span{display:block;color:#7b8794;font-size:13px;font-weight:700}',
      '.family-group-summary strong,.family-group-list strong{display:block;margin-top:8px;color:#171f2e;font-size:18px}',
      '.family-group-summary small{display:block;margin-top:7px;color:#7b8794;font-weight:700}',
      '.family-group-list{display:grid;gap:10px}',
      '.family-group-list article{display:flex;align-items:center;justify-content:space-between;gap:14px}',
      '.family-group-list b{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border-radius:999px;background:#eaf3ff;color:#2f7ee6;font-size:13px}',
      'html.home-clean-header .topbar{margin-bottom:14px}',
      '@media(max-width:760px){.family-group-summary{grid-template-columns:1fr}.family-group-list article{align-items:flex-start;flex-direction:column}.passive-header-chip{min-height:30px;padding:0 11px;font-size:12px}}'
    ].join('\n')
    document.head.appendChild(style)
  }

  function removeHomeHeaderChrome() {
    var topbar = document.querySelector('.topbar')
    if (!topbar) return
    var title = getCleanText(topbar.querySelector('h1'))
    var isCustomPatchPage = document.documentElement.dataset.patchPage === 'community' || document.documentElement.dataset.patchPage === 'family-group'
    if (title !== '\uD648' || isCustomPatchPage) return
    var titleGroup = topbar.querySelector(':scope > div:first-child')
    if (titleGroup) titleGroup.remove()
    topbar.querySelectorAll('.top-actions > .custom-select, .top-actions > .user-chip').forEach(function (item) {
      item.remove()
    })
  }

  function syncHomeCleanHeader() {
    var title = getCleanText(document.querySelector('.topbar h1'))
    var isCustomPatchPage = document.documentElement.dataset.patchPage === 'community' || document.documentElement.dataset.patchPage === 'family-group'
    document.documentElement.classList.toggle('home-clean-header', title === '\uD648' && !isCustomPatchPage)
    removeHomeHeaderChrome()
  }

  function cleanupPassiveButtons() {
    ensureUiCleanupStyles()
    syncHomeCleanHeader()
    document.querySelectorAll('.topbar .primary-action, .top-actions .primary-action, .hero-actions .primary-action').forEach(function (button) {
      if (getCleanText(button) === '\uC0C8 \uAE30\uB85D') hidePatchElement(button)
    })

    document.querySelectorAll('.panel-header button, .server-domain-panel header button').forEach(function (button) {
      var text = getCleanText(button)
      if (!text) return
      var compactText = text.replace(/\s+/g, '')
      if (compactText === '\uC124\uC815\uBC18\uC601' || compactText === '\uC800\uC7A5\uB428' || compactText === '\uC989\uC2DC\uBC18\uC601') {
        button.remove()
        return
      }
      if (text === '\uC11C\uBC84 \uC870\uD68C' || /^\d+\uAC1C$/.test(text) || /^\d+\uAC74$/.test(text) || /^\d+\uACF3$/.test(text) || /^\d{1,2}\uC6D4\s+\d{1,2}\uC77C/.test(text)) {
        replaceButtonWithBadge(button, 'passive-header-chip')
      }
    })
  }

  function hideAdminMenuAddButton() {
    document.querySelectorAll('button').forEach(function (button) {
      var text = getCleanText(button).replace(/\s+/g, '')
      if (text !== '\uBA54\uB274\uCD94\uAC00') return
      var scope = button.closest('.panel, section, article, form, .content-grid') || document.body
      var scopeText = getCleanText(scope)
      if (scopeText.indexOf('\uBA54\uB274') < 0 && getCleanText(document.querySelector('.topbar h1')).indexOf('\uAD00\uB9AC\uC790') < 0) return
      button.classList.add('admin-menu-add-hidden')
    })
  }

  function cleanupCalendarChrome() {
    var titleButton = document.querySelector('.family-calendar-panel .calendar-title-button')
    if (titleButton) {
      titleButton.setAttribute('aria-label', '\uB0A0\uC9DC \uC774\uB3D9')
      titleButton.querySelectorAll('span').forEach(function (span) {
        if (getCleanText(span).indexOf('\uC624\uB298') >= 0) hidePatchElement(span)
      })
    }

    var iconButtons = Array.from(document.querySelectorAll('.top-actions .icon-button, .summary-actions .icon-button'))
    iconButtons.forEach(function (button, index) {
      var label = button.getAttribute('aria-label') || button.getAttribute('title') || ''
      if (!label) {
        label = index === 0 ? '\uD14C\uB9C8 \uBCC0\uACBD' : '\uCE98\uB9B0\uB354'
        button.setAttribute('aria-label', label)
        button.setAttribute('title', label)
      }
      if (label.indexOf('\uCE98\uB9B0\uB354') >= 0) {
        hidePatchElement(button)
      }
    })

    document.querySelectorAll('.top-actions, .summary-actions').forEach(function (group) {
      var blankIconButtons = Array.from(group.querySelectorAll('.icon-button')).filter(function (button) {
        return !getCleanText(button)
      })
      blankIconButtons.forEach(function (button, index) {
        if (index > 0) {
          button.setAttribute('aria-label', '\uCE98\uB9B0\uB354')
          button.setAttribute('title', '\uCE98\uB9B0\uB354')
          hidePatchElement(button)
        } else if (!button.getAttribute('aria-label')) {
          button.setAttribute('aria-label', '\uD14C\uB9C8 \uBCC0\uACBD')
          button.setAttribute('title', '\uD14C\uB9C8 \uBCC0\uACBD')
        }
      })
    })
  }

  function syncCalendarEntryToToday() {
    var isCalendar = !!document.querySelector('.family-calendar-panel') && getCleanText(document.querySelector('.topbar h1')) === '\uCE98\uB9B0\uB354'
    if (!isCalendar) {
      window.__familyCalendarEntryActive = false
      return
    }
    if (window.__familyCalendarEntryActive) return
    window.__familyCalendarEntryActive = true
      var today = new Date()
      modes.forEach(function (mode) {
        if (!getCalendarModeDate(mode)) setCalendarModeDate(mode, today)
      })
      document.documentElement.dataset.calendarSelectedDate = formatDate(today)
      updateScheduleFormVisibleDate(today)
      updateJumpInput(today)
      window.__familySuppressCalendarPopupUntil = Date.now() + 2500
      window.setTimeout(function () {
        moveCalendarTo(today).then(function () {
        updateSelectedDayPanel(today)
        refreshServerDataViews(true)
      }).catch(function () {})
    }, 160)
  }

  function cleanupStaleServerPanels() {
    if (window.__serverPanelCleanupScheduled) return
    window.__serverPanelCleanupScheduled = true
    window.setTimeout(function () {
      window.__serverPanelCleanupScheduled = false
      runStaleServerPanelCleanup()
    }, 350)
  }

  function runStaleServerPanelCleanup() {
    var title = getCleanText(document.querySelector('.topbar h1'))
    var stalePanels = [
      { selector: '.server-ledger-list', title: '\uAC00\uACC4\uBD80' },
      { selector: '.server-travel-list', title: '\uC5EC\uD589' },
      { selector: '.server-diary-list', title: '\uC77C\uAE30' },
      { selector: '.server-baby-list', title: '\uC721\uC544' }
    ]
    stalePanels.forEach(function (item) {
      if (title === item.title) return
      document.querySelectorAll(item.selector).forEach(function (panel) {
        panel.remove()
      })
    })
    var staleForms = [
      { selector: '.restaurant-form, .restaurant-grid', title: '\uB9DB\uC9D1' },
      { selector: '.trip-manager', title: '\uC5EC\uD589' },
      { selector: '.diary-api-composer, .diary-section', title: '\uC77C\uAE30' },
      { selector: '.baby-api-detail, .baby-profile-edit-backdrop', title: '\uC721\uC544' },
      { selector: '.schedule-form-card', title: '\uCE98\uB9B0\uB354' }
    ]
    staleForms.forEach(function (item) {
      if (title === item.title) return
      document.querySelectorAll(item.selector).forEach(function (node) {
        var panel = node.closest && node.closest('.panel')
        ;(panel || node).remove()
      })
    })
  }

