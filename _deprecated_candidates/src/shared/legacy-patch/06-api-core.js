  var API_BASE_URL = window.FAMILY_PLATFORM_API_BASE_URL || localStorage.getItem('family-platform-api-base-url') || '/api'
  var API_QUEUE_KEY = 'family-platform-api-sync-queue'
  var LEDGER_QUEUE_CLEANUP_KEY = 'family-platform-ledger-queue-cleaned-20260614-01'
  var API_TRIP_ID_KEY = AUTH_TRIP_STORAGE_KEY
  var API_AUTH_TOKEN_KEY = AUTH_TOKEN_STORAGE_KEY
  var API_FAMILY_ID_KEY = AUTH_FAMILY_STORAGE_KEY

  function readSyncQueue() {
    try {
      return JSON.parse(localStorage.getItem(API_QUEUE_KEY) || '[]')
    } catch (error) {
      return []
    }
  }

  function writeSyncQueue(queue) {
    localStorage.setItem(API_QUEUE_KEY, JSON.stringify(queue.slice(-100)))
  }

  function queueApiSync(task) {
    var queue = readSyncQueue()
    queue.push(Object.assign({ id: Date.now() + '-' + Math.random().toString(16).slice(2), createdAt: new Date().toISOString() }, task))
    writeSyncQueue(queue)
  }

  function purgeStaleLedgerSyncQueueOnce() {
    if (localStorage.getItem(LEDGER_QUEUE_CLEANUP_KEY) === 'true') return
    var queue = readSyncQueue()
    var next = queue.filter(function (task) {
      return task && task.type !== 'createLedgerEntry'
    })
    if (next.length !== queue.length) writeSyncQueue(next)
    localStorage.setItem(LEDGER_QUEUE_CLEANUP_KEY, 'true')
  }

  function apiRequest(path, options) {
    var token = getStoredAuthToken()
    var headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = 'Bearer ' + token
    return fetch(API_BASE_URL + path, Object.assign({
      headers: headers
    }, options || {})).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (message) {
          var error = new Error(message || ('API ' + response.status))
          error.status = response.status
          if (response.status === 401 && String(message || '').indexOf('invalid session') >= 0) {
            forceClearStoredAuth()
          }
          throw error
        })
      }
      if (response.status === 204) return null
      return response.json()
    })
  }

  function apiErrorText(error) {
    var raw = String((error && error.message) || error || '')
    if (!raw) return ''
    try {
      var parsed = JSON.parse(raw)
      return String(parsed.message || parsed.error || raw)
    } catch (parseError) {
      return raw
    }
  }

  function apiActionErrorMessage(error, fallback) {
    var text = apiErrorText(error)
    var status = error && error.status
    if (status === 401 || text.indexOf('invalid session') >= 0) return '\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.'
    if (status === 403 || text.indexOf('permission denied') >= 0 || text.indexOf('permission required') >= 0) return '\uAD8C\uD55C\uC774 \uC5C6\uC5B4 \uCC98\uB9AC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.'
    if (text.indexOf('family admin') >= 0) return '\uAC00\uC871\uAD00\uB9AC\uC790\uB294 \uCD5C\uC18C 1\uBA85 \uD544\uC694\uD569\uB2C8\uB2E4.'
    if (text.indexOf('No family group available') >= 0) return '\uAC00\uC871\uADF8\uB8F9\uC744 \uBA3C\uC800 \uC0DD\uC131\uD574\uC8FC\uC138\uC694.'
    if (text.indexOf('name, gender') >= 0) return '\uC774\uB984, \uC131\uBCC4\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.'
    if (text.indexOf('nickname is ambiguous') >= 0) return '\uB2C9\uB124\uC784\uC774 \uC911\uBCF5\uB429\uB2C8\uB2E4. \uC774\uBA54\uC77C\uB85C \uCD08\uB300\uD574\uC8FC\uC138\uC694.'
    if (text.indexOf('user not found') >= 0) return '\uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.'
    if (text.indexOf('resource not found') >= 0 || text.indexOf('not found') >= 0 || status === 404) return '\uB300\uC0C1 \uB370\uC774\uD130\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.'
    if (text.indexOf('already belongs') >= 0) return '\uC774\uBBF8 \uAC00\uC871\uADF8\uB8F9\uC5D0 \uC18D\uD574 \uC788\uC2B5\uB2C8\uB2E4.'
    if (text.indexOf('invitation already exists') >= 0) return '\uC774\uBBF8 \uCD08\uB300\uAC00 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4.'
    if (status === 400 || text.indexOf('required') >= 0 || text.indexOf('invalid') >= 0 || text.indexOf('cannot be before') >= 0) return '\uC785\uB825\uAC12\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.'
    if (status === 409) return '\uC774\uBBF8 \uCC98\uB9AC\uB41C \uB370\uC774\uD130\uC774\uAC70\uB098 \uC0C1\uD0DC\uAC00 \uCDA9\uB3CC\uD569\uB2C8\uB2E4.'
    if (status >= 500 || text.indexOf('database') >= 0 || text.indexOf('save failed') >= 0) return '\uC2DC\uC2A4\uD15C \uBB38\uC81C\uB85C \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.'
    if (text.indexOf('Failed to fetch') >= 0 || text.indexOf('NetworkError') >= 0) return '\uB124\uD2B8\uC6CC\uD06C\uAC00 \uC548\uC815\uC801\uC774\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC5F0\uACB0\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.'
    return fallback || '처리에 실패했습니다.'
  }

  var notificationState = {
    loadedAt: 0,
    items: []
  }

  function getNotificationMount() {
    return document.querySelector('.top-actions') ||
      document.querySelector('.hero-actions') ||
      document.querySelector('.app-header') ||
      document.querySelector('.content-header') ||
      document.querySelector('main') ||
      document.body
  }

  function placeNotificationBell(wrap, mount) {
    if (!wrap || !mount) return
    wrap.classList.remove('floating')
    var themeButton = Array.from(mount.querySelectorAll('.icon-button, button')).find(function (button) {
      var label = (button.getAttribute('aria-label') || button.getAttribute('title') || getCleanText(button)).trim()
      return label.indexOf('\uD14C\uB9C8') >= 0 || label.indexOf('\uB2E4\uD06C') >= 0 || label.indexOf('\uBAA8\uB4DC') >= 0
    })
    if (themeButton && themeButton.parentElement === mount) {
      themeButton.insertAdjacentElement('afterend', wrap)
      return
    }
    var logout = Array.from(mount.querySelectorAll('button')).find(function (button) {
      return getCleanText(button).replace(/\s+/g, '') === '\uB85C\uADF8\uC544\uC6C3'
    })
    if (logout) mount.insertBefore(wrap, logout)
    else mount.appendChild(wrap)
  }

  function ensureNotificationBell() {
    if (!getStoredAuthToken()) return null
    var existing = document.querySelector('.schedule-notification-bell')
    var mount = getNotificationMount()
    if (!mount) return null
    if (existing) {
      placeNotificationBell(existing.closest('.schedule-notification-wrap') || existing, mount)
      return existing
    }

    var wrap = document.createElement('div')
    wrap.className = 'schedule-notification-wrap'

    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'schedule-notification-bell'
    button.setAttribute('aria-label', '\uC77C\uC815 \uC54C\uB9BC')
    button.innerHTML = '<span class="schedule-notification-icon">\uD83D\uDD14</span><span class="schedule-notification-dot" hidden></span>'
    button.addEventListener('click', function () {
      toggleNotificationPopup()
    })

    wrap.appendChild(button)
    if (mount === document.body || mount.tagName === 'MAIN') {
      wrap.classList.add('floating')
      document.body.appendChild(wrap)
    } else {
      placeNotificationBell(wrap, mount)
    }
    return button
  }

  function renderNotificationBell() {
    var button = ensureNotificationBell()
    if (!button) return
    var dot = button.querySelector('.schedule-notification-dot')
    if (dot) dot.hidden = notificationState.items.length === 0
    button.classList.toggle('has-unread', notificationState.items.length > 0)
  }

  function openNotificationPopup() {
    var old = document.querySelector('.schedule-notification-popup')
    if (old) old.remove()

    var popup = document.createElement('section')
    popup.className = 'schedule-notification-popup'
    popup.innerHTML = '<header><strong>\uC77C\uC815 \uC54C\uB9BC</strong><button type="button" aria-label="\uB2EB\uAE30">x</button></header>'

    var body = document.createElement('div')
    body.className = 'schedule-notification-list'
    if (!notificationState.items.length) {
      body.innerHTML = '<p>\uB4F1\uB85D\uB41C \uC77C\uC815 \uC54C\uB9BC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
    } else {
      body.innerHTML = notificationState.items.map(function (item) {
        return '<button type="button" class="schedule-notification-item" data-id="' + item.id + '" data-type="' + escapeHtml(item.type || 'schedule') + '">' +
          '<span>' + escapeHtml(item.title || '\uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC788\uC2B5\uB2C8\uB2E4.') + '</span>' +
          '<strong>' + escapeHtml(item.body || '') + '</strong>' +
          '<small>' + escapeHtml(item.targetDate || '') + '</small>' +
          '</button>'
      }).join('')
    }
    popup.appendChild(body)

    var footer = document.createElement('footer')
    footer.innerHTML = '<button type="button" class="schedule-notification-read-all">\uBAA8\uB450 \uC77D\uC74C</button><button type="button" class="schedule-notification-calendar">\uCE98\uB9B0\uB354</button>'
    popup.appendChild(footer)

    document.body.appendChild(popup)

    popup.querySelector('header button').addEventListener('click', function () {
      popup.remove()
    })
    popup.querySelector('.schedule-notification-read-all').addEventListener('click', function () {
      markAllNotificationsRead()
    })
    popup.querySelector('.schedule-notification-calendar').addEventListener('click', function () {
      popup.remove()
      goMenu('\uCE98\uB9B0\uB354')
    })
    popup.querySelectorAll('.schedule-notification-item').forEach(function (item) {
      item.addEventListener('click', function () {
        if (item.dataset.type === 'family-invitation' || String(item.dataset.type || '').indexOf('FAMILY_') === 0) {
          if (item.dataset.type !== 'family-invitation') markNotificationRead(item.dataset.id)
          popup.remove()
          goMenu('\uAC00\uC871\uADF8\uB8F9')
          return
        }
        markNotificationRead(item.dataset.id)
        popup.remove()
        goMenu('\uCE98\uB9B0\uB354')
      })
    })
  }

  function toggleNotificationPopup() {
    var old = document.querySelector('.schedule-notification-popup')
    if (old) {
      old.remove()
      return
    }
    openNotificationPopup()
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
    })
  }

  function loadFamilyInvitationNotifications() {
    if (!getStoredAuthToken()) return Promise.resolve([])
    return apiRequest('/family-invitations').then(function (items) {
      return (Array.isArray(items) ? items : []).map(function (item) {
        return {
          id: 'family-invitation-' + item.id,
          type: 'family-invitation',
          title: '\uAC00\uC871\uADF8\uB8F9 \uCD08\uB300\uAC00 \uC788\uC2B5\uB2C8\uB2E4.',
          body: (item.familyName || '\uAC00\uC871\uADF8\uB8F9') + ' \u00B7 ' + (item.inviterName || '\uCD08\uB300\uC790'),
          targetDate: '\uD655\uC778\uD558\uB824\uBA74 \uB204\uB974\uC138\uC694.'
        }
      })
    }).catch(function () {
      return []
    })
  }

  function loadScheduleNotifications(force) {
    if (!getStoredAuthToken()) return Promise.resolve([])
    if (!force && Date.now() - notificationState.loadedAt < 30000) {
      renderNotificationBell()
      return Promise.resolve(notificationState.items)
    }
    return apiRequest('/notifications?unreadOnly=true').then(function (items) {
      var scheduleItems = Array.isArray(items) ? items : []
      return loadFamilyInvitationNotifications().then(function (inviteItems) {
        notificationState.items = inviteItems.concat(scheduleItems)
        notificationState.loadedAt = Date.now()
        renderNotificationBell()
        var acceptedInvite = scheduleItems.find(function (item) {
          return String(item.type || '') === 'FAMILY_INVITE_ACCEPTED'
        })
        if (inviteItems.length && !sessionStorage.getItem('family-platform-invitation-notification-seen')) {
          sessionStorage.setItem('family-platform-invitation-notification-seen', 'true')
          showPatchToast('\uAC00\uC871\uADF8\uB8F9 \uCD08\uB300\uAC00 \uC788\uC2B5\uB2C8\uB2E4.')
        } else if (acceptedInvite && !sessionStorage.getItem('family-platform-invite-accepted-seen')) {
          sessionStorage.setItem('family-platform-invite-accepted-seen', 'true')
          showPatchToast(acceptedInvite.title || '\uCD08\uB300\uAC00 \uC218\uB77D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
        } else if (scheduleItems.length && !sessionStorage.getItem('family-platform-schedule-notification-seen')) {
          sessionStorage.setItem('family-platform-schedule-notification-seen', 'true')
          showPatchToast('\uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC788\uC2B5\uB2C8\uB2E4.')
        }
        return notificationState.items
      })
    }).catch(function () {
      return []
    })
  }

  function markNotificationRead(id) {
    if (!id) return
    apiRequest('/notifications/' + encodeURIComponent(id) + '/read', { method: 'PATCH' }).then(function () {
      notificationState.loadedAt = 0
      loadScheduleNotifications(true)
    }).catch(function () {})
  }

  function markAllNotificationsRead() {
    apiRequest('/notifications/read-all', { method: 'PATCH' }).then(function () {
      notificationState.items = []
      notificationState.loadedAt = Date.now()
      renderNotificationBell()
      var popup = document.querySelector('.schedule-notification-popup')
      if (popup) popup.remove()
    }).catch(function () {})
  }

  function postJson(path, body) {
    return apiRequest(path, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  }

  function apiDate(value) {
    var date = value instanceof Date ? value : new Date(String(value || todayText()) + 'T00:00:00')
    return formatDate(date)
  }

  function monthRangeFor(dateText) {
    var date = new Date(String(dateText || todayText()) + 'T00:00:00')
    var start = new Date(date.getFullYear(), date.getMonth(), 1)
    var end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    return { start: apiDate(start), end: apiDate(end) }
  }

  function fetchSchedules(startDate, endDate) {
    if (!getStoredAuthToken()) return Promise.resolve([])
    return readWithReadableFamily(function (familyId) {
      return '/schedules?familyId=' + encodeURIComponent(familyId) +
        '&startDate=' + encodeURIComponent(startDate) +
        '&endDate=' + encodeURIComponent(endDate)
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchLedgerEntries(startDate, endDate) {
    if (!getStoredAuthToken()) return Promise.resolve([])
    return readWithReadableFamily(function (familyId) {
      return '/ledger-entries?familyId=' + encodeURIComponent(familyId) +
        '&startDate=' + encodeURIComponent(startDate) +
        '&endDate=' + encodeURIComponent(endDate)
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchLedgerSummary(startDate, endDate) {
    if (!getStoredAuthToken()) return Promise.resolve({ expense: 0, income: 0, total: 0 })
    return readWithReadableFamily(function (familyId) {
      return '/ledger-entries/summary?familyId=' + encodeURIComponent(familyId) +
        '&startDate=' + encodeURIComponent(startDate) +
        '&endDate=' + encodeURIComponent(endDate)
    }).then(function (summary) {
      return summary || { expense: 0, income: 0, total: 0 }
    }).catch(function () {
      return { expense: 0, income: 0, total: 0 }
    })
  }

  function moneyText(value, type) {
    var amount = Number(value || 0).toLocaleString('ko-KR')
    return (type === 'income' ? '+' : '-') + amount + '\uC6D0'
  }

