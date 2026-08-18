  function findNavButton(label) {
    return Array.from(document.querySelectorAll('.nav-item')).find(function (button) {
      return getCleanText(button) === label
    })
  }

  function findNavButtonContains(label) {
    return Array.from(document.querySelectorAll('.nav-item')).find(function (button) {
      return getCleanText(button).indexOf(label) >= 0
    })
  }

  function isCommunityNavItem(element) {
    if (!element) return false
    return element.classList.contains('community-nav-item') || getCleanText(element).indexOf('\uCEE4\uBBA4\uB2C8\uD2F0') >= 0
  }

  function queueOpenCommunityPage(force) {
    window.clearTimeout(window.__communityOpenTimer)
    window.__communityOpenTimer = window.setTimeout(function () {
      openCommunityPage(force)
    }, 30)
  }

  function pausePatchObserver() {
    if (typeof observer !== 'undefined' && observer) {
      observer.disconnect()
      window.__patchObserverPaused = true
    }
  }

  function resumePatchObserver() {
    if (typeof observer !== 'undefined' && observer && window.__patchObserverPaused) {
      observer.observe(document.documentElement, { childList: true, subtree: true })
      window.__patchObserverPaused = false
    }
  }

  function goMenu(label) {
    var button = findNavButton(label)
    if (button) triggerNavButton(button)
  }

  function triggerNavButton(button) {
    if (!button) return
    ;['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
      try {
        var EventCtor = type.indexOf('pointer') === 0 && window.PointerEvent ? window.PointerEvent : window.MouseEvent
        button.dispatchEvent(new EventCtor(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true
        }))
      } catch {
        try {
          var event = document.createEvent('MouseEvents')
          event.initMouseEvent(type, true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null)
          button.dispatchEvent(event)
        } catch {}
      }
    })
  }

  function setPendingNavLabel(label) {
    try {
      sessionStorage.setItem(PENDING_NAV_STORAGE_KEY, label)
    } catch {}
  }

  function clearPendingNavLabel(label) {
    try {
      if (!label || sessionStorage.getItem(PENDING_NAV_STORAGE_KEY) === label) {
        sessionStorage.removeItem(PENDING_NAV_STORAGE_KEY)
      }
    } catch {}
  }

  function consumePendingNavLabel() {
    if (document.querySelector('.auth-card') || !document.querySelector('.app-shell')) return
    if (document.documentElement.dataset.pendingNavApplying === 'true') return
    var label = ''
    try {
      label = sessionStorage.getItem(PENDING_NAV_STORAGE_KEY) || ''
    } catch {
      label = ''
    }
    if (!label) {
      try {
        label = new URL(window.location.href).searchParams.get('recoverNav') || ''
      } catch {
        label = ''
      }
    }
    if (!label) return
    try {
      var navUrl = new URL(window.location.href)
      if (navUrl.searchParams.has('recoverNav')) {
        navUrl.searchParams.delete('recoverNav')
        navUrl.searchParams.delete('navRecoverAt')
        window.history.replaceState({}, document.title, navUrl.pathname + navUrl.search + navUrl.hash)
      }
    } catch {}
    var currentTitle = getCleanText(document.querySelector('.topbar h1, h1'))
    if (currentTitle === label) {
      clearPendingNavLabel(label)
      return
    }
    var target = findNavButton(label)
    if (!target) return
    document.documentElement.dataset.pendingNavApplying = 'true'
    ;[250, 800, 1500, 2400].forEach(function (delay) {
      window.setTimeout(function () {
        var current = getCleanText(document.querySelector('.topbar h1, h1'))
        if (current === label) {
          clearPendingNavLabel(label)
          return
        }
        var nextTarget = findNavButton(label)
        if (nextTarget) triggerNavButton(nextTarget)
      }, delay)
    })
    window.setTimeout(function () {
      if (getCleanText(document.querySelector('.topbar h1, h1')) === label) {
        clearPendingNavLabel(label)
      } else if (label === '\uC721\uC544') {
        openRecoveredBabyPage()
        clearPendingNavLabel(label)
      }
      delete document.documentElement.dataset.pendingNavApplying
    }, 3200)
  }

  function openRecoveredBabyPage() {
    if (document.querySelector('.auth-card') || !document.querySelector('.app-shell')) return
    pausePatchObserver()
    clearCustomPatchPageNow()
    delete document.documentElement.dataset.patchPage
    setNavActive('\uC721\uC544')

    var eyebrow = document.querySelector('.topbar .eyebrow')
    var title = document.querySelector('.topbar h1')
    if (eyebrow) eyebrow.textContent = '\uC218\uC720, \uBC30\uBCC0, \uC131\uC7A5 \uAE30\uB85D'
    if (title) title.textContent = '\uC721\uC544'

    var workspace = document.querySelector('.workspace') || document.querySelector('main')
    if (!workspace) return
    var content = document.querySelector('.content-grid')
    if (!content) {
      content = document.createElement('div')
      content.className = 'content-grid'
      workspace.appendChild(content)
    }
    content.className = 'content-grid baby-recovered-grid'
    delete content.dataset.communityReady
    content.innerHTML = [
      '<section class="panel wide baby-main-panel">',
      '<header class="panel-header"><h2>\uC721\uC544 \uAE30\uB85D</h2></header>',
      '<div class="baby-list-grid"></div>',
      '</section>'
    ].join('')

    renderBabyApiCards(true)
    ensureBabyMainActions()
    normalizeBabyCreateDialog()
    window.setTimeout(function () {
      renderBabyApiCards(true)
      ensureBabyMainActions()
      enhanceBabyProfileEdit()
      cleanupBabyDetailButtons()
      resumePatchObserver()
    }, 250)
  }

