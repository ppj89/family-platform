(function () {
  var DAY_MS = 86400000
  var WEEK_MS = DAY_MS * 7
  var modes = ['day', 'week', 'month', 'year']
  var AUTH_TOKEN_STORAGE_KEY = 'family-platform-access-token'
  var AUTH_USER_STORAGE_KEY = 'family-platform-user'
  var AUTH_FAMILY_STORAGE_KEY = 'family-platform-current-family-id'
  var AUTH_TRIP_STORAGE_KEY = 'family-platform-api-default-trip-id'
  var AUTH_REMEMBER_EMAIL_STORAGE_KEY = 'family-platform-remember-email'
  var AUTH_REMEMBER_EMAIL_ENABLED_STORAGE_KEY = 'family-platform-remember-email-enabled'
  var AUTH_AUTO_LOGIN_STORAGE_KEY = 'family-platform-auto-login'
  var PENDING_NAV_STORAGE_KEY = 'family-platform-pending-nav-label'
  var protectedAuthUntil = 0
  var protectedAuthSnapshot = null

  function callEarlyDiarySubmitHandler(event) {
    var handler = window.__familyDiaryDirectSubmitHandler
    if (typeof handler === 'function') handler(event)
  }

  ;['pointerdown', 'mousedown', 'click', 'submit'].forEach(function (type) {
    document.addEventListener(type, callEarlyDiarySubmitHandler, true)
  })

  window.setInterval(function () {
    var existingToken = getStoredAuthToken()
    var existingUser = readStoredAuthUser()
    if (existingToken && existingUser && existingUser.email) {
      if (!protectedAuthSnapshot || protectedAuthSnapshot.token !== existingToken) {
        protectedAuthSnapshot = {
          token: existingToken,
          user: existingUser,
          persistent: shouldPersistAuthSession() && !!localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
        }
        protectedAuthUntil = Date.now() + 365 * 24 * 60 * 60 * 1000
      }
      return
    }
    if (!protectedAuthSnapshot || !protectedAuthSnapshot.token) return
    if (Date.now() > protectedAuthUntil) return
    writeAuthSession(protectedAuthSnapshot.token, protectedAuthSnapshot.user, protectedAuthSnapshot.persistent)
  }, 500)
  var MEDIA_MAX_FILES = 6
  var MEDIA_MAX_IMAGE_BYTES = 8 * 1024 * 1024
  var MEDIA_MAX_VIDEO_BYTES = 30 * 1024 * 1024
  var MEDIA_MAX_TOTAL_BYTES = 40 * 1024 * 1024
  var HOLIDAY_DATES = {
    '2026-01-01': '\uC2E0\uC815',
    '2026-02-16': '\uC124\uC5F0\uD734',
    '2026-02-17': '\uC124\uB0A0',
    '2026-02-18': '\uC124\uC5F0\uD734',
    '2026-03-01': '3\u00B71\uC808',
    '2026-03-02': '\uB300\uCCB4\uACF5\uD734\uC77C',
    '2026-05-05': '\uC5B4\uB9B0\uC774\uB0A0',
    '2026-05-24': '\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0',
    '2026-05-25': '\uB300\uCCB4\uACF5\uD734\uC77C',
    '2026-06-03': '\uC9C0\uBC29\uC120\uAC70',
    '2026-06-06': '\uD604\uCDA9\uC77C',
    '2026-08-15': '\uAD11\uBCF5\uC808',
    '2026-08-17': '\uB300\uCCB4\uACF5\uD734\uC77C',
    '2026-09-24': '\uCD94\uC11D\uC5F0\uD734',
    '2026-09-25': '\uCD94\uC11D',
    '2026-09-26': '\uCD94\uC11D\uC5F0\uD734',
    '2026-10-03': '\uAC1C\uCC9C\uC808',
    '2026-10-05': '\uB300\uCCB4\uACF5\uD734\uC77C',
    '2026-10-09': '\uD55C\uAE00\uB0A0',
    '2026-12-25': '\uC131\uD0C4\uC808'
  }

  function parseDate(value) {
    if (!value) return null
    var normalized = value.trim().replace(/\./g, '-')
    var parts = normalized.split('-').map(function (part) {
      return Number(part)
    })
    if (parts.length !== 3 || parts.some(function (part) { return !Number.isFinite(part) })) return null
    return new Date(parts[0], parts[1] - 1, parts[2])
  }

  function formatDate(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-')
  }

  function formatDotDate(date) {
    return formatDate(date).replace(/-/g, '.')
  }

  function getHolidayName(date) {
    var key = typeof date === 'string' ? date : formatDate(date)
    return HOLIDAY_DATES[key] || ''
  }

  function syncHolidayNameLabel(card, dateKey) {
    if (!card) return
    var name = getHolidayName(dateKey)
    var label = card.querySelector('.holiday-name')
    if (!name) {
      if (label) label.remove()
      card.removeAttribute('data-holiday-name')
      return
    }
    if (!label) {
      label = document.createElement('span')
      label.className = 'holiday-name'
      var anchor = card.querySelector('.day-chip-stack, .fc-day-schedules')
      if (anchor && anchor.parentElement === card) card.insertBefore(label, anchor)
      else card.appendChild(label)
    }
    label.textContent = name
    card.dataset.holidayName = name
  }

  function addDays(date, amount) {
    var next = new Date(date)
    next.setDate(next.getDate() + amount)
    return next
  }

  function weekStart(date) {
    return addDays(date, -date.getDay())
  }

  function monthDiff(from, to) {
    return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  }

  function getActiveCalendarMode() {
    var buttons = Array.from(document.querySelectorAll('.family-calendar-panel .calendar-view-tabs button'))
    var activeIndex = buttons.findIndex(function (button) {
      return button.classList.contains('active')
    })
    return modes[activeIndex] || 'month'
  }

  function calendarModeDateKey(mode) {
    return 'calendar' + String(mode || getActiveCalendarMode()).replace(/^[a-z]/, function (char) {
      return char.toUpperCase()
    }) + 'Date'
  }

  function getCalendarModeDate(mode) {
    return parseDate(document.documentElement.dataset[calendarModeDateKey(mode)] || '')
  }

  function setCalendarModeDate(mode, date) {
    if (!date) return
    document.documentElement.dataset[calendarModeDateKey(mode)] = formatDate(date)
  }

  function ensureCalendarModeDefaultDates() {
    if (!document.querySelector('.family-calendar-panel')) return
    var today = new Date()
    modes.forEach(function (mode) {
      if (!getCalendarModeDate(mode)) setCalendarModeDate(mode, today)
    })
  }

  function getTitleNumbers() {
    var title = document.querySelector('.family-calendar-panel .calendar-title-button strong')
    var text = title ? title.textContent.trim() : ''
    return (text.match(/\d+/g) || []).map(function (part) {
      return Number(part)
    })
  }

  function getFocusedDate() {
    var numbers = getTitleNumbers()
    var now = new Date()

    if (numbers.length >= 3 && numbers[0] > 1900) {
      return new Date(numbers[0], numbers[1] - 1, numbers[2])
    }

    if (numbers.length >= 2 && numbers[0] > 1900) {
      return new Date(numbers[0], numbers[1] - 1, 1)
    }

    if (numbers.length >= 2) {
      return new Date(now.getFullYear(), numbers[0] - 1, numbers[1])
    }

    if (numbers.length === 1 && numbers[0] > 1900) {
      return new Date(numbers[0], 0, 1)
    }

    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }

  function installDirectCalendarPopupHandler() {
    if (window.__familyDirectCalendarPopupReady) return
    window.__familyDirectCalendarPopupReady = true

    function shortDate(date) {
      return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    }

    function currentToken() {
      return getStoredAuthToken()
    }

    function apiGet(path) {
      var token = currentToken()
      if (!token) return Promise.resolve(null)
      return fetch('/api' + path, { headers: { Authorization: 'Bearer ' + token } }).then(function (response) {
        if (!response.ok) return null
        return response.json()
      }).catch(function () { return null })
    }

    function removeSchedulePopups(keepDayList) {
      var selector = keepDayList
        ? '.schedule-item-patch-backdrop, .schedule-detail-patch-backdrop:not(.schedule-day-patch-backdrop)'
        : '.schedule-detail-patch-backdrop, .schedule-day-patch-backdrop'
      document.querySelectorAll(selector).forEach(function (node) {
        node.remove()
      })
    }

    function showScheduleDetail(date, item, keepDayList) {
      removeSchedulePopups(keepDayList)
      var backdrop = document.createElement('div')
      backdrop.className = 'schedule-detail-patch-backdrop schedule-item-patch-backdrop'
      var dialog = document.createElement('section')
      dialog.className = 'schedule-detail-patch-dialog'
      var close = document.createElement('button')
      close.type = 'button'
      close.className = 'schedule-detail-patch-close'
      close.textContent = 'x'
      close.addEventListener('click', function () { backdrop.remove() })
      var dateLabel = document.createElement('span')
      dateLabel.className = 'schedule-detail-patch-date'
      dateLabel.textContent = shortDate(date)
      var heading = document.createElement('h2')
      heading.textContent = item.title || '\uC77C\uC815 \uC0C1\uC138'
      var meta = document.createElement('p')
      meta.textContent = [
        item.scheduleTime ? String(item.scheduleTime).slice(0, 5) : '\uC2DC\uAC04 \uBBF8\uC815',
        item.category || '\uC77C\uC815',
        item.memberName || ''
      ].filter(Boolean).join(' \u00B7 ')
      var memo = document.createElement('div')
      memo.className = 'schedule-detail-patch-memo'
      memo.textContent = item.memo || '\uB4F1\uB85D\uB41C \uBA54\uBAA8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.'
      dialog.appendChild(close)
      dialog.appendChild(dateLabel)
      dialog.appendChild(heading)
      dialog.appendChild(meta)
      dialog.appendChild(memo)
      backdrop.appendChild(dialog)
      backdrop.addEventListener('click', function (event) {
        if (event.target === backdrop) backdrop.remove()
      })
      document.body.appendChild(backdrop)
    }

    function showSchedules(date, items) {
      if (!items || !items.length) {
        removeSchedulePopups()
        return
      }
      removeSchedulePopups()
      var backdrop = document.createElement('div')
      backdrop.className = 'schedule-day-patch-backdrop schedule-detail-patch-backdrop'
      var dialog = document.createElement('section')
      dialog.className = 'schedule-day-patch-dialog schedule-detail-patch-dialog'
      var close = document.createElement('button')
      close.type = 'button'
      close.className = 'schedule-detail-patch-close'
      close.textContent = 'x'
      close.addEventListener('click', function () { backdrop.remove() })
      var dateLabel = document.createElement('span')
      dateLabel.className = 'schedule-detail-patch-date'
      dateLabel.textContent = shortDate(date)
      var heading = document.createElement('h2')
      heading.textContent = '\uC120\uD0DD\uC77C \uC77C\uC815'
      var list = document.createElement('div')
      list.className = 'schedule-day-patch-list'
      items.forEach(function (item) {
        var button = document.createElement('button')
        button.type = 'button'
        button.textContent = (item.scheduleTime ? String(item.scheduleTime).slice(0, 5) + ' ' : '') + (item.title || '\uC77C\uC815')
        button.addEventListener('click', function () { showScheduleDetail(date, item, true) })
        list.appendChild(button)
      })
      dialog.appendChild(close)
      dialog.appendChild(dateLabel)
      dialog.appendChild(heading)
      dialog.appendChild(list)
      backdrop.appendChild(dialog)
      backdrop.addEventListener('click', function (event) {
        if (event.target === backdrop) backdrop.remove()
      })
      document.body.appendChild(backdrop)
    }

    document.addEventListener('click', function (event) {
      var card = event.target && event.target.closest && event.target.closest('.family-calendar-panel .calendar-day-card, .family-calendar-panel .fc-day, .family-calendar-panel .agenda-day-column')
      if (!card || card.classList.contains('muted')) return
      var suppressPopup = Date.now() < (window.__familySuppressCalendarPopupUntil || 0)
      window.__familyDirectCalendarDebug = { step: 'card', text: card.innerText }
      var focused = getFocusedDate()
      var selectedDate = null
      if (card.classList.contains('agenda-day-column')) {
        var title = card.querySelector('strong')
        var numbers = title ? (title.textContent.match(/\d+/g) || []).map(Number) : []
        if (numbers.length >= 2) selectedDate = new Date(focused.getFullYear(), numbers[0] - 1, numbers[1])
      } else {
        var dayEl = card.querySelector('.day-number') || card.querySelector('strong')
        if (!dayEl) return
        var day = Number(dayEl.textContent.trim())
        if (!Number.isFinite(day)) return
        selectedDate = new Date(focused.getFullYear(), focused.getMonth(), day)
      }
      if (!selectedDate) return
      var dateText = formatDate(selectedDate)
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      window.__familyDirectCalendarDebug = { step: 'click', dateText: dateText }
      markCalendarSelection(card, selectedDate)
      setCalendarModeDate(getActiveCalendarMode(), selectedDate)
      updateJumpInput(selectedDate)
      updateScheduleFormVisibleDate(selectedDate)
      updateSelectedDayPanel(selectedDate, card)
      if (suppressPopup) return
      apiGet('/families').then(function (families) {
        window.__familyDirectCalendarDebug = { step: 'families', dateText: dateText, families: families }
        var family = Array.isArray(families) ? families[0] : null
        if (!family || !family.id) return []
        return apiGet('/schedules?familyId=' + encodeURIComponent(family.id) + '&startDate=' + dateText + '&endDate=' + dateText)
      }).then(function (items) {
        var scheduleItems = Array.isArray(items) ? items : []
        if (!scheduleItems.length && !currentToken()) {
          var texts = collectScheduleTextsFromCalendarNode(card)
          scheduleItems = texts.map(function (text, index) {
            return { id: 'dom-' + index, title: text, scheduleDate: dateText, scheduleTime: '', category: '\uC77C\uC815', memberName: '', memo: '' }
          })
        }
        window.__familyDirectCalendarDebug = { step: 'schedules', dateText: dateText, items: scheduleItems }
        if (!scheduleItems.length) {
          resetScheduleCreateFieldsForDate(selectedDate)
          removeSchedulePopups()
          return
        }
        openCalendarApiDayPopup(selectedDate, scheduleItems)
      })
    }, true)
  }

  installDirectCalendarPopupHandler()

  function clickNavButton(direction) {
    var buttons = Array.from(document.querySelectorAll('.family-calendar-panel .calendar-nav > button'))
    var button = direction < 0 ? buttons[0] : buttons[buttons.length - 1]
    if (button) button.click()
  }

  function dispatchRealClick(element) {
    if (!element) return false
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return true
  }

  function clickVisibleDay(target) {
    var day = String(target.getDate())
    var cards = Array.from(document.querySelectorAll('.family-calendar-panel .calendar-day-card'))
    var targetCard = cards.find(function (card) {
      var number = card.querySelector('.day-number')
      return number && number.textContent.trim() === day && !card.classList.contains('muted')
    })
    return dispatchRealClick(targetCard)
  }

  function clickVisibleMonth(target) {
    var month = String(target.getMonth() + 1)
    var cards = Array.from(document.querySelectorAll('.family-calendar-panel .year-month-card'))
    var targetCard = cards.find(function (card) {
      var strong = card.querySelector('strong')
      return strong && (strong.textContent.match(/\d+/g) || [])[0] === month
    })
    return dispatchRealClick(targetCard)
  }

  function getYearSelectedMonthDate() {
    var stored = parseDate(document.documentElement.dataset.yearSelectedMonth || '')
    var currentYear = getCurrentYearNumber()
    if (stored) return new Date(currentYear, stored.getMonth(), 1)
    var active = document.querySelector('.year-month-card.active')
    var strong = active && active.querySelector('strong')
    var month = Number(((strong && strong.textContent.match(/\d+/g)) || [])[0])
    if (Number.isFinite(month)) return new Date(currentYear, month - 1, 1)
    return new Date(currentYear, new Date().getMonth(), 1)
  }

  function setYearSelectedMonth(monthDate) {
    if (!monthDate) return
    var normalized = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    document.documentElement.dataset.yearSelectedMonth = formatDate(normalized)
    document.querySelectorAll('.year-month-card.active').forEach(function (item) {
      item.classList.remove('active')
    })
    var monthText = String(normalized.getMonth() + 1)
    Array.from(document.querySelectorAll('.year-month-card')).forEach(function (card) {
      var strong = card.querySelector('strong')
      var month = ((strong && strong.textContent.match(/\d+/g)) || [])[0]
      if (month === monthText) card.classList.add('active')
    })
  }

  function getYearMonthFromCard(card) {
    if (!card) return null
    var strong = card.querySelector('strong')
    var month = Number(((strong && strong.textContent.match(/\d+/g)) || [])[0])
    if (!Number.isFinite(month)) return null
    return new Date(getCurrentYearNumber(), month - 1, 1)
  }

  function selectYearMonthFromCard(card) {
    var selectedMonth = getYearMonthFromCard(card)
    if (!selectedMonth) return false
    setCalendarModeDate('year', selectedMonth)
    setYearSelectedMonth(selectedMonth)
    updateJumpInput(selectedMonth)
    updateScheduleFormVisibleDate(selectedMonth)
    renderYearSelectedMonthList(selectedMonth, true)
    return true
  }

  function ensureYearMonthClickGuard() {
    if (window.__familyYearMonthClickGuardReady) return
    window.__familyYearMonthClickGuardReady = true
    document.addEventListener('click', function (event) {
      var card = event.target && event.target.closest && event.target.closest('.family-calendar-panel .year-month-card')
      if (!card || getActiveCalendarMode() !== 'year') return
      if (event.target.closest && event.target.closest('.year-mini-days span.has-event')) return
      if (!selectYearMonthFromCard(card)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    }, true)
  }

  function updateJumpInput(date) {
    var input = document.querySelector('.calendar-jump-control input')
    if (input) input.value = formatDate(date)
  }

  function formatDisplayDate(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('.')
  }

  function showPatchToast(message) {
    var old = document.querySelector('.patch-toast-message')
    if (old) old.remove()
    var toast = document.createElement('div')
    toast.className = 'patch-toast-message'
    toast.textContent = message
    document.body.appendChild(toast)
    window.setTimeout(function () {
      toast.classList.add('hide')
      window.setTimeout(function () {
        if (toast.parentElement) toast.remove()
      }, 220)
    }, 1600)
  }

  var apiLoadingState = {
    count: 0,
    showTimer: 0,
    hideTimer: 0,
    watchdogTimer: 0,
    installed: false,
    lastUserActionAt: 0
  }

  function ensureApiLoadingBar() {
    var bar = document.querySelector('.global-api-loading')
    if (bar) return bar
    bar = document.createElement('div')
    bar.className = 'global-api-loading'
    bar.innerHTML = '<div class="global-api-loading-track"><span></span></div><strong>\uB370\uC774\uD130 \uBD88\uB7EC\uC624\uB294 \uC911</strong>'
    document.body.appendChild(bar)
    return bar
  }

  function setApiLoadingVisible(visible) {
    var bar = ensureApiLoadingBar()
    bar.classList.toggle('active', !!visible)
    document.body.classList.toggle('api-loading-blocked', !!visible)
  }

  function beginApiLoading() {
    apiLoadingState.count += 1
    if (apiLoadingState.watchdogTimer) window.clearTimeout(apiLoadingState.watchdogTimer)
    apiLoadingState.watchdogTimer = window.setTimeout(function () {
      apiLoadingState.count = 0
      apiLoadingState.showTimer = 0
      apiLoadingState.hideTimer = 0
      setApiLoadingVisible(false)
    }, 15000)
    if (apiLoadingState.hideTimer) {
      window.clearTimeout(apiLoadingState.hideTimer)
      apiLoadingState.hideTimer = 0
    }
    if (!apiLoadingState.showTimer) {
      apiLoadingState.showTimer = window.setTimeout(function () {
        apiLoadingState.showTimer = 0
        if (apiLoadingState.count > 0) setApiLoadingVisible(true)
      }, 120)
    }
  }

  function endApiLoading() {
    apiLoadingState.count = Math.max(0, apiLoadingState.count - 1)
    if (apiLoadingState.count > 0) return
    if (apiLoadingState.watchdogTimer) {
      window.clearTimeout(apiLoadingState.watchdogTimer)
      apiLoadingState.watchdogTimer = 0
    }
    if (apiLoadingState.showTimer) {
      window.clearTimeout(apiLoadingState.showTimer)
      apiLoadingState.showTimer = 0
    }
    apiLoadingState.hideTimer = window.setTimeout(function () {
      if (apiLoadingState.count === 0) setApiLoadingVisible(false)
    }, 180)
  }

  function getApiRequestLoadingMeta(input, init) {
    if (!document.querySelector('.app-shell')) return { tracked: false, blocking: false }
    var url = typeof input === 'string' ? input : (input && input.url) || ''
    if (!url) return { tracked: false, blocking: false }
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase()
    try {
      var parsed = new URL(url, window.location.origin)
      if (parsed.pathname.indexOf('/api/notifications') === 0) return { tracked: false, blocking: false }
      if (parsed.pathname.indexOf('/api/') !== 0) return { tracked: false, blocking: false }
      if ((method === 'GET' || method === 'HEAD') && Date.now() - apiLoadingState.lastUserActionAt > 1200) return { tracked: false, blocking: false }
      return { tracked: true, blocking: true }
    } catch (error) {
      var tracked = String(url).indexOf('/api/') >= 0
      if ((method === 'GET' || method === 'HEAD') && Date.now() - apiLoadingState.lastUserActionAt > 1200) tracked = false
      return { tracked: tracked, blocking: tracked }
    }
  }

  function configuredApiBaseUrl() {
    return window.FAMILY_PLATFORM_API_BASE_URL || localStorage.getItem('family-platform-api-base-url') || '/api'
  }

  function apiFetchInput(input) {
    var apiBase = configuredApiBaseUrl()
    if (!apiBase || apiBase === '/api' || apiBase.indexOf('http') !== 0) return input

    function resolveApiUrl(url) {
      if (typeof url !== 'string') return url
      if (url.indexOf('/api/') === 0 || url === '/api') {
        return apiBase.replace(/\/$/, '') + url.slice('/api'.length)
      }
      try {
        var parsed = new URL(url, window.location.origin)
        if (parsed.origin === window.location.origin && (parsed.pathname.indexOf('/api/') === 0 || parsed.pathname === '/api')) {
          return apiBase.replace(/\/$/, '') + parsed.pathname.slice('/api'.length) + parsed.search + parsed.hash
        }
      } catch (error) {}
      return url
    }

    if (typeof input === 'string') return resolveApiUrl(input)
    if (input && input.url) {
      var nextUrl = resolveApiUrl(input.url)
      if (nextUrl !== input.url && typeof Request === 'function') return new Request(nextUrl, input)
    }
    return input
  }

  function installApiLoadingInterceptor() {
    if (apiLoadingState.installed || !window.fetch) return
    apiLoadingState.installed = true
    var originalFetch = window.fetch.bind(window)
    window.fetch = function (input, init) {
      var loadingMeta = getApiRequestLoadingMeta(input, init)
      if (loadingMeta.tracked) beginApiLoading()
      return originalFetch(apiFetchInput(input), init).finally(function () {
        if (loadingMeta.tracked) endApiLoading()
      })
    }
    ;['click', 'submit', 'keydown', 'touchstart', 'pointerdown'].forEach(function (type) {
      document.addEventListener(type, function (event) {
        apiLoadingState.lastUserActionAt = Date.now()
        if (!document.body.classList.contains('api-loading-blocked')) return
        if (event.target && event.target.closest && event.target.closest('.global-api-loading')) return
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      }, true)
    })
  }

  installApiLoadingInterceptor()

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

  function normalizeAuthUser(response) {
    response = response || {}
    return {
      id: response.userId || response.id,
      email: response.email || '',
      loginEmail: response.loginEmail || '',
      nickname: response.nickname || '',
      platformAdmin: !!response.platformAdmin,
      provider: response.provider || ''
    }
  }

  function storeAuthResponse(response, persistent) {
    var storedUser = normalizeAuthUser(response)
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
      var storedUser = normalizeAuthUser(response)
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
      var user = normalizeAuthUser(JSON.parse(userText))
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

  function ensurePasswordChangeAction() {
    ensureAccountInfoAction()
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
  function formatKoreanShortDate(date) {
    var weekdays = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0']
    return (date.getMonth() + 1) + '\uC6D4 ' + date.getDate() + '\uC77C (' + weekdays[date.getDay()] + ')'
  }

  function getLunarText(date) {
    try {
      var parts = new Intl.DateTimeFormat('ko-KR-u-ca-chinese', { month: 'numeric', day: 'numeric' }).formatToParts(date)
      var month = Number(((parts.find(function (part) { return part.type === 'month' }) || {}).value || '').replace(/[^\d]/g, ''))
      var day = Number(((parts.find(function (part) { return part.type === 'day' }) || {}).value || '').replace(/[^\d]/g, ''))
      return month && day ? '\uC74C\uB825 ' + month + '\uC6D4 ' + day + '\uC77C' : ''
    } catch (error) {
      return ''
    }
  }

  function getScheduleFormVisibleDate() {
    var trigger = document.querySelector('.schedule-form-card .date-picker-trigger')
    if (trigger && trigger.dataset.solarDate) return parseDate(trigger.dataset.solarDate)
    var triggerText = trigger && trigger.querySelector('span')
    if (!triggerText) return null
    var match = triggerText.textContent.trim().match(/(\d{4})\.(\d{2})\.(\d{2})/)
    if (!match) return null
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  function getScheduleFormDateValue(form) {
    if (form && form.dataset.editingScheduleId && form.dataset.editingScheduleDate) return form.dataset.editingScheduleDate
    var trigger = form && form.querySelector('.date-picker-trigger')
    if (trigger && trigger.dataset.solarDate) return trigger.dataset.solarDate
    var visibleDate = getScheduleFormVisibleDate()
    if (visibleDate) return formatDate(visibleDate)
    var selected = document.documentElement.dataset.calendarSelectedDate
    if (selected && /^\d{4}-\d{2}-\d{2}$/.test(selected)) return selected
    return getDatePickerValue(form, '\uB0A0\uC9DC')
  }

  function updateScheduleFormVisibleDate(date) {
    var trigger = document.querySelector('.schedule-form-card .date-picker-trigger')
    var triggerText = trigger && trigger.querySelector('span')
    if (trigger) trigger.dataset.solarDate = formatDate(date)
    document.documentElement.dataset.calendarSelectedDate = formatDate(date)
    var form = document.querySelector('.schedule-form-card')
    if (form && form.dataset.editingScheduleId) form.dataset.editingScheduleDate = formatDate(date)
    document.querySelectorAll('.schedule-form-card input[type="date"], .schedule-form-card input[name*="date" i]').forEach(function (input) {
      input.value = formatDate(date)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    if (!triggerText) return
    triggerText.textContent = isScheduleBasisLunar() ? getLunarText(date) : formatDisplayDate(date)
  }

  function markCalendarSelection(node, date) {
    if (!node || !date) return
    var mode = getActiveCalendarMode()
    setCalendarModeDate(mode, date)
    document.documentElement.dataset.calendarSelectedDate = formatDate(date)
    document.documentElement.dataset.calendarMode = mode
    document.querySelectorAll('.calendar-day-card.selected, .calendar-day-card.active, .fc-day.selected, .fc-day.active, .agenda-day-column.active, .year-month-card.active').forEach(function (item) {
      if (item !== node) {
        item.classList.remove('selected')
        item.classList.remove('active')
      }
    })
    node.classList.add('selected')
    node.classList.add('active')
  }

  function isScheduleBasisLunar() {
    var triggerText = document.querySelector('.basis-field-patched .custom-select-trigger span')
    return !!triggerText && triggerText.textContent.trim() === '\uC74C\uB825'
  }

  function refreshScheduleDateDisplayForBasis() {
    var date = getScheduleFormVisibleDate()
    if (!date) return
    updateScheduleFormVisibleDate(date)
  }

  function updateSelectedDayPanel(date, agendaSource) {
    ensureSelectedDayCard()
    var card = document.querySelector('.selected-day-card')
    if (!card) return

    var titleButton = card.querySelector('.panel-header button, .panel-header .passive-header-chip')
    if (titleButton) titleButton.textContent = formatKoreanShortDate(date)

    var list = card.querySelector('.schedule-list')
    if (!list) return

    if (agendaSource) {
      var items = collectScheduleTextsFromCalendarNode(agendaSource)

      if (items.length) {
        var note = list.querySelector('.empty-note') || list.firstElementChild
        if (note) {
          note.textContent = items.join('\n')
          note.classList.add('selected-day-mini-row')
          note.dataset.selectedDayDetail = 'true'
          note.dataset.selectedDate = formatKoreanShortDate(date)
        }
        return
      }
    }

    var empty = list.querySelector('.empty-note') || list.firstElementChild
    if (empty) {
      empty.textContent = '\uC120\uD0DD\uD55C \uB0A0\uC9DC\uC5D0\uB294 \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'
      empty.classList.remove('selected-day-mini-row')
      delete empty.dataset.selectedDayDetail
      delete empty.dataset.selectedDate
    }
  }

  function ensureSelectedDayCard() {
    var mode = getActiveCalendarMode()
    if (mode !== 'day' && mode !== 'week') return
    if (document.querySelector('.selected-day-card')) return
    var scheduleCard = document.querySelector('.schedule-list-card')
    var panel = document.querySelector('.family-calendar-panel')
    if (!scheduleCard && !panel) return
    var card = document.createElement('section')
    card.className = 'panel-card selected-day-card'
    card.innerHTML = '<div class="panel-header"><h2>\uC120\uD0DD\uC77C</h2><button type="button" class="passive-header-chip"></button></div><div class="schedule-list"><p class="empty-note">\uC120\uD0DD\uD55C \uB0A0\uC9DC\uC5D0\uB294 \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p></div>'
    if (scheduleCard && scheduleCard.parentElement) scheduleCard.parentElement.insertBefore(card, scheduleCard)
    else if (panel && panel.parentElement) panel.parentElement.insertBefore(card, panel.nextSibling)
  }

  function inferDateForCalendarCard(card, day) {
    if (!card || !Number.isFinite(day)) return null
    var focused = getFocusedDate()
    var month = focused.getMonth()
    var year = focused.getFullYear()
    if (card.classList.contains('muted')) {
      if (day > 20) {
        month -= 1
      } else {
        month += 1
      }
    }
    return new Date(year, month, day)
  }

  function decorateCalendarHolidays() {
    if (!document.querySelector('.family-calendar-panel')) return
    document.querySelectorAll('.calendar-day-card').forEach(function (card) {
      var number = card.querySelector('.day-number')
      var day = Number(number && number.textContent)
      var date = inferDateForCalendarCard(card, day)
      if (!date) return
      var dateKey = formatDate(date)
      var holidayName = getHolidayName(dateKey)
      card.classList.toggle('holiday', !!holidayName || date.getDay() === 0)
      card.classList.toggle('saturday', date.getDay() === 6)
      syncHolidayNameLabel(card, dateKey)
    })
    document.querySelectorAll('.fc-day, .agenda-day-column').forEach(function (card) {
      var title = card.querySelector('strong')
      var nums = title ? (title.textContent.match(/\d+/g) || []).map(Number) : []
      if (!nums.length) return
      var focused = getFocusedDate()
      var date = nums.length >= 2 ? new Date(focused.getFullYear(), nums[0] - 1, nums[1]) : new Date(focused.getFullYear(), focused.getMonth(), nums[0])
      var dateKey = formatDate(date)
      var holidayName = getHolidayName(dateKey)
      card.classList.toggle('holiday', !!holidayName || date.getDay() === 0)
      card.classList.toggle('saturday', date.getDay() === 6)
      syncHolidayNameLabel(card, dateKey)
    })
  }

  function syncSelectedDayHeaderFromState() {
    var card = document.querySelector('.selected-day-card')
    if (!card) return
    var selectedText = document.documentElement.dataset.calendarSelectedDate
    var date = selectedText ? parseDate(selectedText) : (getScheduleFormVisibleDate() || getFocusedDate())
    if (!date) return
    var chip = card.querySelector('.panel-header .passive-header-chip, .panel-header button')
    if (chip) chip.textContent = formatKoreanShortDate(date)
  }

  function cleanupHardcodedCalendarRows() {
    document.querySelectorAll('.schedule-list-card .schedule-list:not(.api-schedule-list)').forEach(function (list) {
      list.remove()
    })
    document.querySelectorAll('.schedule-list-card .schedule-row:not(.api-schedule-row):not(.server-year-schedule-row)').forEach(function (row) {
      row.remove()
    })
  }

  function openSelectedDayDetail(target) {
    var text = target ? target.textContent.trim() : ''
    if (!text) return
    var firstLine = text.split('\n').map(function (line) { return line.trim() }).filter(Boolean)[0] || text
    var titleText = firstLine.replace(/^\d{1,2}:\d{2}\s*/, '') || '\uC77C\uC815 \uC0C1\uC138'
    var linkedRow = findScheduleRowByTitle(titleText)
    var linkedContent = linkedRow && linkedRow.children && linkedRow.children.length > 1 ? linkedRow.children[1] : linkedRow
    var linkedMeta = linkedContent && linkedContent.querySelector('p')
    var linkedMemo = linkedContent && linkedContent.querySelector('small')
    var old = document.querySelector('.schedule-item-patch-backdrop')
    if (old) old.remove()

    var backdrop = document.createElement('div')
    backdrop.className = 'schedule-detail-patch-backdrop schedule-item-patch-backdrop'
    var dialog = document.createElement('section')
    dialog.className = 'schedule-detail-patch-dialog'
    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'schedule-detail-patch-close'
    close.textContent = 'x'
    close.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      backdrop.remove()
    })

    var date = document.createElement('span')
    date.className = 'schedule-detail-patch-date'
    date.textContent = target.dataset.selectedDate || '\uC120\uD0DD\uC77C'

    var heading = document.createElement('h2')
    heading.textContent = titleText

    var meta = document.createElement('p')
    meta.textContent = linkedMeta ? linkedMeta.textContent.trim() : (firstLine.match(/^\d{1,2}:\d{2}/) ? firstLine.match(/^\d{1,2}:\d{2}/)[0] : '')

    var memo = document.createElement('div')
    memo.className = 'schedule-detail-patch-memo'
    memo.textContent = linkedMemo ? linkedMemo.textContent.trim() : '\uB4F1\uB85D\uB41C \uBA54\uBAA8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.'

    var actions = document.createElement('div')
    actions.className = 'schedule-detail-patch-actions'
    var editButton = document.createElement('button')
    editButton.type = 'button'
    editButton.className = 'edit-button'
    editButton.textContent = '\uC218\uC815'
    editButton.addEventListener('click', function () {
      var original = linkedRow && linkedRow.querySelector('.schedule-row-actions .edit-button')
      backdrop.remove()
      if (original) original.click()
    })
    var deleteButton = document.createElement('button')
    deleteButton.type = 'button'
    deleteButton.className = 'danger-button'
    deleteButton.textContent = '\uC0AD\uC81C'
    deleteButton.addEventListener('click', function () {
      var original = linkedRow && linkedRow.querySelector('.schedule-row-actions .danger-button')
      backdrop.remove()
      if (original) original.click()
    })
    actions.appendChild(editButton)
    actions.appendChild(deleteButton)

    dialog.appendChild(close)
    dialog.appendChild(date)
    dialog.appendChild(heading)
    dialog.appendChild(meta)
    dialog.appendChild(memo)
    dialog.appendChild(actions)
    backdrop.appendChild(dialog)
    backdrop.addEventListener('click', function (event) {
      event.stopPropagation()
      if (event.target === backdrop) backdrop.remove()
    })
    document.body.appendChild(backdrop)
  }

  function openScheduleApiDetail(item, options) {
    if (!item) return
    options = options || {}
    var old = document.querySelector('.schedule-item-patch-backdrop')
    if (old) old.remove()
    if (!options.keepParent) {
      document.querySelectorAll('.schedule-detail-patch-backdrop:not(.schedule-day-patch-backdrop)').forEach(function (node) {
        node.remove()
      })
    }

    var backdrop = document.createElement('div')
    backdrop.className = 'schedule-detail-patch-backdrop schedule-item-patch-backdrop'
    var dialog = document.createElement('section')
    dialog.className = 'schedule-detail-patch-dialog'
    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'schedule-detail-patch-close'
    close.textContent = 'x'
    close.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      backdrop.remove()
    })

    var date = document.createElement('span')
    date.className = 'schedule-detail-patch-date'
    date.textContent = formatKoreanShortDate(new Date(String(item.scheduleDate || todayText()) + 'T00:00:00'))

    var heading = document.createElement('h2')
    heading.textContent = item.title || '\uC77C\uC815 \uC0C1\uC138'

    var meta = document.createElement('p')
    meta.textContent = [
      item.scheduleTime ? String(item.scheduleTime).slice(0, 5) : '\uC2DC\uAC04 \uBBF8\uC815',
      item.category || '\uC77C\uC815',
      item.memberName || ''
    ].filter(Boolean).join(' \u00B7 ')

    var memo = document.createElement('div')
    memo.className = 'schedule-detail-patch-memo'
    memo.textContent = item.memo || '\uB4F1\uB85D\uB41C \uBA54\uBAA8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.'

    var actions = document.createElement('div')
    actions.className = 'schedule-detail-patch-actions'
    var editButton = document.createElement('button')
    editButton.type = 'button'
    editButton.className = 'edit-button'
    editButton.dataset.scheduleDetailEdit = 'true'
    editButton.dataset.scheduleId = resolveScheduleItemId(item)
    editButton.textContent = '\uC218\uC815'
    editButton.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      closeScheduleEditPopups()
      startScheduleApiEdit(item)
    })
    var deleteButton = document.createElement('button')
    deleteButton.type = 'button'
    deleteButton.className = 'danger-button'
    deleteButton.dataset.scheduleDetailDelete = 'true'
    deleteButton.dataset.scheduleId = resolveScheduleItemId(item)
    deleteButton.textContent = '\uC0AD\uC81C'
    deleteButton.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      deleteScheduleApiItem(item, function () {
        backdrop.remove()
        if (!options.keepParent) {
          var dayPopup = document.querySelector('.schedule-day-patch-backdrop')
          if (dayPopup) dayPopup.remove()
        }
      })
    })
    actions.appendChild(editButton)
    actions.appendChild(deleteButton)

    dialog.appendChild(close)
    dialog.appendChild(date)
    dialog.appendChild(heading)
    dialog.appendChild(meta)
    dialog.appendChild(memo)
    dialog.appendChild(actions)
    backdrop.appendChild(dialog)
    backdrop.addEventListener('click', function (event) {
      event.stopPropagation()
      if (event.target === backdrop) backdrop.remove()
    })
    document.body.appendChild(backdrop)
  }

  function collectScheduleTextsFromCalendarNode(node) {
    if (!node) return []
    var selectors = [
      '.fc-day-schedules span',
      '.fc-agenda-day button',
      '.agenda-day-column span',
      '.day-schedules span',
      '.calendar-day-schedules span',
      '.calendar-day-card .schedule-chip',
      '.calendar-day-card .event-chip',
      '.calendar-day-card .day-chip-stack em',
      '.calendar-day-card em',
      '.calendar-day-card [class*="schedule"] span',
      '.calendar-day-card [class*="schedule"] em',
      '.calendar-day-card [class*="schedule"] button',
      '.calendar-day-card [class*="event"] span',
      '.calendar-day-card [class*="event"] em',
      '.calendar-day-card [class*="event"] button'
    ]
    var values = []
    selectors.forEach(function (selector) {
      node.querySelectorAll(selector).forEach(function (item) {
        var text = getCleanText(item)
        if (!text || /^\d+$/.test(text) || text.indexOf('\uC74C\uB825') >= 0) return
        if (values.indexOf(text) < 0) values.push(text)
      })
    })
    return values
  }

  function openCalendarDaySchedulePopup(date, scheduleTexts) {
    var items = (scheduleTexts || []).map(function (text) {
      return text.trim()
    }).filter(Boolean)
    var old = document.querySelector('.schedule-day-patch-backdrop')
    if (old) old.remove()
    if (!items.length) return

    if (items.length === 1) {
      var single = document.createElement('button')
      single.dataset.selectedDate = formatKoreanShortDate(date)
      single.textContent = items[0]
      openSelectedDayDetail(single)
      return
    }

    var backdrop = document.createElement('div')
    backdrop.className = 'schedule-day-patch-backdrop schedule-detail-patch-backdrop'
    var dialog = document.createElement('section')
    dialog.className = 'schedule-day-patch-dialog schedule-detail-patch-dialog'

    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'schedule-detail-patch-close'
    close.textContent = 'x'
    close.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      backdrop.remove()
    })

    var dateLabel = document.createElement('span')
    dateLabel.className = 'schedule-detail-patch-date'
    dateLabel.textContent = formatKoreanShortDate(date)

    var heading = document.createElement('h2')
    heading.textContent = '\uC120\uD0DD\uC77C \uC77C\uC815'

    var list = document.createElement('div')
    list.className = 'schedule-day-patch-list'
    items.forEach(function (text) {
      var button = document.createElement('button')
      button.type = 'button'
      button.textContent = text
      button.dataset.selectedDate = formatKoreanShortDate(date)
      button.addEventListener('click', function () {
        openSelectedDayDetail(button)
      })
      list.appendChild(button)
    })

    dialog.appendChild(close)
    dialog.appendChild(dateLabel)
    dialog.appendChild(heading)
    dialog.appendChild(list)
    backdrop.appendChild(dialog)
    backdrop.addEventListener('click', function (event) {
      event.stopPropagation()
      if (event.target === backdrop) backdrop.remove()
    })
    document.body.appendChild(backdrop)
  }

  function hideSelectedDayPanels() {
    var mode = getActiveCalendarMode()
    document.documentElement.dataset.calendarMode = mode
    if (mode === 'day' || mode === 'week') {
      ensureSelectedDayCard()
      return
    }
    document.querySelectorAll('.selected-day-card').forEach(function (card) {
      card.remove()
    })
  }

  function findScheduleRowByTitle(titleText) {
    var normalized = (titleText || '').trim()
    if (!normalized) return null
    return Array.from(document.querySelectorAll('.schedule-row')).find(function (row) {
      var content = row.children && row.children.length > 1 ? row.children[1] : row
      var title = content && content.querySelector('strong')
      return title && title.textContent.trim() === normalized
    }) || null
  }

  function openScheduleDetail(row) {
    if (!row || row.closest('.schedule-row-actions')) return
    var badge = row.querySelector('.schedule-date-badge')
    var title = row.querySelector('div:nth-child(2) strong')
    var meta = row.querySelector('p')
    var memo = row.querySelector('small')
    var old = document.querySelector('.schedule-detail-patch-backdrop')
    if (old) old.remove()

    var backdrop = document.createElement('div')
    backdrop.className = 'schedule-detail-patch-backdrop'
    var content = row.children && row.children.length > 1 ? row.children[1] : row.querySelector('.sortable-content')

    var dialog = document.createElement('section')
    dialog.className = 'schedule-detail-patch-dialog'

    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'schedule-detail-patch-close'
    close.textContent = 'x'
    close.addEventListener('click', function () {
      backdrop.remove()
    })

    var date = document.createElement('span')
    date.className = 'schedule-detail-patch-date'
    if (badge) {
      var day = badge.querySelector('strong') ? badge.querySelector('strong').textContent.trim() : ''
      var weekday = badge.querySelector('span') ? badge.querySelector('span').textContent.trim() : ''
      date.textContent = day && weekday ? day + '\uC77C (' + weekday + ')' : badge.textContent.replace(/\s+/g, ' ').trim()
    } else {
      date.textContent = '\uC77C\uC815'
    }

    var heading = document.createElement('h2')
    title = content ? content.querySelector('strong') : title
    heading.textContent = title ? title.textContent.trim() : '\uC77C\uC815 \uC0C1\uC138'

    var metaText = document.createElement('p')
    meta = content ? content.querySelector('p') : meta
    metaText.textContent = meta ? meta.textContent.trim() : ''

    var memoText = document.createElement('div')
    memoText.className = 'schedule-detail-patch-memo'
    memo = content ? content.querySelector('small') : memo
    memoText.textContent = memo ? memo.textContent.trim() : '\uB4F1\uB85D\uB41C \uBA54\uBAA8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.'

    var actions = document.createElement('div')
    actions.className = 'schedule-detail-patch-actions'
    var editButton = document.createElement('button')
    editButton.type = 'button'
    editButton.className = 'edit-button'
    editButton.textContent = '\uC218\uC815'
    editButton.addEventListener('click', function () {
      var original = row.querySelector('.schedule-row-actions .edit-button')
      backdrop.remove()
      if (original) original.click()
    })
    var deleteButton = document.createElement('button')
    deleteButton.type = 'button'
    deleteButton.className = 'danger-button'
    deleteButton.textContent = '\uC0AD\uC81C'
    deleteButton.addEventListener('click', function () {
      var original = row.querySelector('.schedule-row-actions .danger-button')
      backdrop.remove()
      if (original) original.click()
    })
    actions.appendChild(editButton)
    actions.appendChild(deleteButton)

    dialog.appendChild(close)
    dialog.appendChild(date)
    dialog.appendChild(heading)
    dialog.appendChild(metaText)
    dialog.appendChild(memoText)
    dialog.appendChild(actions)
    backdrop.appendChild(dialog)
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) backdrop.remove()
    })
    document.body.appendChild(backdrop)
  }

  function setScheduleListContext(label, countText) {
    var card = document.querySelector('.schedule-list-card')
    if (!card) return
    var title = card.querySelector('.panel-header h2')
    var count = card.querySelector('.panel-header button, .panel-header .passive-header-chip')
    if (title && label) title.textContent = label
    if (count && countText) count.textContent = countText
  }

  function refreshScheduleListCount() {
    if (!document.querySelector('.family-calendar-panel')) return
    var mode = getActiveCalendarMode()
    document.documentElement.dataset.calendarMode = mode
    var card = document.querySelector('.schedule-list-card')
    if (!card) return
    var title = card.querySelector('.panel-header h2')
    var count = card.querySelector('.panel-header button, .panel-header .passive-header-chip')
    var rows = Array.from(card.querySelectorAll('.schedule-row, .server-schedule-row')).filter(function (row) {
      return !row.closest('[hidden]') && row.offsetParent !== null
    })
    if (mode === 'day') {
      if (title) title.textContent = '\uC77C\uAC04 \uC77C\uC815\uD45C'
      if (count) count.textContent = rows.length + '\uAC74'
    } else if (mode === 'week') {
      if (title) title.textContent = '\uC8FC\uAC04 \uC77C\uC815\uD45C'
      if (count) count.textContent = rows.length + '\uAC74'
    }
  }

  async function moveCalendarTo(target) {
    var mode = getActiveCalendarMode()
    var current = getFocusedDate()
    var steps = 0

    if (mode === 'year') {
      steps = target.getFullYear() - current.getFullYear()
    } else if (mode === 'month') {
      steps = monthDiff(current, target)
    } else if (mode === 'week') {
      steps = Math.round((weekStart(target) - weekStart(current)) / WEEK_MS)
    } else {
      steps = Math.round((target - current) / DAY_MS)
    }

    var direction = steps < 0 ? -1 : 1
    var count = Math.min(Math.abs(steps), 1600)
    if (count > 1) document.documentElement.classList.add('calendar-silent-moving')
    for (var index = 0; index < count; index += 1) {
      clickNavButton(direction)
      await new Promise(function (resolve) { window.setTimeout(resolve, 0) })
    }

    await new Promise(function (resolve) {
      window.setTimeout(function () {
      if (getActiveCalendarMode() === 'year') {
        clickVisibleMonth(target)
        updateScheduleFormVisibleDate(new Date(target.getFullYear(), target.getMonth(), 1))
      } else {
        clickVisibleDay(target)
        updateScheduleFormVisibleDate(target)
      }
      updateJumpInput(target)
      document.documentElement.classList.remove('calendar-silent-moving')
        resolve()
      }, 120)
    })
  }

  function ensureCalendarJumpControl() {
    document.querySelectorAll('.calendar-jump-control').forEach(function (control) {
      control.remove()
    })
  }

  function renderJumpDatepicker(baseDate) {
    var old = document.querySelector('.jump-datepicker-popover')
    if (old) old.remove()
    document.documentElement.classList.add('calendar-jump-open')

    var mode = getActiveCalendarMode()
    var selected = baseDate || getScheduleFormVisibleDate() || getFocusedDate()
    var view = new Date(selected.getFullYear(), selected.getMonth(), 1)
    var level = mode === 'year' ? 'year' : (mode === 'month' ? 'month' : 'day')
    var popover = document.createElement('div')
    popover.className = 'calendar-popover jump-datepicker-popover jump-mode-' + mode

    function draw() {
      var year = view.getFullYear()
      var month = view.getMonth()
      popover.className = 'calendar-popover jump-datepicker-popover jump-mode-' + mode + ' jump-level-' + level
      var title = level === 'year' ? year + '\uB144' : (level === 'month' ? year + '\uB144' : year + '\uB144 ' + (month + 1) + '\uC6D4')
      var html = '<header class="calendar-header"><button type="button" data-jump-prev>&lt;</button><button type="button" class="calendar-title-button"><span>' + title + '</span></button><button type="button" data-jump-next>&gt;</button></header>'

      if (level === 'month') {
        html += '<div class="jump-month-grid">'
        for (var monthIndex = 0; monthIndex < 12; monthIndex += 1) {
          var selectedMonth = selected.getFullYear() === year && selected.getMonth() === monthIndex
          html += '<button type="button" class="' + (selectedMonth ? 'selected' : '') + '" data-jump-month="' + monthIndex + '">' + (monthIndex + 1) + '\uC6D4</button>'
        }
        html += '</div>'
      } else if (level === 'year') {
        var startYear = Math.floor(year / 12) * 12
        html += '<div class="jump-year-grid">'
        for (var yearIndex = 0; yearIndex < 12; yearIndex += 1) {
          var itemYear = startYear + yearIndex
          html += '<button type="button" class="' + (selected.getFullYear() === itemYear ? 'selected' : '') + '" data-jump-year="' + itemYear + '">' + itemYear + '\uB144</button>'
        }
        html += '</div>'
      } else {
        var first = new Date(year, month, 1)
        var lastDate = new Date(year, month + 1, 0).getDate()
        html += '<div class="calendar-weekdays"><span>\uC77C</span><span>\uC6D4</span><span>\uD654</span><span>\uC218</span><span>\uBAA9</span><span>\uAE08</span><span>\uD1A0</span></div><div class="calendar-day-grid">'
        for (var blank = 0; blank < first.getDay(); blank += 1) html += '<span class="calendar-empty"></span>'
        for (var day = 1; day <= lastDate; day += 1) {
          var date = new Date(year, month, day)
          var classes = []
          if (date.getDay() === 0) classes.push('holiday')
          if (date.getDay() === 6) classes.push('saturday')
          if (formatDate(date) === formatDate(selected)) classes.push('selected')
          html += '<button type="button" class="' + classes.join(' ') + '" data-jump-day="' + day + '">' + day + '</button>'
        }
        html += '</div>'
      }
      popover.innerHTML = html
    }

    draw()
    document.body.appendChild(popover)
    positionJumpDatepicker()

    popover.addEventListener('click', function (event) {
      var target = event.target
      if (!target || !target.closest) return
      if (target.closest('[data-jump-prev]')) {
        if (level === 'year') view.setFullYear(view.getFullYear() - 12)
        else if (level === 'month') view.setFullYear(view.getFullYear() - 1)
        else view.setMonth(view.getMonth() - 1)
        draw()
        positionJumpDatepicker()
        return
      }
      if (target.closest('[data-jump-next]')) {
        if (level === 'year') view.setFullYear(view.getFullYear() + 12)
        else if (level === 'month') view.setFullYear(view.getFullYear() + 1)
        else view.setMonth(view.getMonth() + 1)
        draw()
        positionJumpDatepicker()
        return
      }
      if (target.closest('.calendar-header .calendar-title-button')) {
        if (level === 'day') {
          level = 'month'
        } else if (level === 'month') {
          level = 'year'
        }
        draw()
        positionJumpDatepicker()
        return
      }
      if (target.closest('[data-jump-today]')) {
        var today = new Date()
        setCalendarModeDate(mode, today)
        moveCalendarTo(today)
        updateJumpInput(today)
        updateScheduleFormVisibleDate(today)
        popover.remove()
        document.documentElement.classList.remove('calendar-jump-open')
        return
      }
      var monthButton = target.closest('[data-jump-month]')
      if (monthButton) {
        var pickedMonth = new Date(view.getFullYear(), Number(monthButton.dataset.jumpMonth), 1)
        view = pickedMonth
        selected = pickedMonth
        if (mode === 'month') {
          setCalendarModeDate(mode, pickedMonth)
          moveCalendarTo(pickedMonth)
          updateJumpInput(pickedMonth)
          updateScheduleFormVisibleDate(pickedMonth)
          popover.remove()
          document.documentElement.classList.remove('calendar-jump-open')
        } else {
          level = 'day'
          draw()
          positionJumpDatepicker()
        }
        return
      }
      var yearButton = target.closest('[data-jump-year]')
      if (yearButton) {
        var pickedYear = new Date(Number(yearButton.dataset.jumpYear), 0, 1)
        view = new Date(pickedYear.getFullYear(), view.getMonth(), 1)
        selected = view
        if (mode === 'year') {
          setCalendarModeDate(mode, pickedYear)
          moveCalendarTo(pickedYear)
          updateJumpInput(pickedYear)
          updateScheduleFormVisibleDate(pickedYear)
          popover.remove()
          document.documentElement.classList.remove('calendar-jump-open')
        } else {
          level = 'month'
          draw()
          positionJumpDatepicker()
        }
        return
      }
      var dayButton = target.closest('[data-jump-day]')
      if (dayButton) {
        var picked = new Date(view.getFullYear(), view.getMonth(), Number(dayButton.dataset.jumpDay))
        setCalendarModeDate(mode, picked)
        moveCalendarTo(picked)
        updateJumpInput(picked)
        updateScheduleFormVisibleDate(picked)
        popover.remove()
        document.documentElement.classList.remove('calendar-jump-open')
      }
    })
  }

  function positionJumpDatepicker() {
    var popover = document.querySelector('.jump-datepicker-popover')
    var anchor = document.querySelector('.family-calendar-panel .calendar-title-button')
    if (!popover || !anchor) return
    var rect = anchor.getBoundingClientRect()
    var width = Math.min(330, window.innerWidth - 28)
    var left = Math.max(14, Math.min(window.innerWidth - width - 14, rect.left + rect.width / 2 - width / 2))
    popover.style.position = 'fixed'
    popover.style.width = width + 'px'
    popover.style.left = left + 'px'
    popover.style.top = Math.min(window.innerHeight - 20, rect.bottom + 8) + 'px'
    popover.style.transform = 'none'
  }

  function normalizeSelectedDateAfterViewChange() {
    window.setTimeout(function () {
      var mode = getActiveCalendarMode()
      var today = new Date()
      var selected = getCalendarModeDate(mode) || today
      window.__familySuppressCalendarPopupUntil = Date.now() + 2500
      if (mode === 'year') {
        var monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1)
        setCalendarModeDate(mode, monthStart)
        selected = monthStart
      }
      moveCalendarTo(selected).then(function () {
        if (getActiveCalendarMode() !== mode) return
        if (mode === 'year') {
          clickVisibleMonth(selected)
          updateScheduleFormVisibleDate(selected)
        } else {
          clickVisibleDay(selected)
          updateScheduleFormVisibleDate(selected)
          updateSelectedDayPanel(selected)
        }
        updateJumpInput(selected)
        calendarScheduleCache.key = ''
        renderCalendarApiSchedules(true)
      })
    }, 140)
  }

  function normalizeTodayForDayAndWeek() {
    window.setTimeout(function () {
      var mode = getActiveCalendarMode()
      if (mode !== 'day' && mode !== 'week') return
      var today = getCalendarModeDate(mode) || new Date()
      window.__familySuppressCalendarPopupUntil = Date.now() + 2500
      setCalendarModeDate(mode, today)
      moveCalendarTo(today)
      updateJumpInput(today)
      updateScheduleFormVisibleDate(today)
      updateSelectedDayPanel(today)
      calendarScheduleCache.key = ''
      renderCalendarApiSchedules(true)
    }, 360)
  }

  function wireCalendarInteractions() {
    document.querySelectorAll('.family-calendar-panel .calendar-nav .calendar-title-button').forEach(function (button) {
      if (button.dataset.jumpPickerWired) return
      button.dataset.jumpPickerWired = 'true'
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation) event.stopImmediatePropagation()
        var modeDate = getCalendarModeDate(getActiveCalendarMode())
        renderJumpDatepicker(modeDate || getFocusedDate())
      }, true)
    })

    document.querySelectorAll('.family-calendar-panel .calendar-nav > button:not(.calendar-title-button)').forEach(function (button) {
      if (button.dataset.patchNavWired) return
      button.dataset.patchNavWired = 'true'
      button.addEventListener('click', function () {
        window.setTimeout(function () {
          var mode = getActiveCalendarMode()
          if (mode !== 'day' && mode !== 'week') return
          var focused = getFocusedDate()
          setCalendarModeDate(mode, focused)
          document.documentElement.dataset.calendarSelectedDate = formatDate(focused)
          updateJumpInput(focused)
          updateScheduleFormVisibleDate(focused)
          calendarScheduleCache.key = ''
          renderCalendarApiSchedules(true)
        }, 180)
      })
    })

    document.querySelectorAll('.family-calendar-panel .calendar-view-tabs button').forEach(function (button) {
      if (button.dataset.patchWired) return
      button.dataset.patchWired = 'true'
      button.addEventListener('click', function () {
        normalizeSelectedDateAfterViewChange()
      })
    })

    document.querySelectorAll('.family-calendar-panel .calendar-day-card').forEach(function (card) {
      if (card.dataset.patchWired) return
      card.dataset.patchWired = 'true'
      card.addEventListener('click', function () {
        var titleDate = getFocusedDate()
        var day = Number((card.querySelector('.day-number') || {}).textContent || titleDate.getDate())
        if (Number.isFinite(day)) {
          var selectedDate = new Date(titleDate.getFullYear(), titleDate.getMonth(), day)
          markCalendarSelection(card, selectedDate)
          updateJumpInput(selectedDate)
          updateScheduleFormVisibleDate(selectedDate)
          updateSelectedDayPanel(selectedDate)
          loadCalendarScheduleCache(false).then(function () {
            if (!openCalendarApiDayPopup(selectedDate)) {
              if (!getStoredAuthToken()) openCalendarDaySchedulePopup(selectedDate, collectScheduleTextsFromCalendarNode(card))
            }
          })
        }
      })
    })

    document.querySelectorAll('.family-calendar-panel .fc-day').forEach(function (card) {
      if (card.dataset.patchWired) return
      card.dataset.patchWired = 'true'
      card.addEventListener('click', function () {
        var titleDate = getFocusedDate()
        var day = Number((card.querySelector('strong') || {}).textContent || titleDate.getDate())
        if (Number.isFinite(day)) {
          var selectedDate = new Date(titleDate.getFullYear(), titleDate.getMonth(), day)
          markCalendarSelection(card, selectedDate)
          updateJumpInput(selectedDate)
          updateScheduleFormVisibleDate(selectedDate)
          updateSelectedDayPanel(selectedDate)
          loadCalendarScheduleCache(false).then(function () {
            if (!openCalendarApiDayPopup(selectedDate)) {
              if (!getStoredAuthToken()) openCalendarDaySchedulePopup(selectedDate, collectScheduleTextsFromCalendarNode(card))
            }
          })
        }
      })
    })

    document.querySelectorAll('.family-calendar-panel .agenda-day-column').forEach(function (column) {
      if (column.dataset.patchWired) return
      column.dataset.patchWired = 'true'
      column.addEventListener('click', function () {
        var titleDate = getFocusedDate()
        var title = column.querySelector('strong')
        var numbers = title ? (title.textContent.match(/\d+/g) || []).map(Number) : []
        if (numbers.length >= 2) {
          var selectedDate = new Date(titleDate.getFullYear(), numbers[0] - 1, numbers[1])
          markCalendarSelection(column, selectedDate)
          updateJumpInput(selectedDate)
          updateScheduleFormVisibleDate(selectedDate)
          updateSelectedDayPanel(selectedDate, column)
          loadCalendarScheduleCache(false).then(function () {
            if (!openCalendarApiDayPopup(selectedDate)) {
              if (!getStoredAuthToken()) openCalendarDaySchedulePopup(selectedDate, collectScheduleTextsFromCalendarNode(column))
            }
          })
          document.querySelectorAll('.agenda-day-column.active').forEach(function (item) {
            item.classList.remove('active')
          })
          column.classList.add('active')
        }
      })
    })

    document.querySelectorAll('.family-calendar-panel .year-month-card').forEach(function (card) {
      if (card.dataset.patchWired) return
      card.dataset.patchWired = 'true'
      card.addEventListener('click', function () {
        selectYearMonthFromCard(card)
      })
    })
  }

  function setYearMode(mode) {
    document.documentElement.dataset.yearScheduleMode = mode
    document.querySelectorAll('.year-mode-tabs button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.yearMode === mode)
    })
    decorateYearCalendar()
    renderYearSelectedMonthList(getYearSelectedMonthDate(), true)
  }

  function buildMiniMonth(year, month, eventDays) {
    var first = new Date(year, month - 1, 1)
    var lastDate = new Date(year, month, 0).getDate()
    var html = '<div class="year-mini-weekdays"><span>\uC77C</span><span>\uC6D4</span><span>\uD654</span><span>\uC218</span><span>\uBAA9</span><span>\uAE08</span><span>\uD1A0</span></div><div class="year-mini-days">'
    for (var blank = 0; blank < first.getDay(); blank += 1) html += '<span></span>'
    for (var day = 1; day <= lastDate; day += 1) {
      var hasEvent = eventDays.indexOf(day) >= 0
      html += '<span data-year-mini-day="' + day + '" class="' + (hasEvent ? 'has-event' : '') + '">' + day + '</span>'
    }
    html += '</div>'
    return html
  }

  function getCurrentYearNumber() {
    var nums = getTitleNumbers()
    var year = nums.find(function (num) { return num > 1900 })
    return year || new Date().getFullYear()
  }

  function collectMonthEventDays(month) {
    var year = getCurrentYearNumber()
    var cache = window.__familyYearScheduleCache
    if (cache && cache.year === year && cache.months && cache.months[month]) {
      return cache.months[month].days.slice()
    }
    return Array.from(document.querySelectorAll('.schedule-row, .server-schedule-row')).map(function (row) {
      var text = getCleanText(row)
      var dateMatch = text.match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/)
      if (dateMatch) {
        var rowMonth = Number(dateMatch[2])
        return rowMonth === month ? Number(dateMatch[3]) : NaN
      }
      var monthMatch = text.match(/(\d{1,2})\uC6D4\s*(\d{1,2})/)
      if (monthMatch) {
        return Number(monthMatch[1]) === month ? Number(monthMatch[2]) : NaN
      }
      return NaN
    }).filter(function (day, index, values) {
      return Number.isFinite(day) && values.indexOf(day) === index
    })
  }

  function fetchSchedulesDirect(startDate, endDate) {
    var token = getStoredAuthToken()
    if (!token) return Promise.resolve([])
    var headers = { Authorization: 'Bearer ' + token }
    return fetch('/api/families', { headers: headers }).then(function (response) {
      if (!response.ok) return []
      return response.json()
    }).then(function (families) {
      var family = Array.isArray(families) ? families[0] : null
      if (!family || !family.id) return []
      localStorage.setItem(AUTH_FAMILY_STORAGE_KEY, String(family.id))
      return fetch('/api/schedules?familyId=' + encodeURIComponent(family.id) + '&startDate=' + encodeURIComponent(startDate) + '&endDate=' + encodeURIComponent(endDate), { headers: headers })
    }).then(function (response) {
      if (!response || !response.ok) return []
      return response.json()
    }).then(function (items) {
      return Array.isArray(items) ? items.map(normalizeScheduleItem) : []
    }).catch(function () {
      return []
    })
  }

  function ensureYearScheduleCache(year) {
    var cache = window.__familyYearScheduleCache
    var cacheToken = (getStoredAuthToken() || '').slice(-24)
    var cacheFamily = localStorage.getItem(AUTH_FAMILY_STORAGE_KEY) || ''
    if (cache && cache.year === year && cache.token === cacheToken && cache.family === cacheFamily && (cache.loaded || cache.loading)) return
    window.__familyYearScheduleCache = { year: year, token: cacheToken, family: cacheFamily, loading: true, loaded: false, months: {} }
    fetchSchedulesDirect(year + '-01-01', year + '-12-31').then(function (items) {
      var months = {}
      ;(items || []).forEach(function (item) {
        var parts = String(item.scheduleDate || '').split('-').map(Number)
        if (parts.length < 3 || !Number.isFinite(parts[1]) || !Number.isFinite(parts[2])) return
        if (!months[parts[1]]) months[parts[1]] = { days: [], items: [] }
        months[parts[1]].items.push(item)
        if (months[parts[1]].days.indexOf(parts[2]) < 0) months[parts[1]].days.push(parts[2])
      })
      window.__familyYearScheduleCache = { year: year, token: cacheToken, family: localStorage.getItem(AUTH_FAMILY_STORAGE_KEY) || cacheFamily, loading: false, loaded: true, months: months }
      window.setTimeout(function () {
        decorateYearCalendar()
        renderYearSelectedMonthList(getYearSelectedMonthDate(), false)
      }, 0)
    }).catch(function () {
      window.__familyYearScheduleCache = { year: year, token: cacheToken, family: cacheFamily, loading: false, loaded: true, months: {} }
    })
  }

  function cachedYearMonthItems(monthDate) {
    var cache = window.__familyYearScheduleCache
    if (!cache || !cache.loaded || cache.year !== monthDate.getFullYear() || !cache.months) return null
    var month = monthDate.getMonth() + 1
    return ((cache.months[month] && cache.months[month].items) || []).map(normalizeScheduleItem)
  }

  function paintYearSelectedMonthList(monthDate, items) {
    var card = document.querySelector('.schedule-list-card')
    if (!card) return
    var month = monthDate.getMonth() + 1
    var list = card.querySelector('.api-schedule-list')
    if (!list) {
      list = document.createElement('div')
      list.className = 'api-schedule-list'
      card.appendChild(list)
    }
    var schedules = (items || []).map(normalizeScheduleItem).sort(function (a, b) {
      return String(a.scheduleDate || '').localeCompare(String(b.scheduleDate || '')) || String(a.scheduleTime || '').localeCompare(String(b.scheduleTime || ''))
    })
    window.__familyYearScheduleItemsById = window.__familyYearScheduleItemsById || {}
    schedules.forEach(function (item) {
      window.__familyYearScheduleItemsById[String(item.id)] = item
    })
    setScheduleListContext(month + '\uC6D4 \uC77C\uC815\uD45C', schedules.length + '\uAC74')
    if (!schedules.length) {
      list.innerHTML = '<p class="empty-note">\uD574\uB2F9 \uC6D4\uC5D0 \uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
      return
    }
    list.innerHTML = schedules.map(function (item) {
      var date = new Date(String(item.scheduleDate || todayText()) + 'T00:00:00')
      return '<div class="schedule-row server-year-schedule-row" role="button" tabindex="0" data-api-schedule-id="' + escapeHtml(item.id) + '">' +
        '<span class="schedule-date-badge"><strong>' + date.getDate() + '</strong><span>' + escapeHtml(formatKoreanShortDate(date).replace(/^.*\((.)\).*$/, '$1')) + '</span></span>' +
        '<div><strong>' + escapeHtml(item.title || '\uC77C\uC815') + '</strong><p>' + escapeHtml(scheduleTimeText(item) + ' \u00B7 ' + (item.category || '\uC77C\uC815') + (item.memberName ? ' \u00B7 ' + item.memberName : '')) + '</p><small>' + escapeHtml(item.memo || '') + '</small></div>' +
        '</div>'
    }).join('')
    list.querySelectorAll('.server-year-schedule-row').forEach(function (row, index) {
      row.addEventListener('click', function () {
        openScheduleApiDetail(schedules[index])
      })
      row.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        openScheduleApiDetail(schedules[index])
      })
    })
  }

  function findScheduleItemById(id) {
    if (!id) return null
    var maps = [
      window.__familyYearScheduleItemsById || {},
      window.__familyScheduleItemsById || {}
    ]
    for (var index = 0; index < maps.length; index += 1) {
      if (maps[index][String(id)]) return maps[index][String(id)]
    }
    return null
  }

  function ensureScheduleActionDelegates() {
    if (window.__familyScheduleActionDelegatesReady) return
    window.__familyScheduleActionDelegatesReady = true
    var lastScheduleAction = { key: '', at: 0 }
    var handleScheduleAction = function (event) {
      if (!event.target || !event.target.closest) return
      var editButton = event.target.closest('[data-schedule-detail-edit], .api-schedule-row .schedule-row-actions .edit-button, .server-year-schedule-row .schedule-row-actions .edit-button')
      var deleteButton = event.target.closest('[data-schedule-detail-delete], .api-schedule-row .schedule-row-actions .danger-button, .server-year-schedule-row .schedule-row-actions .danger-button')
      var actionButton = editButton || deleteButton
      var row = actionButton ? actionButton.closest('.api-schedule-row, .server-year-schedule-row') : event.target.closest('.api-schedule-row, .server-year-schedule-row')
      if (!row) return
      if (!actionButton && event.target.closest('.schedule-row-actions button')) return
      var id = (actionButton && (actionButton.dataset.scheduleId ||
        actionButton.dataset.scheduleDetailEdit ||
        actionButton.dataset.scheduleDetailDelete)) ||
        (row && row.getAttribute('data-api-schedule-id'))
      var item = findScheduleItemById(id)
      if (!item) return
      var key = String(id || '') + ':' + (editButton ? 'edit' : (deleteButton ? 'delete' : 'open'))
      var now = Date.now()
      if (event.type === 'click' && lastScheduleAction.key === key && now - lastScheduleAction.at < 450) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation) event.stopImmediatePropagation()
        return
      }
      lastScheduleAction = { key: key, at: now }
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      if (editButton) {
        closeScheduleEditPopups()
        startScheduleApiEdit(item)
      } else if (deleteButton) {
        deleteScheduleApiItem(item, function () {
          document.querySelectorAll('.schedule-detail-patch-backdrop').forEach(function (node) { node.remove() })
        })
      } else {
        openScheduleApiDetail(item)
      }
    }
    document.addEventListener('pointerup', handleScheduleAction, true)
    document.addEventListener('click', handleScheduleAction, true)
  }

  function renderYearSelectedMonthList(monthDate, force) {
    if (!monthDate || getActiveCalendarMode() !== 'year') return
    var card = document.querySelector('.schedule-list-card')
    if (!card) return
    setYearSelectedMonth(monthDate)
    var month = monthDate.getMonth() + 1
    var range = monthRangeFor(formatDate(monthDate))
    var selectedKey = formatDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1))
    var list = card.querySelector('.api-schedule-list')
    if (!list) {
      list = document.createElement('div')
      list.className = 'api-schedule-list'
      card.appendChild(list)
    }
    var state = window.__familyYearMonthListState || {}
    if (!force && state.key === selectedKey && (state.loading || state.ready)) return
    var cached = cachedYearMonthItems(monthDate)
    if (cached) {
      window.__familyYearMonthListState = { key: selectedKey, loading: false, ready: true }
      paintYearSelectedMonthList(monthDate, cached)
      return
    }
    window.__familyYearMonthListState = { key: selectedKey, loading: true, ready: false }
    setScheduleListContext(month + '\uC6D4 \uC77C\uC815\uD45C', '0\uAC74')
    list.innerHTML = '<p class="empty-note">\uC77C\uC815\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchSchedulesDirect(range.start, range.end).then(function (items) {
      if (document.documentElement.dataset.yearSelectedMonth !== selectedKey) return
      window.__familyYearMonthListState = { key: selectedKey, loading: false, ready: true }
      paintYearSelectedMonthList(monthDate, items)
    }).catch(function () {
      if (document.documentElement.dataset.yearSelectedMonth !== selectedKey) return
      window.__familyYearMonthListState = { key: selectedKey, loading: false, ready: false }
      setScheduleListContext(month + '\uC6D4 \uC77C\uC815\uD45C', '0\uAC74')
      list.innerHTML = '<p class="empty-note">\uC77C\uC815\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.</p>'
    })
  }

  function decorateYearCalendar() {
    if (getActiveCalendarMode() !== 'year') return
    var mode = document.documentElement.dataset.yearScheduleMode || 'calendar'
    var year = getCurrentYearNumber()
    ensureYearScheduleCache(year)
    document.querySelectorAll('.year-month-card').forEach(function (card) {
      var strong = card.querySelector('strong')
      var month = Number(((strong && strong.textContent.match(/\d+/g)) || [])[0])
      if (!Number.isFinite(month)) return
      var mini = card.querySelector('.year-mini-calendar')
      if (mode === 'calendar') {
        var monthDays = collectMonthEventDays(month)
        var key = year + '-' + month + '-' + monthDays.join(',')
        if (!mini) {
          mini = document.createElement('div')
          mini.className = 'year-mini-calendar'
          card.appendChild(mini)
        }
        if (mini.dataset.key !== key) {
          mini.dataset.key = key
          mini.innerHTML = buildMiniMonth(year, month, monthDays)
        }
        var countBadge = card.querySelector('.year-event-count')
        if (!countBadge) {
          countBadge = document.createElement('button')
          countBadge.type = 'button'
          countBadge.className = 'year-event-count'
          card.appendChild(countBadge)
        }
        countBadge.textContent = monthDays.length ? monthDays.length + '\uAC74' : '\uC77C\uC815 \uC5C6\uC74C'
        countBadge.disabled = !monthDays.length
        mini.querySelectorAll('.year-mini-days span').forEach(function (dayNode) {
          if (dayNode.dataset.yearDetailWired) return
          dayNode.dataset.yearDetailWired = 'true'
          dayNode.addEventListener('click', function (event) {
            event.preventDefault()
            event.stopPropagation()
            var day = Number(dayNode.dataset.yearMiniDay || dayNode.textContent)
            if (!Number.isFinite(day)) return
            var selectedDate = new Date(year, month - 1, day)
            setCalendarModeDate('year', selectedDate)
            updateScheduleFormVisibleDate(selectedDate)
            fetchSchedulesDirect(formatDate(selectedDate), formatDate(selectedDate)).then(function (items) {
              if (!items || !items.length) resetScheduleCreateFieldsForDate(selectedDate)
              openCalendarApiDayPopup(selectedDate, items)
            })
          })
        })
      } else if (mini) {
        mini.remove()
        var staleCount = card.querySelector('.year-event-count')
        if (staleCount) staleCount.remove()
      }
    })
  }

  function ensureYearModeTabs() {
    var grid = document.querySelector('.family-calendar-panel .year-schedule-grid')
    if (getActiveCalendarMode() !== 'year' || !grid) {
      var stale = document.querySelector('.family-calendar-panel .year-mode-tabs')
      if (stale) stale.remove()
      return
    }
    var existing = document.querySelector('.family-calendar-panel .year-mode-tabs')
    if (existing) {
      setYearMode(document.documentElement.dataset.yearScheduleMode || 'calendar')
      return
    }

    var tabs = document.createElement('div')
    tabs.className = 'year-mode-tabs'

    var calendarButton = document.createElement('button')
    calendarButton.type = 'button'
    calendarButton.dataset.yearMode = 'calendar'
    calendarButton.textContent = '\uCE98\uB9B0\uB354\uD615'

    var listButton = document.createElement('button')
    listButton.type = 'button'
    listButton.dataset.yearMode = 'list'
    listButton.textContent = '\uBAA9\uB85D\uD615'

    calendarButton.addEventListener('click', function () {
      setYearMode('calendar')
    })

    listButton.addEventListener('click', function () {
      setYearMode('list')
    })

    tabs.appendChild(calendarButton)
    tabs.appendChild(listButton)
    grid.parentElement.insertBefore(tabs, grid)
    setYearMode(document.documentElement.dataset.yearScheduleMode || 'calendar')
  }

  function wireScheduleDetailRows() {
    if (!window.__familyYearScheduleDelegatedReady) {
      window.__familyYearScheduleDelegatedReady = true
      document.addEventListener('click', function (event) {
        var row = event.target && event.target.closest && event.target.closest('.server-year-schedule-row')
        if (!row) return
        event.preventDefault()
        event.stopPropagation()
        var id = row.getAttribute('data-api-schedule-id')
        var item = window.__familyYearScheduleItemsById && window.__familyYearScheduleItemsById[String(id)]
        if (item) {
          openScheduleApiDetail(item)
          return
        }
        openScheduleDetail(row)
      }, true)
    }

    document.querySelectorAll('.schedule-row').forEach(function (row) {
      if (row.dataset.detailWired) return
      row.dataset.detailWired = 'true'
      row.addEventListener('click', function (event) {
        if (event.target && event.target.closest && event.target.closest('button')) return
        openScheduleDetail(row)
      })
    })

    document.querySelectorAll('[data-selected-day-detail="true"]').forEach(function (item) {
      if (item.dataset.detailWired) return
      item.dataset.detailWired = 'true'
      item.addEventListener('click', function () {
        openSelectedDayDetail(item)
      })
    })
  }

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

  function isFamilyGroupNavItem(nav) {
    return nav && getCleanText(nav).indexOf('\uAC00\uC871\uADF8\uB8F9') >= 0
  }

  function isRestaurantNavItem(nav) {
    return nav && getCleanText(nav) === '\uB9DB\uC9D1'
  }

  function isLedgerNavItem(nav) {
    return nav && getCleanText(nav) === '\uAC00\uACC4\uBD80'
  }

  function setNavActive(label) {
    document.querySelectorAll('.nav-item.active').forEach(function (item) {
      item.classList.remove('active')
    })
    var nav = findNavButton(label) || findNavButtonContains(label)
    if (nav) nav.classList.add('active')
  }

  function syncRestaurantMenuState() {
    if (!document.querySelector('.restaurant-grid, .restaurant-form')) return
    delete document.documentElement.dataset.patchPage
    var title = document.querySelector('.topbar h1')
    if (title && getCleanText(title) !== '\uB9DB\uC9D1') title.textContent = '\uB9DB\uC9D1'
    var caption = document.querySelector('.topbar h1') && document.querySelector('.topbar h1').previousElementSibling
    if (caption && caption.tagName === 'SPAN') caption.textContent = '\uB9DB\uC9D1'
    setNavActive('\uB9DB\uC9D1')
    var restaurantForm = document.querySelector('.restaurant-form')
    var formPanel = restaurantForm && restaurantForm.closest('.panel')
    if (formPanel) {
      Array.from(formPanel.querySelectorAll('.panel-header button, .panel-header .passive-header-chip, .panel-header [role="button"]')).forEach(function (item) {
        if (getCleanText(item) === '\uACF5\uC720') item.remove()
      })
    }
    normalizeRestaurantFormControls()
  }

  function normalizeMenuCaptions() {
    var title = document.querySelector('.topbar h1')
    var caption = title && title.previousElementSibling && title.previousElementSibling.tagName === 'SPAN'
      ? title.previousElementSibling
      : null
    if (!caption) return
    var pageTitle = getCleanText(title)
    if (pageTitle === '\uC77C\uAE30') caption.textContent = '\uC77C\uAE30'
    if (pageTitle === '\uB9DB\uC9D1') caption.textContent = '\uB9DB\uC9D1'
    document.querySelectorAll('.panel h2').forEach(function (heading) {
      var text = getCleanText(heading)
      if (text === '\uAC00\uC871 \uC77C\uAE30') heading.textContent = '\uC77C\uAE30'
      if (text === '\uAC00\uC871 \uB9DB\uC9D1') heading.textContent = '\uB9DB\uC9D1'
    })
  }

  function cleanupPatchRootsForCurrentMenu() {
    var title = getCleanText(document.querySelector('.topbar h1, h1'))
    if (title !== '\uAC00\uC871\uADF8\uB8F9') {
      document.querySelectorAll('.patch-family-group-root').forEach(function (root) {
        root.remove()
      })
    }
    if (title !== '\uCEE4\uBBA4\uB2C8\uD2F0') {
      document.querySelectorAll('.patch-community-root').forEach(function (root) {
        root.remove()
      })
    }
    if (title !== '\uAC00\uC871\uADF8\uB8F9' && title !== '\uCEE4\uBBA4\uB2C8\uD2F0') {
      delete document.documentElement.dataset.patchPage
      var content = document.querySelector('.content-grid')
      if (content) {
        content.classList.remove('community-grid')
        content.classList.remove('community-source-hidden')
        delete content.dataset.communityReady
      }
    }
  }

  function clearFamilyGroupPage() {
    if (document.documentElement.dataset.patchPage !== 'family-group') return
    delete document.documentElement.dataset.patchPage
    var content = document.querySelector('.content-grid')
    if (content) content.classList.remove('community-source-hidden')
    var root = document.querySelector('.patch-family-group-root')
    if (root) root.remove()
    document.querySelectorAll('.nav-item.active').forEach(function (item) {
      if (isFamilyGroupNavItem(item)) item.classList.remove('active')
    })
  }

  function clearCommunityPatchPage() {
    if (document.documentElement.dataset.patchPage !== 'community') return
    delete document.documentElement.dataset.patchPage
    var content = document.querySelector('.content-grid')
    if (content) {
      content.classList.remove('community-grid')
      content.classList.remove('community-source-hidden')
      delete content.dataset.communityReady
    }
    var root = document.querySelector('.patch-community-root')
    if (root) root.remove()
    document.querySelectorAll('.community-nav-item.active').forEach(function (item) {
      item.classList.remove('active')
    })
    resumePatchObserver()
  }

  function clearCustomPatchPageAfterReact(wasCommunity, wasFamilyGroup) {
    window.setTimeout(function () {
      if (wasCommunity) clearCommunityPatchPage()
      if (wasFamilyGroup) clearFamilyGroupPage()
    }, 260)
  }

  function clearCustomPatchPageNow() {
    clearCommunityPatchPage()
    clearFamilyGroupPage()
    document.querySelectorAll('.patch-community-root, .patch-family-group-root').forEach(function (root) {
      root.remove()
    })
    var content = document.querySelector('.content-grid')
    if (content) {
      content.classList.remove('community-grid')
      content.classList.remove('community-source-hidden')
      delete content.dataset.communityReady
    }
  }

  function openFamilyGroupPage() {
    pausePatchObserver()
    if (document.documentElement.dataset.patchPage === 'community') {
      delete document.documentElement.dataset.patchPage
      var communityRoot = document.querySelector('.patch-community-root')
      if (communityRoot) communityRoot.remove()
    }
    document.documentElement.dataset.patchPage = 'family-group'
    document.querySelectorAll('.nav-item.active').forEach(function (item) {
      item.classList.remove('active')
    })
    var nav = Array.from(document.querySelectorAll('.nav-item')).find(isFamilyGroupNavItem)
    if (nav) nav.classList.add('active')

    var eyebrow = document.querySelector('.topbar .eyebrow')
    var title = document.querySelector('.topbar h1')
    if (eyebrow) eyebrow.textContent = '\uAC00\uC871\uADF8\uB8F9 \u00B7 \uCD08\uB300 \u00B7 \uAD8C\uD55C'
    if (title) title.textContent = '\uAC00\uC871\uADF8\uB8F9'

    var workspace = document.querySelector('.workspace')
    var content = document.querySelector('.content-grid')
    if (!workspace) return
    if (content) content.classList.add('community-source-hidden')

    var root = document.querySelector('.patch-family-group-root')
    if (!root) {
      root = document.createElement('div')
      root.className = 'patch-family-group-root community-grid'
      workspace.appendChild(root)
    }
    root.innerHTML = '<section class="panel wide family-group-panel"><div class="api-empty-row"><strong>가족 정보를 불러오는 중입니다.</strong></div></section>'
    schedulePlaceholderSweep()
    loadFamilyGroupPage(root)
    resumePatchObserver()
  }

  function queueOpenFamilyGroupPage() {
    window.clearTimeout(window.__familyGroupOpenTimer)
    window.__familyGroupOpenTimer = window.setTimeout(function () {
      openFamilyGroupPage()
      window.setTimeout(openFamilyGroupPage, 140)
    }, 30)
  }

  function loadFamilyGroupPage(root) {
    Promise.all([
      apiRequest('/families'),
      apiRequest('/family-invitations').catch(function () { return [] })
    ]).then(function (results) {
      var list = Array.isArray(results[0]) ? results[0] : []
      var invitations = Array.isArray(results[1]) ? results[1] : []
      if (!list.length) {
        renderFamilyCreatePage(root, invitations)
        return
      }
      var family = list[0]
      localStorage.setItem(AUTH_FAMILY_STORAGE_KEY, String(family.id))
      return Promise.all([
        apiRequest('/families/' + encodeURIComponent(family.id) + '/members').catch(function () { return [] }),
        apiRequest('/families/' + encodeURIComponent(family.id) + '/invitations').catch(function () { return [] })
      ]).then(function (familyResults) {
        var members = Array.isArray(familyResults[0]) ? familyResults[0] : []
        var sentInvitations = Array.isArray(familyResults[1]) ? familyResults[1] : []
        renderFamilyManagePage(root, family, members, invitations, sentInvitations)
      }).catch(function () {
        renderFamilyManagePage(root, family, [], invitations, [])
      })
    }).catch(function (error) {
      var message = error && error.status === 401 ? '로그인 세션이 필요합니다.' : '가족 정보를 불러오지 못했습니다.'
      root.innerHTML = [
        '<section class="panel wide family-group-panel">',
        '<div class="api-empty-row"><strong>' + message + '</strong><small>로그인 상태를 확인한 뒤 다시 시도해주세요.</small></div>',
        '<button class="submit-action" type="button" data-family-retry>다시 불러오기</button>',
        '</section>'
      ].join('')
      var retry = root.querySelector('[data-family-retry]')
      if (retry) retry.addEventListener('click', function () { loadFamilyGroupPage(root) })
    })
  }

  function permissionText(member) {
    var permissions = []
    if (member.canRead) permissions.push('읽기')
    if (member.canCreate) permissions.push('쓰기')
    if (member.canUpdate) permissions.push('수정')
    if (member.canDelete) permissions.push('삭제')
    return permissions.length ? permissions.join('/') : '권한 없음'
  }

  function roleText(role) {
    return role === 'FAMILY_ADMIN' ? '가족관리자' : '가족구성원'
  }

  function currentFamilyMember(members) {
    var currentUser = readStoredAuthUser() || {}
    return (members || []).find(function (member) {
      return String(member.userId) === String(currentUser.id || '')
    }) || null
  }

  function canManageFamily(members) {
    var currentUser = readStoredAuthUser() || {}
    if (currentUser.platformAdmin) return true
    var member = currentFamilyMember(members)
    return !!(member && member.role === 'FAMILY_ADMIN')
  }

  function familyActionErrorMessage(error, fallback) {
    return apiActionErrorMessage(error, fallback)
  }

  function renderFamilyInvitationList(invitations) {
    if (!invitations || !invitations.length) return ''
    return [
      '<section class="family-invitation-panel">',
      '<header><strong>받은 가족 초대</strong><span>' + invitations.length + '건</span></header>',
      invitations.map(function (item) {
        return [
          '<article data-family-invitation-id="' + escapeHtml(item.id) + '">',
          '<div><strong>' + escapeHtml(item.familyName || '가족그룹') + '</strong>',
          '<span>' + escapeHtml(item.inviterName || '초대자') + ' · ' + escapeHtml(roleText(item.role)) + ' · ' + escapeHtml(permissionText(item)) + '</span></div>',
          '<div class="member-actions"><button type="button" data-family-invite-accept="' + escapeHtml(item.id) + '">수락</button><button type="button" class="danger-button" data-family-invite-reject="' + escapeHtml(item.id) + '">거절</button></div>',
          '</article>'
        ].join('')
      }).join(''),
      '</section>'
    ].join('')
  }

  function renderSentFamilyInvitationList(invitations) {
    if (!invitations || !invitations.length) return ''
    return [
      '<section class="family-invitation-panel sent-family-invitation-panel">',
      '<header><strong>\uBCF4\uB0B8 \uCD08\uB300</strong><span>' + invitations.length + '\uAC74</span></header>',
      invitations.map(function (item) {
        var invitee = item.inviteeName || item.inviteeEmail || '\uCD08\uB300\uB300\uC0C1'
        return [
          '<article data-family-sent-invitation-id="' + escapeHtml(item.id) + '">',
          '<div><strong>' + escapeHtml(invitee) + '</strong>',
          '<span>' + escapeHtml(roleText(item.role)) + ' \u00B7 ' + escapeHtml(permissionText(item)) + '</span></div>',
          '<div class="member-actions"><button type="button" class="danger-button" data-family-invite-cancel="' + escapeHtml(item.id) + '">\uCD08\uB300 \uCDE8\uC18C</button></div>',
          '</article>'
        ].join('')
      }).join(''),
      '</section>'
    ].join('')
  }

  function bindFamilyInvitationActions(root) {
    root.querySelectorAll('[data-family-invite-accept], [data-family-invite-reject]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.dataset.familyInviteAccept || button.dataset.familyInviteReject
        var accept = !!button.dataset.familyInviteAccept
        showPatchConfirm(accept ? '가족 초대를 수락할까요?' : '가족 초대를 거절할까요?', function () {
          apiRequest('/family-invitations/' + encodeURIComponent(id) + '/' + (accept ? 'accept' : 'reject'), { method: 'POST' }).then(function () {
            showPatchToast(accept ? '가족그룹에 참여했습니다.' : '초대를 거절했습니다.')
            loadFamilyGroupPage(root)
          }).catch(function (error) {
            showPatchToast(error && error.status === 409 ? '이미 다른 가족그룹에 속해 있습니다.' : '초대 처리에 실패했습니다.')
          })
        })
      })
    })
    root.querySelectorAll('[data-family-invite-cancel]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.dataset.familyInviteCancel
        showPatchConfirm('\uBCF4\uB0B8 \uCD08\uB300\uB97C \uCDE8\uC18C\uD560\uAE4C\uC694?', function () {
          apiRequest('/family-invitations/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
            showPatchToast('\uCD08\uB300\uB97C \uCDE8\uC18C\uD588\uC2B5\uB2C8\uB2E4.')
            loadFamilyGroupPage(root)
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uCD08\uB300 \uCDE8\uC18C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      })
    })
  }

  function renderFamilyManagePage(root, family, members, invitations, sentInvitations) {
    var currentUser = readStoredAuthUser() || {}
    var canManage = canManageFamily(members)
    window.__familyLastMembers = members || []
    var rows = members.length ? members.map(function (member) {
      var displayName = member.nickname || member.email || ('ID ' + member.userId)
      var isMe = String(member.userId) === String(currentUser.id || '')
      var action = canManage ? '<button type="button" data-family-edit-member="' + escapeHtml(member.id) + '">수정</button>' : ''
      if (isMe) action += '<button type="button" class="danger-button" data-family-leave="' + escapeHtml(member.id) + '">가족그룹 나가기</button>'
      else if (canManage) action += '<button type="button" class="danger-button" data-family-remove-member="' + escapeHtml(member.id) + '">내보내기</button>'
      return [
        '<article data-family-member-id="' + escapeHtml(member.id) + '">',
        '<div><strong>' + escapeHtml(displayName) + (isMe ? ' <em>나</em>' : '') + '</strong>',
        '<span>' + escapeHtml(roleText(member.role)) + ' · ' + escapeHtml(permissionText(member)) + (member.email ? ' · ' + escapeHtml(member.email) : '') + '</span></div>',
        '<div class="member-actions">' + action + '</div>',
        canManage ? [
          '<div class="family-member-edit" data-family-member-editor="' + escapeHtml(member.id) + '" hidden>',
          '<label><span>역할</span><select data-family-edit-role><option value="MEMBER"' + (member.role === 'MEMBER' ? ' selected' : '') + '>가족구성원</option><option value="FAMILY_ADMIN"' + (member.role === 'FAMILY_ADMIN' ? ' selected' : '') + '>가족관리자</option></select></label>',
          '<div class="permission-chips">',
          '<button type="button" class="' + (member.canRead && member.canCreate && member.canUpdate && member.canDelete ? 'active' : '') + '" data-family-edit-permission-all>전체</button>',
          '<button type="button" class="' + (member.canRead ? 'active' : '') + '" data-family-edit-permission="canRead">읽기</button>',
          '<button type="button" class="' + (member.canCreate ? 'active' : '') + '" data-family-edit-permission="canCreate">쓰기</button>',
          '<button type="button" class="' + (member.canUpdate ? 'active' : '') + '" data-family-edit-permission="canUpdate">수정</button>',
          '<button type="button" class="' + (member.canDelete ? 'active' : '') + '" data-family-edit-permission="canDelete">삭제</button>',
          '</div>',
          '<div class="member-actions"><button type="button" class="save-button" data-family-save-member="' + escapeHtml(member.id) + '">저장</button><button type="button" class="cancel-button" data-family-cancel-member="' + escapeHtml(member.id) + '">취소</button></div>',
          '</div>'
        ].join('') : '',
        '</article>'
      ].join('')
    }).join('') : '<div class="api-empty-row"><strong>등록된 구성원이 없습니다.</strong></div>'
    var inviteForm = canManage ? [
      '<form class="code-form invite-form family-invite-form">',
      '<div class="form-row">',
      '<label><span>초대할 사용자</span><input data-invite-user /></label>',
      '<label><span>역할</span><select data-invite-role><option value="MEMBER">가족구성원</option><option value="FAMILY_ADMIN">가족관리자</option></select></label>',
      '</div>',
      '<div class="permission-chips">',
      '<button type="button" data-invite-permission-all>전체</button>',
      '<button type="button" class="active" data-invite-permission="canRead">읽기</button>',
      '<button type="button" data-invite-permission="canCreate">쓰기</button>',
      '<button type="button" data-invite-permission="canUpdate">수정</button>',
      '<button type="button" data-invite-permission="canDelete">삭제</button>',
      '</div>',
      '<button class="submit-action" type="submit">초대 보내기</button>',
      '</form>'
    ].join('') : '<div class="api-empty-row family-member-readonly"><strong>가족구성원은 구성원 초대와 내보내기를 할 수 없습니다.</strong></div>'
    root.innerHTML = [
      '<section class="panel wide family-group-panel">',
      '<header class="panel-header"><h2>가족그룹</h2></header>',
      renderFamilyInvitationList(invitations || []),
      canManage ? renderSentFamilyInvitationList(sentInvitations || []) : '',
      '<div class="family-group-summary">',
      '<article><strong>' + escapeHtml(family.name || '-') + '</strong></article>',
      '<article><span>구성원</span><strong>' + members.length + '명</strong><small>읽기/쓰기/수정/삭제 권한 관리</small></article>',
      '</div>',
      inviteForm,
      '<div class="family-group-list">',
      rows,
      '</div>',
      '</section>'
    ].join('')
    schedulePlaceholderSweep(root)
    bindFamilyInviteForm(root, family, canManage)
    bindFamilyInvitationActions(root)
  }

  function syncFamilyPermissionAll(chips) {
    if (!chips) return
    var allButton = chips.querySelector('[data-family-edit-permission-all]')
    if (!allButton) return
    var permissionButtons = Array.from(chips.querySelectorAll('[data-family-edit-permission]'))
    allButton.classList.toggle('active', permissionButtons.length > 0 && permissionButtons.every(function (item) {
      return item.classList.contains('active')
    }))
  }

  function bindFamilyInviteForm(root, family, canManage) {
    var form = root.querySelector('.family-invite-form')
    if (form && family && family.id && canManage) {
      var permissions = { canRead: true, canCreate: false, canUpdate: false, canDelete: false }
      var inviteAllButton = form.querySelector('[data-invite-permission-all]')
      function syncInviteAllButton() {
        if (!inviteAllButton) return
        inviteAllButton.classList.toggle('active', permissions.canRead && permissions.canCreate && permissions.canUpdate && permissions.canDelete)
      }
      form.querySelectorAll('[data-invite-permission]').forEach(function (button) {
        button.addEventListener('click', function () {
          var key = button.dataset.invitePermission
          permissions[key] = !permissions[key]
          button.classList.toggle('active', !!permissions[key])
          syncInviteAllButton()
        })
      })
      if (inviteAllButton) {
        inviteAllButton.addEventListener('click', function () {
          var next = !(permissions.canRead && permissions.canCreate && permissions.canUpdate && permissions.canDelete)
          Object.keys(permissions).forEach(function (key) { permissions[key] = next })
          form.querySelectorAll('[data-invite-permission]').forEach(function (button) {
            button.classList.toggle('active', !!permissions[button.dataset.invitePermission])
          })
          syncInviteAllButton()
        })
        syncInviteAllButton()
      }
      form.addEventListener('submit', function (event) {
        event.preventDefault()
        var input = form.querySelector('[data-invite-user]')
        var invite = String((input && input.value || '').trim())
        if (!invite) {
          showPatchToast('초대할 사용자의 이메일이나 닉네임을 입력해주세요.')
          if (input) input.focus()
          return
        }
        var role = (form.querySelector('[data-invite-role]') || {}).value || 'MEMBER'
        var payload = Object.assign({ invite: invite, role: role }, permissions)
        var submit = form.querySelector('button[type="submit"]')
        if (submit) {
          submit.disabled = true
          submit.textContent = '초대 중'
        }
        postJson('/families/' + encodeURIComponent(family.id) + '/invitations', payload).then(function () {
          showPatchToast('초대를 보냈습니다. 상대방이 수락하면 구성원으로 추가됩니다.')
          if (input) input.value = ''
          loadFamilyGroupPage(root)
        }).catch(function (error) {
          showPatchToast(apiActionErrorMessage(error, '초대에 실패했습니다.'))
        }).finally(function () {
          if (submit) {
            submit.disabled = false
            submit.textContent = '초대 보내기'
          }
        })
      })
    }
    root.querySelectorAll('[data-family-leave], [data-family-remove-member]').forEach(function (button) {
      button.addEventListener('click', function () {
        var memberId = button.dataset.familyLeave || button.dataset.familyRemoveMember
        var leaving = !!button.dataset.familyLeave
        showPatchConfirm(leaving ? '가족그룹에서 나갈까요?' : '구성원을 내보낼까요?', function () {
          apiRequest('/families/' + encodeURIComponent(family.id) + '/members/' + encodeURIComponent(memberId), { method: 'DELETE' }).then(function () {
            if (leaving) localStorage.removeItem(AUTH_FAMILY_STORAGE_KEY)
            showPatchToast(leaving ? '가족그룹에서 나갔습니다.' : '구성원을 내보냈습니다.')
            loadFamilyGroupPage(root)
          }).catch(function (error) {
            showPatchToast(familyActionErrorMessage(error, '처리에 실패했습니다.'))
          })
        })
      })
    })
    root.querySelectorAll('[data-family-edit-member]').forEach(function (button) {
      button.addEventListener('click', function () {
        var editor = root.querySelector('[data-family-member-editor="' + button.dataset.familyEditMember + '"]')
        if (!editor) return
        root.querySelectorAll('.family-member-edit').forEach(function (item) {
          if (item !== editor) item.hidden = true
        })
        editor.hidden = false
        editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    })
    root.querySelectorAll('[data-family-cancel-member]').forEach(function (button) {
      button.addEventListener('click', function () {
        var editor = root.querySelector('[data-family-member-editor="' + button.dataset.familyCancelMember + '"]')
        if (editor) editor.hidden = true
      })
    })
    root.querySelectorAll('[data-family-edit-permission]').forEach(function (button) {
      button.addEventListener('click', function () {
        button.classList.toggle('active')
        syncFamilyPermissionAll(button.closest('.permission-chips'))
      })
    })
    root.querySelectorAll('[data-family-edit-permission-all]').forEach(function (button) {
      button.addEventListener('click', function () {
        var chips = button.closest('.permission-chips')
        if (!chips) return
        var permissionButtons = Array.from(chips.querySelectorAll('[data-family-edit-permission]'))
        var next = !permissionButtons.every(function (item) { return item.classList.contains('active') })
        permissionButtons.forEach(function (item) { item.classList.toggle('active', next) })
        syncFamilyPermissionAll(chips)
      })
    })
    root.querySelectorAll('.permission-chips').forEach(syncFamilyPermissionAll)
    root.querySelectorAll('[data-family-save-member]').forEach(function (button) {
      button.addEventListener('click', function () {
        var memberId = button.dataset.familySaveMember
        var member = (Array.isArray(window.__familyLastMembers) ? window.__familyLastMembers : []).find(function (item) {
          return String(item.id) === String(memberId)
        })
        var editor = root.querySelector('[data-family-member-editor="' + memberId + '"]')
        if (!member || !editor) return
        var role = (editor.querySelector('[data-family-edit-role]') || {}).value || 'MEMBER'
        var adminCount = (Array.isArray(window.__familyLastMembers) ? window.__familyLastMembers : []).filter(function (item) {
          return item.role === 'FAMILY_ADMIN'
        }).length
        if (member.role === 'FAMILY_ADMIN' && role !== 'FAMILY_ADMIN' && adminCount <= 1) {
          showPatchToast('가족관리자는 최소 1명 필요합니다.')
          return
        }
        var payload = {
          userId: member.userId,
          role: role,
          canRead: !!editor.querySelector('[data-family-edit-permission="canRead"].active'),
          canCreate: !!editor.querySelector('[data-family-edit-permission="canCreate"].active'),
          canUpdate: !!editor.querySelector('[data-family-edit-permission="canUpdate"].active'),
          canDelete: !!editor.querySelector('[data-family-edit-permission="canDelete"].active')
        }
        showPatchConfirm('구성원 권한을 저장할까요?', function () {
          button.disabled = true
          apiRequest('/families/' + encodeURIComponent(family.id) + '/members/' + encodeURIComponent(memberId), {
            method: 'PUT',
            body: JSON.stringify(payload)
          }).then(function () {
            showPatchToast('권한을 저장했습니다.')
            loadFamilyGroupPage(root)
          }).catch(function (error) {
            showPatchToast(familyActionErrorMessage(error, '권한 저장에 실패했습니다.'))
          }).finally(function () {
            button.disabled = false
          })
        })
      })
    })
  }

  function renderFamilyCreatePage(root, invitations) {
    root.innerHTML = [
      '<section class="panel wide family-group-panel">',
      '<header class="panel-header"><h2>가족그룹 생성</h2></header>',
      renderFamilyInvitationList(invitations || []),
      '<form class="code-form family-create-form">',
      '<label><span>가족명</span><input data-family-name maxlength="40" /></label>',
      '<button class="submit-action" type="submit">가족그룹 생성</button>',
      '</form>',
      '<div class="api-empty-row"><strong>연결된 가족그룹이 없습니다.</strong></div>',
      '</section>'
    ].join('')
    schedulePlaceholderSweep(root)
    bindFamilyInvitationActions(root)
    var form = root.querySelector('.family-create-form')
    var input = root.querySelector('[data-family-name]')
    if (input) input.focus()
    if (!form) return
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      var name = String((input || {}).value || '').trim()
      if (!name) {
        showPatchToast('가족명을 입력해주세요.')
        if (input) input.focus()
        return
      }
      var submit = form.querySelector('button[type="submit"]')
      if (submit) {
        submit.disabled = true
        submit.textContent = '생성 중'
      }
      postJson('/families', { name: name }).then(function (family) {
        localStorage.setItem(AUTH_FAMILY_STORAGE_KEY, String(family.id))
        showPatchToast('가족그룹을 생성했습니다.')
        loadFamilyGroupPage(root)
      }).catch(function (error) {
        showPatchToast(error && error.status === 409 ? '이미 가족그룹에 속해 있습니다.' : '가족그룹 생성에 실패했습니다.')
        if (submit) {
          submit.disabled = false
          submit.textContent = '가족그룹 생성'
        }
      })
    })
  }

  function refreshCalendarPatch() {
    if (document.documentElement.dataset.patchPage === 'community') {
      removeFeaturePlaceholders()
      return
    }
    if (document.documentElement.dataset.patchPage === 'family-group') {
      removeFeaturePlaceholders()
      cleanupPassiveButtons()
      return
    }
    cleanupStaleServerPanels()
    ensureCalendarModeDefaultDates()
    ensureCalendarJumpControl()
    ensureCommunityMenu()
    ensureYearMonthClickGuard()
    ensureScheduleActionDelegates()
    wireCalendarInteractions()
    cleanupCalendarChrome()
    syncCalendarEntryToToday()
    ensureYearModeTabs()
    ensureScheduleDefaultTime()
    normalizeLedgerEntryForm()
    normalizeTravelEntryForm()
    ensureTravelHeaderActions()
    normalizeDiaryEntryForm()
    normalizeBabyEntryForms()
    normalizeTimeInputs()
    removeFeaturePlaceholders()
    wireScheduleDetailRows()
    hideSelectedDayPanels()
    refreshScheduleListCount()
    renderCalendarApiSchedules(false)
    normalizeLunarLabels()
    decorateCalendarHolidays()
    enhanceDatepickers()
    syncScheduleBasisLayout()
    refreshLabelCleanup()
    ensureAuthRegisterFields()
    normalizeAuthLanding()
    cleanupAuthActions()
    consumePendingNavLabel()
    enhanceAuthApi()
    consumeSsoFragment()
    restoreAuthSession()
    ensurePasswordChangeAction()
    enhanceBabyGrowthTabs()
    enhanceAuthSso()
    enhanceHomeDashboard()
    renderNotificationBell()
    loadScheduleNotifications()
    refreshServerDataViews()
    removeLedgerManageButton()
    hideBabyEmptySelectionPanel()
    enhanceBabyRecordMedia()
    cleanupBabyDetailButtons()
    ensureBabyMainActions()
    normalizeBabyCreateDialog()
    ensureDiaryMainActions()
    ensureBabyApiRecordForm()
    enhanceBabyEditMediaHelper()
    enhanceBabyProfileEdit()
    hideAdminMenuAddButton()
    enhanceMediaUploadLimits()
    cleanupPassiveButtons()
    syncSelectedDayHeaderFromState()
  }

  function safeRefreshCalendarPatch() {
    if (window.__familyPatchRefreshing) return
    window.__familyPatchRefreshing = true
    try {
      refreshCalendarPatch()
    } catch (error) {
      window.__familyPatchLastError = String(error && error.message ? error.message : error)
    } finally {
      window.__familyPatchRefreshing = false
    }
  }

  function schedulePatchRefresh() {
    if (window.__familyPatchRefreshTimer) return
    window.__familyPatchRefreshTimer = window.setTimeout(function () {
      window.__familyPatchRefreshTimer = null
      safeRefreshCalendarPatch()
    }, 120)
  }

  function handlePatchMutations(mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === 'attributes') {
        removeFeaturePlaceholders(mutation.target)
        return
      }
      Array.from(mutation.addedNodes || []).forEach(function (node) {
        if (!node || node.nodeType !== 1) return
        removeFeaturePlaceholders(node)
        clearSampleFieldValues(node)
      })
    })
    schedulePatchRefresh()
  }

  var observer = new MutationObserver(handlePatchMutations)
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['placeholder'] })
  window.setInterval(function () {
    removeFeaturePlaceholders()
  }, 250)
  window.setInterval(safeRefreshCalendarPatch, 1000)
  safeRefreshCalendarPatch()

  function handleAuthSubmitEvent(event) {
    var submit = event.target && event.target.closest && event.target.closest('.auth-submit')
    if (!submit || submit.dataset.authBypass === 'true') return false
    if (document.querySelector('.app-shell')) return false
    var card = submit.closest('.auth-card')
    if (!card) return false
    if (shouldAllowLegacyLogin(card, submit)) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitAuthViaApi(card, submit)
    return true
  }

  window.addEventListener('click', handleAuthSubmitEvent, true)
  document.addEventListener('click', handleAuthSubmitEvent, true)

  function handleAuthFormSubmitEvent(event) {
    var card = event.target && event.target.closest && event.target.closest('.auth-card')
    if (!card) return false
    if (document.querySelector('.app-shell')) return false
    var submit = card.querySelector('.auth-submit')
    if (!submit || submit.dataset.authBypass === 'true') return false
    if (shouldAllowLegacyLogin(card, submit)) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitAuthViaApi(card, submit)
    return true
  }

  window.addEventListener('submit', handleAuthFormSubmitEvent, true)
  document.addEventListener('submit', handleAuthFormSubmitEvent, true)
  window.__familyAuthPatchReady = true

  document.addEventListener('pointerdown', function (event) {
    if (!findLogoutClickTarget(event.target)) return
    logoutCurrentSession()
  }, true)

  document.addEventListener('click', function (event) {
    if (!findLogoutClickTarget(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    logoutCurrentSession()
    forceClearStoredAuth()
    window.setTimeout(function () {
      window.location.replace('/')
    }, 80)
  }, true)

  document.addEventListener('click', function (event) {
    var titleButton = event.target && event.target.closest && event.target.closest('.family-calendar-panel .calendar-title-button')
    if (!titleButton) return

    event.preventDefault()
    event.stopPropagation()
    if (window.__calendarTitlePointerOpenedAt && Date.now() - window.__calendarTitlePointerOpenedAt < 500) return
    var current = document.querySelector('.jump-datepicker-popover')
    if (current) {
      current.remove()
      return
    }
    renderJumpDatepicker(getScheduleFormVisibleDate() || getFocusedDate())
  }, true)

  document.addEventListener('pointerdown', function (event) {
    var titleButton = event.target && event.target.closest && event.target.closest('.family-calendar-panel .calendar-title-button')
    if (!titleButton) return

    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    var current = document.querySelector('.jump-datepicker-popover')
    if (current) {
      current.remove()
      return
    }
    window.__calendarTitlePointerOpenedAt = Date.now()
    renderJumpDatepicker(getScheduleFormVisibleDate() || getFocusedDate())
  }, true)

  function normalizeLunarLabels() {
    var items = Array.from(document.querySelectorAll('.family-calendar-panel .calendar-day-card small'))
    items.forEach(function (item) {
      var card = item.closest('.calendar-day-card')
      var number = card && card.querySelector('.day-number')
      var day = number ? Number(number.textContent.trim()) : NaN
      if (!Number.isFinite(day)) return
      item.style.display = day % 5 === 0 ? '' : 'none'
    })
  }

  function enhanceDatepickers() {
    document.querySelectorAll('.calendar-popover:not(.jump-datepicker-popover):not(.baby-common-date-popover)').forEach(function (popover) {
      if (!popover.querySelector('.calendar-today-row')) {
        var row = document.createElement('div')
        row.className = 'calendar-today-row'
        var today = document.createElement('button')
        today.type = 'button'
        today.textContent = '\uC624\uB298'
        today.addEventListener('click', function () {
          var field = popover.closest('.date-picker-field')
          var triggerText = field && field.querySelector('.date-picker-trigger span')
          var now = new Date()
          if (field && field.closest('.schedule-form-card')) {
            updateScheduleFormVisibleDate(now)
          } else if (triggerText) {
            triggerText.textContent = formatDisplayDate(now)
          }
          popover.classList.add('calendar-popover-hidden')
        })
        row.appendChild(today)
        var header = popover.querySelector('.calendar-header')
        if (header) header.insertAdjacentElement('afterend', row)
      }

      popover.querySelectorAll('.calendar-day-grid button, .calendar-month-grid button, .calendar-year-grid button').forEach(function (button) {
        if (button.dataset.closeWired) return
        button.dataset.closeWired = 'true'
        button.addEventListener('click', function () {
          window.setTimeout(function () {
            var stillOpen = button.closest('.calendar-popover')
            var field = stillOpen && stillOpen.closest('.date-picker-field')
            if (field && field.closest('.schedule-form-card')) {
              var date = getScheduleFormVisibleDate()
              if (date) updateScheduleFormVisibleDate(date)
            }
            if (stillOpen) stillOpen.classList.add('calendar-popover-hidden')
          }, 120)
        })
      })
    })
  }

  function syncScheduleBasisLayout() {
    var card = document.querySelector('.schedule-form-card')
    if (!card) return
    var labels = Array.from(card.querySelectorAll('label, .date-picker-field'))
    var dateField = card.querySelector('.date-picker-field')
    var basisLabel = labels.find(function (label) {
      return label.textContent && label.textContent.indexOf('\uAE30\uC900') >= 0
    })
    if (dateField && basisLabel && dateField.parentElement) {
      dateField.parentElement.classList.add('schedule-date-basis-row')
    }
    if (dateField && basisLabel && !basisLabel.classList.contains('basis-field-patched')) {
      basisLabel.classList.add('basis-field-patched')
      if (dateField.parentElement && basisLabel.parentElement !== dateField.parentElement) {
        dateField.parentElement.insertBefore(basisLabel, dateField)
      } else if (dateField.parentElement && basisLabel.nextElementSibling !== dateField) {
        dateField.parentElement.insertBefore(basisLabel, dateField)
      }
    }
    if (basisLabel && !basisLabel.dataset.basisWired) {
      basisLabel.dataset.basisWired = 'true'
      basisLabel.addEventListener('click', function (event) {
        window.setTimeout(function () {
          var text = basisLabel.textContent || ''
          var triggerText = basisLabel.querySelector('.custom-select-trigger span')
          var selectedBasis = triggerText ? triggerText.textContent.trim() : ''
          var note = card.querySelector('.schedule-lunar-note')
          if (selectedBasis === '\uC74C\uB825') {
            var date = getScheduleFormVisibleDate()
            if (date) updateScheduleFormVisibleDate(date)
          } else if (note) {
            note.remove()
            refreshScheduleDateDisplayForBasis()
          }
        }, 80)
      })
    }
  }

  function closeOpenSelects(target) {
    if (target && target.closest && target.closest('.custom-select')) {
      var current = target.closest('.custom-select')
      document.querySelectorAll('.date-picker-field .calendar-popover').forEach(function (popover) {
        popover.remove()
      })
      document.querySelectorAll('.custom-select.open').forEach(function (select) {
        if (select !== current) select.classList.remove('open')
      })
      document.querySelectorAll('.custom-select-trigger.open').forEach(function (trigger) {
        if (!current.contains(trigger)) trigger.classList.remove('open')
      })
      if (target.closest('.custom-select-list button')) {
        var option = target.closest('.custom-select-list button')
        var optionText = option ? option.textContent.trim() : ''
        var triggerText = current.querySelector('.custom-select-trigger span')
        window.setTimeout(function () {
          if (optionText && triggerText && triggerText.textContent.trim() !== optionText) {
            triggerText.textContent = optionText
          }
          if (current.closest('.basis-field-patched')) {
            var card = document.querySelector('.schedule-form-card')
            var basisLabel = current.closest('.basis-field-patched')
            var note = card && card.querySelector('.schedule-lunar-note')
            if (optionText === '\uC74C\uB825') {
              var date = getScheduleFormVisibleDate()
              if (date) updateScheduleFormVisibleDate(date)
            } else if (note) {
              note.remove()
              refreshScheduleDateDisplayForBasis()
            } else if (current.closest('.basis-field-patched')) {
              refreshScheduleDateDisplayForBasis()
            }
          }
        }, 40)
        window.setTimeout(function () {
          current.classList.remove('open')
          current.querySelectorAll('.custom-select-trigger.open').forEach(function (trigger) {
            trigger.classList.remove('open')
          })
        }, 220)
      }
      return
    }

    window.dispatchEvent(new CustomEvent('family-platform-select-open', { detail: 'outside-click' }))

    window.setTimeout(function () {
      document.querySelectorAll('.custom-select.open').forEach(function (select) {
        select.classList.remove('open')
      })
      document.querySelectorAll('.custom-select-trigger.open').forEach(function (trigger) {
        trigger.classList.remove('open')
      })
    }, 0)
  }

  document.addEventListener('pointerdown', function (event) {
    closeOpenSelects(event.target)
  }, true)

  document.addEventListener('touchstart', function (event) {
    closeOpenSelects(event.target)
  }, true)

  document.addEventListener('click', function (event) {
    closeOpenSelects(event.target)
  }, true)

  document.addEventListener('click', function (event) {
    if (!(event.target && event.target.closest && event.target.closest('.date-picker-trigger'))) return
    window.setTimeout(function () {
      var field = event.target.closest('.date-picker-field')
      if (!field) return
      field.querySelectorAll('.calendar-popover-hidden').forEach(function (popover) {
        popover.classList.remove('calendar-popover-hidden')
      })
    }, 0)
  }, true)

  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && (event.target.closest('.jump-datepicker-popover') || event.target.closest('.family-calendar-panel .calendar-title-button'))) return
    var jump = document.querySelector('.jump-datepicker-popover')
    if (jump) {
      jump.remove()
      document.documentElement.classList.remove('calendar-jump-open')
    }
  }, true)

  function getCleanText(element) {
    return element ? element.textContent.replace(/\s+/g, ' ').trim() : ''
  }

  function normalizeLabelText(text) {
    return String(text || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
  }

  function getLabelTitle(label) {
    return label ? label.querySelector('span, strong, b') : null
  }

  function getLabelText(label) {
    return normalizeLabelText(getCleanText(getLabelTitle(label)))
  }

  function hidePatchElement(element) {
    if (!element) return
    element.style.display = 'none'
    element.setAttribute('aria-hidden', 'true')
    element.dataset.patchHidden = 'true'
  }

  function refreshLabelCleanup() {
    document.querySelectorAll('.topbar span, .eyebrow, .panel-header h2').forEach(function (item) {
      var text = getCleanText(item)
      if (text === '\uC0AC\uC9C4, \uB0A0\uC528, \uAC00\uC871 \uC77C\uAE30') item.textContent = '\uC0AC\uC9C4, \uB0A0\uC528, \uC77C\uAE30'
      if (text === '\uAC00\uC871 \uC77C\uAE30') item.textContent = '\uC77C\uAE30'
    })
    document.querySelectorAll('.panel-header').forEach(function (header) {
      var title = getCleanText(header.querySelector('h2'))
      var actionButton = header.querySelector(':scope > button')

      if (title === '\uAC00\uACC4\uBD80 \uC785\uB825' && actionButton && getCleanText(actionButton) === '\uD3B8\uC9D1') {
        hidePatchElement(actionButton)
      }

      if (title === '\uC77C\uC815 \uCD94\uAC00' && actionButton && getCleanText(actionButton) === '\uC0C8 \uC77C\uC815') {
        hidePatchElement(actionButton)
      }

      if (title === '\uC721\uC544 \uAE30\uB85D') {
        var babyNameButton = actionButton && getCleanText(actionButton) !== '\uBAA9\uB85D' ? actionButton : null
        if (babyNameButton) hidePatchElement(babyNameButton)

        var detail = document.querySelector('.baby-detail')
        var backButton = detail && detail.querySelector('.back-button')
        if (!backButton) {
          if (!detail) {
            header.querySelectorAll('.baby-header-back-button').forEach(function (button) {
              button.remove()
            })
            if (actionButton && getCleanText(actionButton) === '\uBAA9\uB85D') hidePatchElement(actionButton)
          }
          return
        }
        if (backButton && !header.querySelector('.baby-header-back-button')) {
          var babyBackClone = document.createElement('button')
          babyBackClone.type = 'button'
          babyBackClone.className = 'baby-header-back-button'
          babyBackClone.textContent = getCleanText(backButton) || '\uBAA9\uB85D'
          babyBackClone.addEventListener('click', function () {
            var original = document.querySelector('.baby-detail .back-button')
            if (original) original.click()
          })
          header.appendChild(babyBackClone)
        }
      }

      if (title === '\uC77C\uAE30' || title === '\uAC00\uC871 \uC77C\uAE30') {
        var detailButton = actionButton && getCleanText(actionButton) === '\uC0C1\uC138' ? actionButton : null
        if (detailButton) hidePatchElement(detailButton)

        var diaryDetail = document.querySelector('.diary-detail-card')
        var diaryBack = diaryDetail && diaryDetail.querySelector('.back-button')
        if (diaryBack && !header.querySelector('.diary-header-back-button')) {
          var diaryBackClone = document.createElement('button')
          diaryBackClone.type = 'button'
          diaryBackClone.className = 'diary-header-back-button'
          diaryBackClone.textContent = getCleanText(diaryBack) || '\uBAA9\uB85D'
          diaryBackClone.addEventListener('click', function () {
            var original = document.querySelector('.diary-detail-card .back-button')
            if (original) original.click()
          })
          header.appendChild(diaryBackClone)
        }
      }
    })
  }

  function openBabyProfileEditor(card) {
    var old = document.querySelector('.baby-profile-edit-backdrop')
    if (old) old.remove()

    var nameEl = card.querySelector('strong')
    var metaEl = card.querySelector('span')
    var memoEl = card.querySelector('p')
    var metricEl = card.querySelector('small:last-child') || Array.from(card.querySelectorAll('small')).find(function (item) {
      return getCleanText(item).indexOf('cm') >= 0 || getCleanText(item).indexOf('kg') >= 0
    })
    var metric = getCleanText(metricEl)
    var metricParts = metric.split('\u00B7').map(function (item) { return item.trim() })
    var avatar = card.querySelector('.baby-avatar')
    var currentPhoto = avatar && avatar.querySelector('img') ? avatar.querySelector('img').src : ''
    var nextPhoto = currentPhoto

    var backdrop = document.createElement('div')
    backdrop.className = 'baby-profile-edit-backdrop'
    var dialog = document.createElement('section')
    dialog.className = 'baby-profile-edit-dialog'

    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'dialog-close'
    close.textContent = 'x'
    close.addEventListener('click', function () { backdrop.remove() })

    var title = document.createElement('h2')
    title.textContent = '\uC544\uC774 \uC815\uBCF4 \uC218\uC815'

    function field(label, value, placeholder) {
      var wrap = document.createElement('label')
      var span = document.createElement('span')
      var input = document.createElement('input')
      span.textContent = label
      input.value = value || ''
      input.placeholder = placeholder || ''
      wrap.appendChild(span)
      wrap.appendChild(input)
      return { wrap: wrap, input: input }
    }

    var photoWrap = document.createElement('label')
    photoWrap.className = 'baby-profile-photo-field'
    var photoLabel = document.createElement('span')
    photoLabel.textContent = '\uD504\uB85C\uD544 \uC0AC\uC9C4'
    var photoPreview = document.createElement('div')
    photoPreview.className = 'baby-profile-photo-preview'
    if (currentPhoto) {
      var currentImg = document.createElement('img')
      currentImg.src = currentPhoto
      photoPreview.appendChild(currentImg)
    } else {
      photoPreview.textContent = '\uC0AC\uC9C4'
    }
    var photoInput = document.createElement('input')
    photoInput.type = 'file'
    photoInput.accept = 'image/*'
    photoInput.addEventListener('change', function () {
      var file = photoInput.files && photoInput.files[0]
      if (!file) return
      var reader = new FileReader()
      reader.onload = function () {
        nextPhoto = String(reader.result || '')
        photoPreview.innerHTML = ''
        var img = document.createElement('img')
        img.src = nextPhoto
        photoPreview.appendChild(img)
      }
      reader.readAsDataURL(file)
    })
    photoWrap.appendChild(photoLabel)
    photoWrap.appendChild(photoPreview)
    photoWrap.appendChild(photoInput)

    var nameField = field('\uC774\uB984', getCleanText(nameEl), '\uC608: \uCCAB\uC9F8')
    var metaField = field('\uC131\uBCC4/\uC6D4\uB839', getCleanText(metaEl), '\uC608: \uC5EC\uC544 · 1\uC138 9\uAC1C\uC6D4')
    var memoField = field('\uBA54\uBAA8', getCleanText(memoEl), '\uC608: \uB0AE\uC7A0 \uB9AC\uB4EC \uCCB4\uD06C \uC911')
    var heightField = field('\uD0A4', metricParts.find(function (item) { return item.indexOf('cm') >= 0 }) || '', '\uC608: 89cm')
    var weightField = field('\uBAB8\uBB34\uAC8C', metricParts.find(function (item) { return item.indexOf('kg') >= 0 }) || '', '\uC608: 12.8kg')

    var actions = document.createElement('div')
    actions.className = 'baby-profile-edit-actions'
    var cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'cancel-button'
    cancel.textContent = '\uCDE8\uC18C'
    cancel.addEventListener('click', function () { backdrop.remove() })
    var save = document.createElement('button')
    save.type = 'button'
    save.className = 'save-button'
    save.textContent = '\uC800\uC7A5'
    save.addEventListener('click', function () {
      if (!nameField.input.value.trim()) {
        nameField.input.focus()
        showPatchToast('\uC774\uB984\uC740 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
        return
      }
      if (nameEl) nameEl.textContent = nameField.input.value.trim()
      if (metaEl) metaEl.textContent = metaField.input.value.trim()
      if (memoEl) memoEl.textContent = memoField.input.value.trim()
      if (metricEl) {
        var metrics = [heightField.input.value.trim(), weightField.input.value.trim()].filter(Boolean)
        metricEl.textContent = metrics.join(' · ')
      }
      if (avatar && nextPhoto) {
        avatar.innerHTML = ''
        var savedImg = document.createElement('img')
        savedImg.src = nextPhoto
        avatar.appendChild(savedImg)
        card.dataset.profilePhoto = nextPhoto
      }
      card.dataset.profileEdited = 'true'
      backdrop.remove()
      showPatchToast('\uC544\uC774 \uC815\uBCF4\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
    })
    actions.appendChild(cancel)
    actions.appendChild(save)

    dialog.appendChild(close)
    dialog.appendChild(title)
    dialog.appendChild(photoWrap)
    dialog.appendChild(nameField.wrap)
    dialog.appendChild(metaField.wrap)
    dialog.appendChild(memoField.wrap)
    dialog.appendChild(heightField.wrap)
    dialog.appendChild(weightField.wrap)
    dialog.appendChild(actions)
    backdrop.appendChild(dialog)
    document.body.appendChild(backdrop)
  }

  function enhanceBabyProfileEdit() {
    document.querySelectorAll('.baby-card').forEach(function (card) {
      if (card.dataset.profileEditReady) return
      card.dataset.profileEditReady = 'true'
      var button = card.querySelector('.baby-card-edit-button')
      if (!button) {
        button = document.createElement('button')
        button.type = 'button'
        button.className = 'baby-card-edit-button'
        button.textContent = '\uC218\uC815'
        card.appendChild(button)
      }
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        openBabyProfileEditor(card)
      }, true)
    })
  }

  function openBabyCreateDialog() {
    if (document.querySelector('.baby-profile-edit-backdrop')) return
    var backdrop = document.createElement('div')
    backdrop.className = 'baby-profile-edit-backdrop'
    var dialog = document.createElement('section')
    dialog.className = 'baby-profile-edit-dialog baby-create-dialog'
    dialog.innerHTML = [
      '<button type="button" class="dialog-close">x</button>',
      '<h2>\uC544\uC774 \uCD94\uAC00</h2>',
      '<label><span>\uC774\uB984 <em class="required-mark">*</em></span><input data-baby-create-name maxlength="30" /><small class="field-error" data-baby-create-error="name" hidden></small></label>',
      '<label><span>\uC131\uBCC4 <em class="required-mark">*</em></span><input data-baby-create-gender type="hidden" /><div class="custom-select baby-create-gender-select" data-baby-create-gender-select><button type="button" class="custom-select-trigger" data-baby-create-gender-trigger><span>\uC120\uD0DD</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="custom-select-list" hidden><button type="button" data-baby-create-gender-value="\uB0A8">\uB0A8</button><button type="button" data-baby-create-gender-value="\uC5EC">\uC5EC</button></div></div><small class="field-error" data-baby-create-error="gender" hidden></small></label>',
      '<label class="date-picker-field baby-create-date-field"><span>\uC0DD\uC77C</span><input data-baby-create-birth type="hidden" value="' + todayText() + '" /><button type="button" class="date-picker-trigger baby-create-date-button" data-baby-create-birth-trigger><span>' + todayText().replace(/-/g, '.') + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2v4M16 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></label>',
      '<label><span>\uBA54\uBAA8</span><input data-baby-create-memo /></label>',
      '<label><span>\uD0A4(cm)</span><input data-baby-create-height inputmode="decimal" /></label>',
      '<label><span>\uBAB8\uBB34\uAC8C(kg)</span><input data-baby-create-weight inputmode="decimal" /></label>',
      '<div class="baby-profile-edit-actions"><button type="button" class="cancel-button">\uCDE8\uC18C</button><button type="button" class="save-button">\uC800\uC7A5</button></div>'
    ].join('')
    backdrop.appendChild(dialog)
    document.body.appendChild(backdrop)

    var nameInput = dialog.querySelector('[data-baby-create-name]')
    var closeDialog = function () { backdrop.remove() }
    dialog.querySelector('.dialog-close').addEventListener('click', closeDialog)
    dialog.querySelector('.cancel-button').addEventListener('click', closeDialog)
    if (nameInput) {
      nameInput.addEventListener('input', function () {
        if (String(nameInput.value || '').trim()) hideBabyCreateError(dialog, 'name')
      })
    }
    var birthInput = dialog.querySelector('[data-baby-create-birth]')
    bindBabyCreateGender(dialog)
    bindBabyCreateBirthDate(dialog)
    dialog.querySelector('.save-button').addEventListener('click', function () {
      var name = String(nameInput.value || '').trim()
      var genderInput = dialog.querySelector('[data-baby-create-gender]')
      var gender = String((genderInput && genderInput.value) || '').trim()
      clearBabyCreateErrors(dialog)
      if (!name || !gender) {
        if (!name) setBabyCreateError(dialog, 'name', '\uC774\uB984\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
        if (!gender) setBabyCreateError(dialog, 'gender', '\uC131\uBCC4\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
        var focusTarget = !name ? nameInput : dialog.querySelector('[data-baby-create-gender-trigger]')
        showPatchToast(!name ? '\uC774\uB984\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.' : '\uC131\uBCC4\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
        if (focusTarget) focusTarget.focus()
        return
      }
      var save = dialog.querySelector('.save-button')
      var initialHeight = optionalDecimal(getFieldValue(dialog, '[data-baby-create-height]'))
      var initialWeight = optionalDecimal(getFieldValue(dialog, '[data-baby-create-weight]'))
      save.disabled = true
      save.textContent = '\uC800\uC7A5 \uC911'
      getReadableFamilyId().then(function (familyId) {
        return postJson('/babies?familyId=' + encodeURIComponent(familyId), {
          name: name,
          gender: gender,
          birthDate: getFieldValue(dialog, '[data-baby-create-birth]') || todayText(),
          memo: getFieldValue(dialog, '[data-baby-create-memo]') || '',
          photoUrl: null,
          latestHeightCm: initialHeight,
          latestWeightKg: initialWeight
        })
      }).then(function (baby) {
        if (!baby || !baby.id || (!initialHeight && !initialWeight)) return baby
        return postJson('/babies/' + encodeURIComponent(baby.id) + '/records', {
          recordType: '\uC131\uC7A5',
          recordDate: todayText(),
          recordTime: currentTimeText(),
          heightCm: initialHeight,
          weightKg: initialWeight,
          memo: '',
          mediaUrls: []
        }).then(function () { return baby })
      }).then(function () {
        closeDialog()
        showPatchToast('\uC544\uC774\uB97C \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.')
        goMenu('\uC721\uC544')
        window.setTimeout(function () {
          renderBabyApiCards(true)
          refreshServerDataViews(true)
        }, 250)
      }).catch(function (error) {
        save.disabled = false
        save.textContent = '\uC800\uC7A5'
        showPatchToast(apiActionErrorMessage(error, '\uC544\uC774 \uCD94\uAC00\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      })
    })
    if (nameInput) nameInput.focus()
  }

  function normalizeBabyCreateDialog() {
    var dialog = document.querySelector('.baby-create-dialog')
    if (!dialog) return
    dialog.querySelectorAll('input, textarea').forEach(function (field) {
      field.removeAttribute('placeholder')
    })
    var birthInput = dialog.querySelector('[data-baby-create-birth]')
    if (birthInput && !birthInput.value) setInputValue(birthInput, todayText())
  }

  function clearBabyCreateErrors(dialog) {
    if (!dialog) return
    dialog.querySelectorAll('[data-baby-create-error]').forEach(function (item) {
      item.hidden = true
      item.textContent = ''
    })
    dialog.querySelectorAll('label.has-field-error').forEach(function (label) {
      label.classList.remove('has-field-error')
      label.removeAttribute('data-error-message')
    })
  }

  function setBabyCreateError(dialog, key, message) {
    var item = dialog && dialog.querySelector('[data-baby-create-error="' + key + '"]')
    if (item) {
      item.textContent = message
      item.hidden = true
    }
    var field = key === 'name'
      ? dialog && dialog.querySelector('[data-baby-create-name]')
      : dialog && dialog.querySelector('[data-baby-create-gender-select]')
    var label = field && field.closest && field.closest('label')
    if (label) {
      label.classList.add('has-field-error')
      label.setAttribute('data-error-message', message)
    }
  }

  function hideBabyCreateError(dialog, key) {
    var item = dialog && dialog.querySelector('[data-baby-create-error="' + key + '"]')
    if (item) {
      item.textContent = ''
      item.hidden = true
    }
    var field = key === 'name'
      ? dialog && dialog.querySelector('[data-baby-create-name]')
      : dialog && dialog.querySelector('[data-baby-create-gender-select]')
    var label = field && field.closest && field.closest('label')
    if (label) {
      label.classList.remove('has-field-error')
      label.removeAttribute('data-error-message')
    }
  }

  function bindBabyCreateGender(dialog) {
    var wrap = dialog && dialog.querySelector('[data-baby-create-gender-select]')
    if (!wrap) return
    var trigger = wrap.querySelector('[data-baby-create-gender-trigger]')
    var list = wrap.querySelector('.custom-select-list')
    var input = dialog.querySelector('[data-baby-create-gender]')
    if (!trigger || !list || !input) return
    trigger.addEventListener('click', function () {
      list.hidden = !list.hidden
      wrap.classList.toggle('open', !list.hidden)
      trigger.classList.toggle('open', !list.hidden)
    })
    list.querySelectorAll('[data-baby-create-gender-value]').forEach(function (button) {
      button.addEventListener('click', function () {
        input.value = button.dataset.babyCreateGenderValue || ''
        var label = trigger.querySelector('span')
        if (label) label.textContent = input.value || '\uC120\uD0DD'
        list.hidden = true
        wrap.classList.remove('open')
        trigger.classList.remove('open')
        hideBabyCreateError(dialog, 'gender')
      })
    })
  }

  function bindBabyCreateBirthDate(dialog) {
    var input = dialog && dialog.querySelector('[data-baby-create-birth]')
    var trigger = dialog && dialog.querySelector('[data-baby-create-birth-trigger]')
    if (!input || !trigger || trigger.dataset.babyBirthReady === 'true') return
    trigger.dataset.babyBirthReady = 'true'
  }

  function toggleCommonDatePopover(input, trigger) {
    var field = trigger && trigger.closest && trigger.closest('.date-picker-field')
    var current = field && field.querySelector('.calendar-popover')
    if (current) {
      current.remove()
      return
    }
    openCommonBirthDatePopover(input, trigger)
  }

  function openCommonBirthDatePopover(input, trigger) {
    document.querySelectorAll('.baby-common-date-popover, .date-picker-field .calendar-popover').forEach(function (old) {
      old.remove()
    })
    var selected = parseApiDate(input.value) || todayText()
    var view = new Date(selected + 'T00:00:00')
    var popover = document.createElement('div')
    popover.className = 'calendar-popover baby-common-date-popover'
    var level = 'day'

    function draw() {
      var year = view.getFullYear()
      var month = view.getMonth()
      var selectedDate = parseApiDate(selected) || todayText()
      var selectedYear = Number(selectedDate.slice(0, 4))
      var selectedMonth = Number(selectedDate.slice(5, 7)) - 1
      var title = level === 'year' ? year + '\uB144' : (level === 'month' ? year + '\uB144' : year + '\uB144 ' + (month + 1) + '\uC6D4')
      var html = '<header class="calendar-header"><button type="button" data-baby-date-prev>&lt;</button><button type="button" class="calendar-title-button" data-baby-date-title><span>' + title + '</span></button><button type="button" data-baby-date-next>&gt;</button></header>'
      html += '<div class="calendar-today-row"><button type="button" data-baby-date-today>\uC624\uB298</button></div>'
      if (level === 'year') {
        var startYear = Math.floor(year / 12) * 12
        html += '<div class="calendar-year-grid">'
        for (var yearIndex = 0; yearIndex < 12; yearIndex += 1) {
          var itemYear = startYear + yearIndex
          html += '<button type="button" class="' + (selectedYear === itemYear ? 'selected' : '') + '" data-baby-year="' + itemYear + '">' + itemYear + '\uB144</button>'
        }
        html += '</div>'
      } else if (level === 'month') {
        html += '<div class="calendar-month-grid">'
        for (var monthIndex = 0; monthIndex < 12; monthIndex += 1) {
          var isSelectedMonth = selectedYear === year && selectedMonth === monthIndex
          html += '<button type="button" class="' + (isSelectedMonth ? 'selected' : '') + '" data-baby-month="' + monthIndex + '">' + (monthIndex + 1) + '\uC6D4</button>'
        }
        html += '</div>'
      } else {
        var first = new Date(year, month, 1)
        var last = new Date(year, month + 1, 0).getDate()
        html += '<div class="calendar-weekdays"><span>\uC77C</span><span>\uC6D4</span><span>\uD654</span><span>\uC218</span><span>\uBAA9</span><span>\uAE08</span><span>\uD1A0</span></div><div class="calendar-day-grid">'
        for (var blank = 0; blank < first.getDay(); blank += 1) html += '<span class="calendar-empty"></span>'
        for (var day = 1; day <= last; day += 1) {
          var date = new Date(year, month, day)
          var iso = formatDate(date)
          var classes = []
          if (date.getDay() === 0) classes.push('holiday')
          if (date.getDay() === 6) classes.push('saturday')
          if (iso === selected) classes.push('selected')
          html += '<button type="button" class="' + classes.join(' ') + '" data-baby-date="' + iso + '">' + day + '</button>'
        }
        html += '</div>'
      }
      popover.innerHTML = html
      if (popover.isConnected) {
        window.setTimeout(function () {
          positionBabyCommonDatePopover(popover, trigger)
        }, 0)
      }
    }

    draw()
    document.body.appendChild(popover)
    positionBabyCommonDatePopover(popover, trigger)
    window.setTimeout(function () {
      positionBabyCommonDatePopover(popover, trigger)
    }, 0)
    function handleCommonDatePopoverAction(event, skipRecentPointer) {
      var target = event.target
      if (!target || !target.closest) return false
      var control = target.closest('[data-baby-date-prev], [data-baby-date-next], [data-baby-date-title], [data-baby-date-today], [data-baby-year], [data-baby-month], [data-baby-date]')
      if (!control) return false
      if (skipRecentPointer && popover.dataset.babyDatePointerAt && Date.now() - Number(popover.dataset.babyDatePointerAt) < 600) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation) event.stopImmediatePropagation()
        return true
      }
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      if (event.type === 'pointerdown') popover.dataset.babyDatePointerAt = String(Date.now())
      if (target.closest('[data-baby-date-prev]')) {
        if (level === 'year') view.setFullYear(view.getFullYear() - 12)
        else if (level === 'month') view.setFullYear(view.getFullYear() - 1)
        else view.setMonth(view.getMonth() - 1)
        draw()
        return true
      }
      if (target.closest('[data-baby-date-next]')) {
        if (level === 'year') view.setFullYear(view.getFullYear() + 12)
        else if (level === 'month') view.setFullYear(view.getFullYear() + 1)
        else view.setMonth(view.getMonth() + 1)
        draw()
        return true
      }
      if (target.closest('[data-baby-date-title]')) {
        if (level === 'day') level = 'month'
        else if (level === 'month') level = 'year'
        draw()
        return true
      }
      if (target.closest('[data-baby-date-today]')) {
        selected = todayText()
        view = new Date(selected + 'T00:00:00')
        level = 'day'
      }
      var yearButton = target.closest('[data-baby-year]')
      if (yearButton) {
        view.setFullYear(Number(yearButton.dataset.babyYear))
        level = 'month'
        draw()
        return true
      }
      var monthButton = target.closest('[data-baby-month]')
      if (monthButton) {
        view.setMonth(Number(monthButton.dataset.babyMonth))
        level = 'day'
        draw()
        return true
      }
      var dayButton = target.closest('[data-baby-date]')
      if (dayButton) selected = dayButton.dataset.babyDate
      if (target.closest('[data-baby-date-today]') || dayButton) {
        setInputValue(input, selected)
        var label = trigger.querySelector('span')
        if (label) label.textContent = selected.replace(/-/g, '.')
        popover.remove()
      }
      return true
    }

    popover.addEventListener('pointerdown', function (event) {
      handleCommonDatePopoverAction(event, false)
    }, true)
    popover.addEventListener('click', function (event) {
      handleCommonDatePopoverAction(event, true)
    }, true)
  }

  function positionBabyCommonDatePopover(popover, trigger) {
    if (!popover || !trigger || !trigger.getBoundingClientRect) return
    var viewport = window.visualViewport || null
    var viewportLeft = viewport ? viewport.offsetLeft : 0
    var viewportTop = viewport ? viewport.offsetTop : 0
    var viewportWidth = viewport ? viewport.width : window.innerWidth
    var viewportHeight = viewport ? viewport.height : window.innerHeight
    var rect = trigger.getBoundingClientRect()
    var width = Math.min(330, Math.max(280, viewportWidth - 32))
    var height = Math.min(popover.scrollHeight || popover.offsetHeight || 360, viewportHeight - 24)
    var belowTop = rect.bottom + 8
    var aboveTop = rect.top - height - 8
    var top = belowTop
    var minTop = viewportTop + 12
    var maxBottom = viewportTop + viewportHeight - 12
    if (belowTop + height > maxBottom && aboveTop >= minTop) {
      top = aboveTop
    } else if (belowTop + height > maxBottom) {
      top = Math.max(minTop, maxBottom - height)
    }
    var minLeft = viewportLeft + 16
    var maxLeft = viewportLeft + viewportWidth - width - 16
    var left = Math.max(minLeft, Math.min(maxLeft, rect.left + rect.width / 2 - width / 2))
    popover.style.setProperty('position', 'fixed', 'important')
    popover.style.setProperty('width', width + 'px', 'important')
    popover.style.setProperty('left', left + 'px', 'important')
    popover.style.setProperty('top', top + 'px', 'important')
  }

  function isBabyCommonDateTarget(target) {
    return !!(target && target.closest && target.closest('.baby-common-date-popover, [data-baby-create-birth-trigger], [data-baby-api-record-date-trigger], [data-baby-growth-date-trigger]'))
  }

  function closeBabyCommonDatePopoverOnOutsideEvent(event) {
    var popover = document.querySelector('.baby-common-date-popover')
    if (!popover) return
    if (isBabyCommonDateTarget(event.target)) return
    popover.remove()
  }

  function handleBabyCreateBirthTrigger(event, skipRecentPointer) {
    var trigger = event.target && event.target.closest && event.target.closest('[data-baby-create-birth-trigger]')
    if (!trigger) return false
    if (skipRecentPointer && trigger.dataset.babyBirthPointerAt && Date.now() - Number(trigger.dataset.babyBirthPointerAt) < 600) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      return true
    }
    var dialog = trigger.closest('.baby-create-dialog')
    var input = dialog && dialog.querySelector('[data-baby-create-birth]')
    if (!input) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (event.type === 'pointerdown') trigger.dataset.babyBirthPointerAt = String(Date.now())
    toggleCommonDatePopover(input, trigger)
    return true
  }

  document.addEventListener('pointerdown', function (event) {
    handleBabyCreateBirthTrigger(event, false)
  }, true)

  document.addEventListener('click', function (event) {
    handleBabyCreateBirthTrigger(event, true)
  }, true)

  document.addEventListener('pointerdown', function (event) {
    var dialog = document.querySelector('.baby-create-dialog')
    if (!dialog) return
    var gender = dialog.querySelector('[data-baby-create-gender-select]')
    if (gender && event.target && !event.target.closest('[data-baby-create-gender-select]')) {
      var list = gender.querySelector('.custom-select-list')
      if (list) list.hidden = true
      gender.classList.remove('open')
    }
    var popover = document.querySelector('.baby-common-date-popover') || dialog.querySelector('.calendar-popover')
    if (!popover) return
    if (event.target && event.target.closest && event.target.closest('.calendar-popover, [data-baby-create-birth-trigger]')) return
    popover.remove()
  }, true)

  function ensureBabyMainActions() {
    if (getCleanText(document.querySelector('.topbar h1')).indexOf('\uC721\uC544') < 0) return
    if (document.querySelector('.baby-detail')) return
    var header = Array.from(document.querySelectorAll('.panel-header')).find(function (item) {
      return getCleanText(item.querySelector('h2')).indexOf('\uC721\uC544') >= 0
    })
    if (!header || header.querySelector('.baby-main-action-bar')) return
    var actions = document.createElement('div')
    actions.className = 'baby-main-action-bar'
    var createButton = document.createElement('button')
    createButton.type = 'button'
    createButton.textContent = '\uC544\uC774 \uCD94\uAC00'
    createButton.addEventListener('click', openBabyCreateDialog)
    actions.appendChild(createButton)
    header.appendChild(actions)
  }

  function ensureDiaryMainActions() {
    if (getCleanText(document.querySelector('.topbar h1')).indexOf('\uC77C\uAE30') < 0) return
    if (document.querySelector('.diary-detail-card')) return
    var header = Array.from(document.querySelectorAll('.panel-header')).find(function (item) {
      return getCleanText(item.querySelector('h2')) === '\uC77C\uAE30'
    }) || Array.from(document.querySelectorAll('.panel-header')).find(function (item) {
      var heading = getCleanText(item.querySelector('h2'))
      return heading.indexOf('\uC77C\uAE30') >= 0 && heading.indexOf('\uCD94\uAC00') < 0
    })
    if (!header || header.querySelector('.diary-main-action-bar')) return
    var actions = document.createElement('div')
    actions.className = 'diary-main-action-bar'
    var createButton = document.createElement('button')
    createButton.type = 'button'
    createButton.dataset.diaryOpenComposer = 'true'
    createButton.textContent = '\uC77C\uAE30 \uCD94\uAC00'
    createButton.addEventListener('click', function () {
      var form = ensureDiaryApiComposer()
      var target = form && (form.closest('form, .panel, aside') || form)
      if (!target) {
        showPatchToast('\uC77C\uAE30 \uC785\uB825 \uC601\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.')
        return
      }
      target.classList.add('diary-api-composer-open')
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      var input = target.querySelector('[data-field="diary-title"], input, textarea')
      if (input) window.setTimeout(function () { input.focus() }, 180)
    })
    actions.appendChild(createButton)
    header.appendChild(actions)
  }

  function ensureDiaryApiComposer() {
    if (getCleanText(document.querySelector('.topbar h1')).indexOf('\uC77C\uAE30') < 0) return null
    var entryForm = document.querySelector('.entry-panel .diary-form')
    if (entryForm && entryForm.getClientRects && entryForm.getClientRects().length) {
      document.querySelectorAll('.diary-api-composer').forEach(function (panel) {
        panel.remove()
      })
      return entryForm
    }
    var existing = document.querySelector('.diary-api-composer')
    if (existing) return existing
    var diaryPanel = Array.from(document.querySelectorAll('.panel, article, section')).find(function (item) {
      var heading = item.querySelector('h2')
      return heading && getCleanText(heading) === '\uC77C\uAE30'
    })
    var targetParent = diaryPanel && diaryPanel.parentElement
      ? diaryPanel.parentElement
      : (document.querySelector('.content-grid') || document.querySelector('main'))
    if (!targetParent) return null
    var panel = document.createElement('section')
    panel.className = 'panel wide full-span diary-api-composer diary-form'
    panel.innerHTML = [
      '<div class="panel-header"><div><h2>\uC77C\uAE30 \uCD94\uAC00</h2></div></div>',
      '<form class="ledger-form">',
      '<label><span>\uC81C\uBAA9</span><input data-diary-create-title maxlength="80" /></label>',
      '<label class="date-picker-field diary-create-date-field"><span>\uB0A0\uC9DC</span><input data-diary-create-date type="hidden" value="' + todayText() + '" /><button type="button" class="date-picker-trigger diary-create-date-button" data-diary-create-date-trigger><span>' + todayText().replace(/-/g, '.') + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2v4M16 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></label>',
      '<div class="form-row">',
      '<label><span>\uB0A0\uC528</span><input data-diary-create-weather maxlength="30" /></label>',
      '<label><span>\uAE30\uBD84</span><input data-diary-create-mood maxlength="30" /></label>',
      '</div>',
      '<label><span>\uB0B4\uC6A9</span><textarea data-diary-create-content rows="5"></textarea></label>',
      '<button class="submit-action" type="submit">\uC800\uC7A5</button>',
      '</form>'
    ].join('')
    bindDiaryCreateDate(panel)
    panel.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault()
      var title = getFieldValue(panel, '[data-diary-create-title]')
      var content = getFieldValue(panel, '[data-diary-create-content]')
      if (!title) {
        showPatchToast('\uC81C\uBAA9\uC740 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
        panel.querySelector('[data-diary-create-title]').focus()
        return
      }
      var button = panel.querySelector('.submit-action')
      button.disabled = true
      button.textContent = '\uC800\uC7A5 \uC911'
      getReadableFamilyId().then(function (familyId) {
        return postJson('/diaries?familyId=' + encodeURIComponent(familyId), {
          title: title,
          body: content,
          diaryDate: getFieldValue(panel, '[data-diary-create-date]') || todayText(),
          weather: getFieldValue(panel, '[data-diary-create-weather]') || null,
          mood: getFieldValue(panel, '[data-diary-create-mood]') || null,
          mediaUrls: []
        })
      }).then(function () {
        showPatchToast('\uC77C\uAE30\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
        panel.querySelector('form').reset()
        panel.querySelector('[data-diary-create-date]').value = todayText()
        var dateLabel = panel.querySelector('[data-diary-create-date-trigger] span')
        if (dateLabel) dateLabel.textContent = todayText().replace(/-/g, '.')
        button.disabled = false
        button.textContent = '\uC800\uC7A5'
        refreshServerDataViews(true)
      }).catch(function (error) {
        button.disabled = false
        button.textContent = '\uC800\uC7A5'
        showPatchToast(apiActionErrorMessage(error, '\uC77C\uAE30 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      })
    })
    if (diaryPanel && diaryPanel.nextSibling) targetParent.insertBefore(panel, diaryPanel.nextSibling)
    else targetParent.appendChild(panel)
    removeFeaturePlaceholders(panel)
    return panel
  }

  function bindDiaryCreateDate(panel) {
    var input = panel && panel.querySelector('[data-diary-create-date]')
    var trigger = panel && panel.querySelector('[data-diary-create-date-trigger]')
    if (!input || !trigger || trigger.dataset.diaryDateBound === 'true') return
    trigger.dataset.diaryDateBound = 'true'
    trigger.addEventListener('click', function () {
      openDiaryCreateDatePopover(input, trigger)
    })
  }

  function openDiaryCreateDatePopover(input, trigger) {
    var old = document.querySelector('.diary-api-composer .calendar-popover')
    if (old) old.remove()
    var selected = parseApiDate(input.value) || todayText()
    var view = new Date(selected + 'T00:00:00')
    var popover = document.createElement('div')
    popover.className = 'calendar-popover diary-create-calendar-popover'

    function draw() {
      var year = view.getFullYear()
      var month = view.getMonth()
      var first = new Date(year, month, 1)
      var last = new Date(year, month + 1, 0).getDate()
      var html = '<header class="calendar-header"><button type="button" data-diary-date-prev>&lt;</button><strong>' + year + '\uB144 ' + (month + 1) + '\uC6D4</strong><button type="button" data-diary-date-next>&gt;</button></header>'
      html += '<div class="calendar-today-row"><button type="button" data-diary-date-today>\uC624\uB298</button></div>'
      html += '<div class="calendar-weekdays"><span>\uC77C</span><span>\uC6D4</span><span>\uD654</span><span>\uC218</span><span>\uBAA9</span><span>\uAE08</span><span>\uD1A0</span></div><div class="calendar-day-grid">'
      for (var blank = 0; blank < first.getDay(); blank += 1) html += '<span class="calendar-empty"></span>'
      for (var day = 1; day <= last; day += 1) {
        var date = new Date(year, month, day)
        var iso = formatDate(date)
        var classes = []
        if (date.getDay() === 0) classes.push('holiday')
        if (date.getDay() === 6) classes.push('saturday')
        if (iso === selected) classes.push('selected')
        html += '<button type="button" class="' + classes.join(' ') + '" data-diary-date="' + iso + '">' + day + '</button>'
      }
      popover.innerHTML = html + '</div>'
    }

    draw()
    trigger.insertAdjacentElement('afterend', popover)
    popover.addEventListener('click', function (event) {
      var target = event.target
      if (!target || !target.closest) return
      if (target.closest('[data-diary-date-prev]')) {
        view.setMonth(view.getMonth() - 1)
        draw()
        return
      }
      if (target.closest('[data-diary-date-next]')) {
        view.setMonth(view.getMonth() + 1)
        draw()
        return
      }
      if (target.closest('[data-diary-date-today]')) selected = todayText()
      var dayButton = target.closest('[data-diary-date]')
      if (dayButton) selected = dayButton.dataset.diaryDate
      if (target.closest('[data-diary-date-today]') || dayButton) {
        setInputValue(input, selected)
        var label = trigger.querySelector('span')
        if (label) label.textContent = selected.replace(/-/g, '.')
        popover.remove()
      }
    })
  }

  function getControlValueByLabel(root, labelText) {
    var labels = Array.from(root.querySelectorAll('label'))
    var target = labels.find(function (item) {
      return getCleanText(item.querySelector('span')) === labelText
    })
    if (!target) return ''
    var control = target.querySelector('input, textarea, .custom-select-trigger, .date-picker-trigger, button')
    return control ? getCleanText(control) || String(control.value || '').trim() : ''
  }

  function submitExistingDiaryPanel(panel, submitButton) {
    if (!panel || panel.dataset.diaryPanelSubmitting === 'true') return
    var title = getInputValueByLabel(panel, '\uC81C\uBAA9') || getFieldValue(panel, 'form.diary-form input') || getFieldValue(panel, 'input')
    var body = getInputValueByLabel(panel, '\uB0B4\uC6A9') || getFieldValue(panel, 'form.diary-form textarea') || getFieldValue(panel, 'textarea')
    if (!title) {
      showPatchToast('\uC81C\uBAA9\uC740 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
      var titleField = panel.querySelector('label input, input')
      if (titleField) titleField.focus()
      return
    }
    panel.dataset.diaryPanelSubmitting = 'true'
    if (submitButton) submitButton.disabled = true
    getReadableFamilyId().then(function (familyId) {
      return postJson('/diaries?familyId=' + encodeURIComponent(familyId), {
        title: title,
        body: body,
        diaryDate: getDatePickerValue(panel, '\uB0A0\uC9DC') || todayText(),
        weather: getControlValueByLabel(panel, '\uB0A0\uC528') || null,
        mood: getControlValueByLabel(panel, '\uAE30\uBD84') || null,
        minTemperature: optionalInteger(getInputValueByLabel(panel, '\uCD5C\uC800 \uC628\uB3C4')),
        maxTemperature: optionalInteger(getInputValueByLabel(panel, '\uCD5C\uACE0 \uC628\uB3C4')),
        mediaUrls: []
      })
    }).then(function () {
      showPatchToast('\uC77C\uAE30\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
      panel.querySelectorAll('input, textarea').forEach(function (field) {
        if (field.type !== 'hidden') setNativeInputValue(field, '')
      })
      renderDiaryPageFromApi(true)
      refreshServerDataViews(true)
    }).catch(function (error) {
      showPatchToast(apiActionErrorMessage(error, '\uC77C\uAE30 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
    }).finally(function () {
      delete panel.dataset.diaryPanelSubmitting
      if (submitButton) submitButton.disabled = false
    })
  }

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

  var communityState = {
    activeTab: 'notice',
    view: 'list',
    selectedPostId: null,
    composing: false,
    editingPostId: null,
    loadingTabs: {},
    loadedTabs: {},
    best: { daily: [], weekly: [], monthly: [] },
    bestLoading: false,
    bestLoadedAt: 0,
    notice: [],
    free: [],
    inquiry: []
  }

  function isAdminRole() {
    if (readStoredAuthUser()) return true
    var role = getCleanText(document.querySelector('.user-chip strong'))
    return role.indexOf('\uAD00\uB9AC\uC790') >= 0 || role.indexOf('admin') >= 0
  }

  function ensureCommunityMenu() {
    var navList = document.querySelector('.nav-list')
    if (!navList) return
    if (document.querySelector('.auth-card')) return

    if (document.documentElement.dataset.patchPage !== 'community') {
      var staleContent = document.querySelector('.content-grid.community-grid')
      if (staleContent) {
        staleContent.classList.remove('community-grid')
        staleContent.classList.remove('community-source-hidden')
        delete staleContent.dataset.communityReady
      }
      var staleRoot = document.querySelector('.patch-community-root')
      if (staleRoot) staleRoot.remove()
    }

    var existing = document.querySelector('.community-nav-item') || findNavButtonContains('\uCEE4\uBBA4\uB2C8\uD2F0')
    if (!isAdminRole()) {
      if (existing) existing.remove()
      if (document.documentElement.dataset.patchPage === 'community') {
        delete document.documentElement.dataset.patchPage
      }
      return
    }

    if (!existing) {
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'nav-item community-nav-item'
      button.innerHTML = '<span class="community-nav-icon" aria-hidden="true"></span><span>\uCEE4\uBBA4\uB2C8\uD2F0</span>'
      var anchor = findNavButton('\uAD00\uB9AC\uC790') || findNavButton('\uB9DB\uC9D1')
      if (anchor && anchor.parentElement === navList) {
        navList.insertBefore(button, anchor)
      } else {
        navList.appendChild(button)
      }
      existing = button
    } else {
      existing.classList.add('community-nav-item')
    }

    var icon = existing.querySelector('.community-nav-icon')
    if (icon) {
      icon.setAttribute('aria-hidden', 'true')
      icon.textContent = ''
    }

    if (!existing.dataset.communityWired) {
      existing.dataset.communityWired = 'true'
      var communityHandler = function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation) event.stopImmediatePropagation()
        queueOpenCommunityPage(true)
      }
      existing.addEventListener('click', communityHandler, true)
      existing.onclick = communityHandler
    }

    if (document.documentElement.dataset.patchPage === 'community') {
      existing.classList.add('active')
      renderCommunityPage(false)
    }
  }

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!nav || isCommunityNavItem(nav) || isFamilyGroupNavItem(nav)) return
    var wasCommunity = document.documentElement.dataset.patchPage === 'community'
    var wasFamilyGroup = document.documentElement.dataset.patchPage === 'family-group'
    if (wasCommunity || wasFamilyGroup) {
      var label = getCleanText(nav)
      clearCustomPatchPageNow()
      ;[450, 1100, 1800].forEach(function (delay) {
        window.setTimeout(function () {
          cleanupPatchRootsForCurrentMenu()
          if (!label || document.querySelector('.auth-card')) return
          if (document.documentElement.dataset.patchPage) return
          var currentTitle = getCleanText(document.querySelector('.topbar h1, h1'))
          if (currentTitle === label) return
          var target = findNavButton(label)
          if (target) triggerNavButton(target)
        }, delay)
      })
      window.setTimeout(function () {
        if (!label || document.querySelector('.auth-card')) return
        if (document.documentElement.dataset.patchPage) return
        var currentTitle = getCleanText(document.querySelector('.topbar h1, h1'))
        if (currentTitle === label) return
        if (label === '\uC721\uC544') {
          openRecoveredBabyPage()
          return
        }
        try {
          var reloadState = JSON.parse(sessionStorage.getItem('family-platform-nav-reload-state') || '{}')
          if (reloadState.label === label && Date.now() - Number(reloadState.at || 0) < 10000) return
          sessionStorage.setItem('family-platform-nav-reload-state', JSON.stringify({ label: label, at: Date.now() }))
        } catch {}
        setPendingNavLabel(label)
        try {
          var url = new URL(window.location.href)
          url.searchParams.set('recoverNav', label)
          url.searchParams.set('navRecoverAt', String(Date.now()))
          window.location.replace(url.toString())
        } catch {
          window.location.reload()
        }
      }, 2200)
    }
  }, true)

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!isRestaurantNavItem(nav)) return
    clearCustomPatchPageNow()
    window.setTimeout(function () {
      cleanupPatchRootsForCurrentMenu()
      renderRestaurantPageFromApi()
      syncRestaurantMenuState()
    }, 0)
    window.setTimeout(function () {
      cleanupPatchRootsForCurrentMenu()
      renderRestaurantPageFromApi()
      syncRestaurantMenuState()
    }, 350)
    window.setTimeout(function () {
      cleanupPatchRootsForCurrentMenu()
      renderRestaurantPageFromApi()
      syncRestaurantMenuState()
    }, 900)
  }, true)

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!isLedgerNavItem(nav)) return
    ;[0, 350, 900, 1600].forEach(function (delay) {
      window.setTimeout(function () {
        renderLedgerPageFromApi(true)
      }, delay)
    })
  }, true)

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!isCommunityNavItem(nav)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    clearFamilyGroupPage()
    queueOpenCommunityPage(true)
  }, true)

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest && event.target.closest('button,a,[role="button"],.nav-item')
    if (!target || target.closest('.auth-card')) return
    if (getCleanText(target) !== '\uCEE4\uBBA4\uB2C8\uD2F0') return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    clearFamilyGroupPage()
    queueOpenCommunityPage(true)
  }, true)

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!isFamilyGroupNavItem(nav)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    queueOpenFamilyGroupPage()
  }, true)

  function openCommunityPage(force) {
    pausePatchObserver()
    try {
      document.documentElement.dataset.patchPage = 'community'
      document.querySelectorAll('.nav-item.active').forEach(function (item) {
        item.classList.remove('active')
      })
      var nav = findNavButtonContains('\uCEE4\uBBA4\uB2C8\uD2F0')
      if (!nav) nav = document.querySelector('.community-nav-item')
      if (nav) nav.classList.add('active')
      renderCommunityPage(force)
    } finally {
      resumePatchObserver()
    }
  }

  function communityTabLabel(tab) {
    if (tab === 'free') return '\uC790\uC720\uAC8C\uC2DC\uD310'
    if (tab === 'inquiry') return '\uBB38\uC758\uC0AC\uD56D'
    return '\uACF5\uC9C0\uC0AC\uD56D'
  }

  function communityItems(tab) {
    return communityState[tab] || communityState.notice
  }

  function formatCommunityInstant(value) {
    if (!value) return { date: '', time: '' }
    var date = new Date(value)
    if (Number.isNaN(date.getTime())) return { date: String(value).slice(0, 10), time: '' }
    return {
      date: formatDisplayDate(date),
      time: String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
    }
  }

  function communityFileFromUrl(url) {
    var name = String(url || '').split('/').pop() || '\uCCA8\uBD80\uD30C\uC77C'
    return { name: name, size: '', url: url, contentType: '' }
  }

  function communityMediaUrls(files) {
    return (files || []).map(function (file) { return file.url || '' }).filter(Boolean)
  }

  function normalizeCommunityComment(item) {
    var when = formatCommunityInstant(item.createdAt || item.updatedAt)
    return {
      id: String(item.id),
      serverId: item.id,
      author: item.authorName || '\uC0AC\uC6A9\uC790',
      time: (when.date && when.time) ? (when.date + ' ' + when.time) : communityNowText(),
      text: item.body || ''
    }
  }

  function normalizeCommunityPost(item, detailComments) {
    var when = formatCommunityInstant(item.createdAt || item.updatedAt)
    return {
      id: String(item.id),
      serverId: item.id,
      title: item.title || '',
      body: item.body || '',
      author: item.authorName || '\uC0AC\uC6A9\uC790',
      date: when.date,
      time: when.time,
      files: (item.mediaUrls || []).map(communityFileFromUrl),
      views: Number(item.viewCount || item.views || 0),
      periodViews: Number(item.periodViewCount || item.periodViews || 0),
      comments: (detailComments || []).map(normalizeCommunityComment)
    }
  }

  function replaceCommunityPost(tab, post) {
    var list = communityItems(tab)
    var index = list.findIndex(function (item) { return item.id === post.id || item.serverId === post.serverId })
    if (index >= 0) list[index] = post
    else list.unshift(post)
  }

  function loadCommunityList(tab, force) {
    if (!getStoredAuthToken()) return Promise.resolve([])
    if (!force && communityState.loadedTabs[tab]) return Promise.resolve(communityItems(tab))
    if (communityState.loadingTabs[tab]) return communityState.loadingTabs[tab]
    var path = '/community/posts?boardType=' + encodeURIComponent(tab)
    communityState.loadingTabs[tab] = apiRequest(path).then(function (items) {
      communityState[tab] = (Array.isArray(items) ? items : []).map(function (item) {
        return normalizeCommunityPost(item, [])
      })
      communityState.loadedTabs[tab] = true
      return communityState[tab]
    }).catch(function () {
      return communityItems(tab)
    }).finally(function () {
      delete communityState.loadingTabs[tab]
    })
    return communityState.loadingTabs[tab]
  }

  function loadCommunityDetail(tab, postId) {
    var post = findCommunityPost(tab, postId)
    if (!post || !post.serverId) return Promise.resolve(post)
    return apiRequest('/community/posts/' + encodeURIComponent(post.serverId)).then(function (detail) {
      var next = normalizeCommunityPost(detail.post || {}, detail.comments || [])
      replaceCommunityPost(tab, next)
      if (tab === 'free') loadCommunityBestPosts(true)
      return next
    }).catch(function () {
      return post
    })
  }

  function loadCommunityBestPosts(force) {
    if (!getStoredAuthToken()) return Promise.resolve(communityState.best)
    if (communityState.bestLoading) return Promise.resolve(communityState.best)
    if (!force && communityState.bestLoadedAt && Date.now() - communityState.bestLoadedAt < 30000) {
      return Promise.resolve(communityState.best)
    }
    communityState.bestLoading = true
    var periods = ['daily', 'weekly', 'monthly']
    return Promise.all(periods.map(function (period) {
      return apiRequest('/community/posts/best?boardType=free&period=' + period).then(function (items) {
        return (Array.isArray(items) ? items : []).map(function (item) {
          return normalizeCommunityPost(item, [])
        })
      }).catch(function () {
        return []
      })
    })).then(function (results) {
      communityState.best = {
        daily: results[0],
        weekly: results[1],
        monthly: results[2]
      }
      communityState.bestLoadedAt = Date.now()
      if (document.documentElement.dataset.patchPage === 'community' && communityState.activeTab === 'free' && communityState.view === 'list') {
        renderCommunityPage(true)
      }
      return communityState.best
    }).finally(function () {
      communityState.bestLoading = false
    })
  }

  function communityPostPayload(tab, title, body, files) {
    return getCurrentFamilyId().catch(function () {
      return null
    }).then(function (familyId) {
      return {
        boardType: tab,
        familyId: tab === 'inquiry' ? familyId : null,
        title: title,
        body: body,
        mediaUrls: communityMediaUrls(files)
      }
    })
  }

  function communityNowText() {
    var now = new Date()
    return formatDisplayDate(now) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  }

  function formatMediaBytes(bytes) {
    if (!bytes) return '0MB'
    return (bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + 'MB'
  }

  function mediaLimitText() {
    return '\uC0AC\uC9C4 ' + formatMediaBytes(MEDIA_MAX_IMAGE_BYTES) + ', \uC601\uC0C1 ' + formatMediaBytes(MEDIA_MAX_VIDEO_BYTES) +
      ', \uCD5C\uB300 ' + MEDIA_MAX_FILES + '\uAC1C, \uD569\uACC4 ' + formatMediaBytes(MEDIA_MAX_TOTAL_BYTES) + '\uAE4C\uC9C0'
  }

  function validateMediaFiles(input) {
    if (!input || !input.files || !input.files.length) return true
    var files = Array.from(input.files)
    var total = files.reduce(function (sum, file) { return sum + (file.size || 0) }, 0)
    var invalid = files.find(function (file) {
      if ((file.type || '').indexOf('video/') === 0) return file.size > MEDIA_MAX_VIDEO_BYTES
      return file.size > MEDIA_MAX_IMAGE_BYTES
    })
    if (files.length > MEDIA_MAX_FILES) {
      input.value = ''
      showPatchToast('\uCCA8\uBD80\uD30C\uC77C\uC740 \uD55C \uBC88\uC5D0 ' + MEDIA_MAX_FILES + '\uAC1C\uAE4C\uC9C0\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4.')
      return false
    }
    if (invalid) {
      input.value = ''
      showPatchToast('\uD30C\uC77C \uC6A9\uB7C9\uC774 \uD07D\uB2C8\uB2E4. ' + mediaLimitText() + '\uB85C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.')
      return false
    }
    if (total > MEDIA_MAX_TOTAL_BYTES) {
      input.value = ''
      showPatchToast('\uCCA8\uBD80 \uD569\uACC4 \uC6A9\uB7C9\uC774 \uD07D\uB2C8\uB2E4. \uD569\uACC4 ' + formatMediaBytes(MEDIA_MAX_TOTAL_BYTES) + '\uAE4C\uC9C0\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4.')
      return false
    }
    return true
  }

  function enhanceMediaUploadLimits() {
    document.querySelectorAll('input[type="file"]').forEach(function (input) {
      if (input.dataset.mediaLimitReady) return
      input.dataset.mediaLimitReady = 'true'
      input.addEventListener('change', function () {
        validateMediaFiles(input)
      }, true)
    })
    document.querySelectorAll('.community-file-field small, .media-edit-helper').forEach(function (hint) {
      if (hint.dataset.mediaPolicyHint) return
      hint.dataset.mediaPolicyHint = 'true'
      hint.title = mediaLimitText()
    })
  }

  function findCommunityPost(tab, id) {
    return communityItems(tab).find(function (item) {
      return item.id === id
    }) || null
  }

  function getCommunityFileNames(input) {
    if (!input || !input.files || !input.files.length) return []
    if (!validateMediaFiles(input)) return []
    return Array.from(input.files).map(function (file) {
      return { name: file.name, size: formatMediaBytes(file.size || 0), contentType: file.type || '' }
    })
  }

  function uploadMediaFile(file, familyId) {
    var token = getStoredAuthToken()
    if (!token) return Promise.reject(new Error('LOGIN_REQUIRED'))

    var formData = new FormData()
    formData.append('file', file)
    if (familyId) formData.append('familyId', String(familyId))

    return fetch(API_BASE_URL + '/media', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: formData
    }).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (message) {
          throw new Error(message || ('API ' + response.status))
        })
      }
      return response.json()
    }).then(function (item) {
      return {
        name: item.originalFileName || file.name,
        size: formatMediaBytes(item.size || file.size || 0),
        url: item.url || '',
        contentType: item.contentType || file.type || ''
      }
    })
  }

  function uploadMediaFiles(input) {
    if (!input || !input.files || !input.files.length) return Promise.resolve([])
    if (!validateMediaFiles(input)) return Promise.reject(new Error('INVALID_MEDIA'))
    var files = Array.from(input.files)
    return getCurrentFamilyId().catch(function () {
      return null
    }).then(function (familyId) {
      return Promise.all(files.map(function (file) {
        return uploadMediaFile(file, familyId)
      }))
    })
  }

  function uploadCommunityFiles(input) {
    return uploadMediaFiles(input)
  }

  function setCommunityFormBusy(form, busy) {
    if (!form) return
    form.querySelectorAll('button, input, textarea').forEach(function (field) {
      field.disabled = !!busy
    })
    var submit = form.querySelector('button[type="submit"]')
    if (submit) {
      if (!submit.dataset.originalText) submit.dataset.originalText = submit.textContent
      submit.textContent = busy ? '\uC5C5\uB85C\uB4DC \uC911' : submit.dataset.originalText
    }
  }

  function showPatchConfirm(message, onConfirm) {
    var old = document.querySelector('.patch-confirm-backdrop')
    if (old) old.remove()
    var backdrop = document.createElement('div')
    backdrop.className = 'patch-confirm-backdrop'
    backdrop.innerHTML = [
      '<section class="patch-confirm-dialog">',
      '<h2>\uD655\uC778</h2>',
      '<p>' + escapeHtml(message) + '</p>',
      '<div><button type="button" class="cancel-button" data-patch-confirm-cancel>\uCDE8\uC18C</button><button type="button" data-patch-confirm-ok>\uD655\uC778</button></div>',
      '</section>'
    ].join('')
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop || event.target.closest('[data-patch-confirm-cancel]')) backdrop.remove()
      if (event.target.closest('[data-patch-confirm-ok]')) {
        backdrop.remove()
        onConfirm()
      }
    })
    document.body.appendChild(backdrop)
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
    })
  }

  function renderCommunityPage(force) {
    if (document.documentElement.dataset.patchPage !== 'community') return
    var workspace = document.querySelector('.workspace')
    var content = document.querySelector('.content-grid')
    if (!workspace) return
    if (!content) {
      content = document.createElement('div')
      content.className = 'content-grid community-source-hidden'
      workspace.appendChild(content)
    }

    var eyebrow = document.querySelector('.topbar .eyebrow')
    var title = document.querySelector('.topbar h1')
    if (eyebrow) eyebrow.textContent = '\uACF5\uC9C0, \uC790\uC720\uAC8C\uC2DC\uD310, \uBB38\uC758'
    if (title) title.textContent = '\uCEE4\uBBA4\uB2C8\uD2F0'

    var root = document.querySelector('.patch-community-root')
    if (!root) {
      root = document.createElement('div')
      root.className = 'patch-community-root community-grid'
      content.insertAdjacentElement('afterend', root)
    }

    content.classList.add('community-source-hidden')
    if (!force && root.dataset.communityReady === communityState.activeTab) return
    root.dataset.communityReady = communityState.activeTab

    var tab = communityState.activeTab
    var admin = isAdminRole()
    var bodyHtml = renderCommunityBoard(tab, admin)
    root.innerHTML = [
      '<section class="panel wide community-panel">',
      '<div class="community-hero">',
      '<div><span>Community</span><h2>\uAC00\uC871\uC744 \uB118\uC5B4 \uD568\uAED8 \uB098\uB204\uB294 \uACF5\uAC04</h2><p>\uC790\uC720\uAC8C\uC2DC\uD310\uC740 \uC804\uCCB4 \uC0AC\uC6A9\uC790\uC640 \uACF5\uC720\uD558\uACE0, \uACF5\uC9C0\uC0AC\uD56D\uACFC \uBB38\uC758\uC0AC\uD56D\uC740 \uAD00\uB9AC\uC790 \uAD8C\uD55C\uC73C\uB85C \uC791\uC131\uD569\uB2C8\uB2E4.</p></div>',
      '<strong>\uBA54\uB274 \uB178\uCD9C\uAD8C\uD55C<br><b>\uAD00\uB9AC\uC790</b></strong>',
      '</div>',
      '<div class="community-tabs">',
      ['notice', 'free', 'inquiry'].map(function (key) {
        return '<button type="button" class="' + (tab === key ? 'active' : '') + '" data-community-tab="' + key + '">' + communityTabLabel(key) + '</button>'
      }).join(''),
      '</div>',
      bodyHtml,
      '</section>'
    ].join('')

    wireCommunityPage()
    if (tab === 'free' && communityState.view === 'list') loadCommunityBestPosts(false)
  }

  function renderCommunityComposer(tab, admin) {
    var adminOnly = tab !== 'free'
    if (adminOnly && !admin) {
      return '<div class="community-locked">\uAD00\uB9AC\uC790\uB9CC \uC791\uC131\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</div>'
    }
    var label = adminOnly ? '\uAD00\uB9AC\uC790 \uC791\uC131' : '\uC0C8 \uAE00 \uC791\uC131'
    return [
      '<form class="community-composer" data-community-compose="' + tab + '">',
      '<div class="community-composer-title"><strong>' + label + '</strong><span>' + (adminOnly ? '\uAD00\uB9AC\uC790 \uAD8C\uD55C' : '\uC804\uCCB4 \uACF5\uAC1C') + '</span></div>',
      '<input name="title" />',
      '<textarea name="body" rows="3"></textarea>',
      '<button type="submit">\uB4F1\uB85D</button>',
      '</form>'
    ].join('')
  }

  function renderCommunityFreeBoard() {
    if (communityState.view === 'detail' && communityState.selectedPostId) {
      return renderCommunityFreeDetail()
    }
    return [
      '<div class="community-board-toolbar">',
      '<div><strong>\uC790\uC720\uAC8C\uC2DC\uD310</strong></div>',
      '<button type="button" data-community-compose-toggle>' + (communityState.composing ? '\uC791\uC131 \uB2EB\uAE30' : '\uAE00\uC4F0\uAE30') + '</button>',
      '</div>',
      communityState.composing ? renderCommunityFreeEditor(null) : '',
      '<div class="community-free-list">',
      communityItems('free').map(function (post) {
        return [
          '<button type="button" class="community-free-row" data-community-open-post="' + escapeHtml(post.id) + '">',
          '<strong>' + escapeHtml(post.title) + '</strong>',
          '<span>' + escapeHtml(post.author) + ' · ' + escapeHtml(post.date || '') + ' ' + escapeHtml(post.time || '') + ' · \uB313\uAE00 ' + ((post.comments || []).length) + '</span>',
          '</button>'
        ].join('')
      }).join(''),
      '</div>'
    ].join('')
  }

  function renderCommunityFreeEditor(post) {
    var editing = !!post
    return [
      '<form class="community-composer community-free-editor" data-community-compose="free" data-edit-post="' + (editing ? escapeHtml(post.id) : '') + '">',
      '<div class="community-composer-title"><strong>' + (editing ? '\uAE00 \uC218\uC815' : '\uC0C8 \uAE00 \uC791\uC131') + '</strong><span>\uC0AC\uC9C4 \uCCA8\uBD80 \uAC00\uB2A5</span></div>',
      '<input name="title" value="' + escapeHtml(post ? post.title : '') + '" />',
      '<textarea name="body" rows="5">' + escapeHtml(post ? post.body : '') + '</textarea>',
      '<label class="community-file-field"><span>\uC0AC\uC9C4/\uC601\uC0C1 \uCCA8\uBD80</span><input name="files" type="file" accept="image/*,video/*" multiple /><small>' + ((post && post.files && post.files.length) ? post.files.map(function (file) { return escapeHtml(file.name) }).join(', ') : mediaLimitText()) + '</small></label>',
      '<div class="community-editor-actions"><button type="button" class="cancel-button" data-community-cancel-edit>\uCDE8\uC18C</button><button type="submit">' + (editing ? '\uC800\uC7A5' : '\uB4F1\uB85D') + '</button></div>',
      '</form>'
    ].join('')
  }

  function renderCommunityFreeDetail() {
    var post = findCommunityPost('free', communityState.selectedPostId)
    if (!post) {
      communityState.view = 'list'
      communityState.selectedPostId = null
      return renderCommunityFreeBoard()
    }
    return [
      '<div class="community-detail">',
      '<div class="community-detail-top"><button type="button" data-community-back-list>\uBAA9\uB85D</button><div><button type="button" data-community-edit-post="' + escapeHtml(post.id) + '">\uC218\uC815</button><button type="button" class="danger-button" data-community-delete-post="' + escapeHtml(post.id) + '">\uC0AD\uC81C</button></div></div>',
      communityState.editingPostId === post.id ? renderCommunityFreeEditor(post) : [
        '<article class="community-detail-article">',
        '<h3>' + escapeHtml(post.title) + '</h3>',
        '<span>' + escapeHtml(post.author) + ' · ' + escapeHtml(post.date || '') + ' ' + escapeHtml(post.time || '') + '</span>',
        '<p>' + escapeHtml(post.body) + '</p>',
        renderCommunityFiles(post.files || []),
        '</article>'
      ].join(''),
      '<section class="community-detail-comments"><strong>\uB313\uAE00 ' + ((post.comments || []).length) + '</strong>',
      renderCommunityComments(post),
      '</section>',
      '</div>'
    ].join('')
  }

  function renderCommunityFiles(files) {
    if (!files || !files.length) return ''
    return '<div class="community-files">' + files.map(function (file) {
      return '<a href="#" download="' + escapeHtml(file.name) + '" data-community-download="' + escapeHtml(file.name) + '"><span>' + escapeHtml(file.name) + '</span><small>' + escapeHtml(file.size || '') + ' · \uB2E4\uC6B4\uB85C\uB4DC</small></a>'
    }).join('') + '</div>'
  }

  function renderCommunityPosts(tab) {
    return communityItems(tab).map(function (post) {
      var comments = post.comments || []
      return [
        '<article class="community-post" data-post-id="' + escapeHtml(post.id) + '">',
        '<div class="community-post-head"><div><span>' + communityTabLabel(tab) + '</span><h3>' + escapeHtml(post.title) + '</h3></div><small>' + escapeHtml(post.date) + '</small></div>',
        '<p>' + escapeHtml(post.body) + '</p>',
        '<div class="community-post-meta"><span>' + escapeHtml(post.author) + '</span><span>' + (tab === 'free' ? '\uC804\uCCB4 \uACF5\uAC1C' : '\uAD00\uB9AC\uC790') + '</span><span>\uB313\uAE00 ' + comments.length + '</span></div>',
        tab === 'free' ? renderCommunityComments(post) : '',
        '</article>'
      ].join('')
    }).join('')
  }

  function renderCommunityComments(post) {
    var comments = post.comments || []
    return [
      '<div class="community-comments">',
      comments.map(function (comment) {
        return '<div class="community-comment" data-comment-id="' + escapeHtml(comment.id || '') + '"><div><strong>' + escapeHtml(comment.author) + '</strong><small>' + escapeHtml(comment.time || '') + '</small></div><span>' + escapeHtml(comment.text) + '</span><div class="community-comment-actions"><button type="button" data-edit-comment="' + escapeHtml(comment.id || '') + '">\uC218\uC815</button><button type="button" data-delete-comment="' + escapeHtml(comment.id || '') + '">\uC0AD\uC81C</button></div></div>'
      }).join(''),
      '<form class="community-comment-form" data-comment-post="' + escapeHtml(post.id) + '">',
      '<input name="comment" />',
      '<button type="submit">\uB4F1\uB85D</button>',
      '</form>',
      '</div>'
    ].join('')
  }

  function renderCommunityThumb(post) {
    var hasFile = post.files && post.files.length
    var first = hasFile ? post.files[0] : null
    var isVideo = first && String(first.contentType || first.name || '').toLowerCase().indexOf('video') >= 0
    return '<span class="community-list-thumb ' + (hasFile ? 'has-file' : '') + '">' + (hasFile ? (isVideo ? '\uC601\uC0C1' : '\uC0AC\uC9C4') : '') + '</span>'
  }

  function renderCommunityFiles(files) {
    if (!files || !files.length) return ''
    return '<div class="community-files">' + files.map(function (file) {
      var url = file.url || '#'
      return '<a href="' + escapeHtml(url) + '" download="' + escapeHtml(file.name) + '" data-community-download="' + escapeHtml(file.name) + '"><span>' + escapeHtml(file.name) + '</span><small>' + escapeHtml(file.size || '') + ' · \uB2E4\uC6B4\uB85C\uB4DC</small></a>'
    }).join('') + '</div>'
  }

  function formatCommunityNumber(value) {
    return String(Number(value || 0).toLocaleString('ko-KR'))
  }

  function renderCommunityBestPanel() {
    var labels = {
      daily: '\uC77C\uC77C\uBCA0\uC2A4\uD2B8',
      weekly: '\uC8FC\uAC04\uBCA0\uC2A4\uD2B8',
      monthly: '\uC6D4\uAC04\uBCA0\uC2A4\uD2B8'
    }
    return '<div class="community-best-grid">' + ['daily', 'weekly', 'monthly'].map(function (period) {
      var rows = communityState.best[period] || []
      return [
        '<section class="community-best-card">',
        '<div class="community-best-head"><strong>' + labels[period] + '</strong><span>TOP 10</span></div>',
        '<div class="community-best-list">',
        rows.length ? rows.map(function (post, index) {
          return [
            '<button type="button" class="community-best-row" data-community-open-post="' + escapeHtml(post.id) + '">',
            '<b>' + (index + 1) + '</b>',
            '<span>' + escapeHtml(post.title) + '</span>',
            '<small>\uC870\uD68C ' + formatCommunityNumber(post.periodViews || post.views || 0) + '</small>',
            '</button>'
          ].join('')
        }).join('') : '<p>\uC544\uC9C1 \uC870\uD68C \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>',
        '</div>',
        '</section>'
      ].join('')
    }).join('') + '</div>'
  }

  function renderCommunityBoard(tab, admin) {
    if (tab !== 'free' && !admin) return '<div class="community-locked">\uAD00\uB9AC\uC790\uB9CC \uC791\uC131\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</div>'
    if (communityState.view === 'detail' && communityState.selectedPostId) return renderCommunityDetail(tab)
    return [
      '<div class="community-board-toolbar">',
      '<div><strong>' + communityTabLabel(tab) + '</strong></div>',
      '<button type="button" data-community-compose-toggle>' + (communityState.composing ? '\uC791\uC131 \uB2EB\uAE30' : '\uAE00\uC4F0\uAE30') + '</button>',
      '</div>',
      communityState.composing ? renderCommunityEditor(tab, null) : '',
      tab === 'free' ? renderCommunityBestPanel() : '',
      '<div class="community-free-list">',
      communityItems(tab).length ? communityItems(tab).map(function (post) {
        var meta = [
          post.author || '-',
          [post.date || '', post.time || ''].filter(Boolean).join(' '),
          '\uC870\uD68C ' + formatCommunityNumber(post.views || 0),
          '\uB313\uAE00 ' + ((post.comments || []).length)
        ].filter(Boolean).join(' / ')
        return [
          '<button type="button" class="community-free-row" data-community-open-post="' + escapeHtml(post.id) + '">',
          renderCommunityThumb(post),
          '<div class="community-row-title"><strong>' + escapeHtml(post.title) + '</strong></div>',
          '<span class="community-row-meta">' + escapeHtml(meta) + '</span>',
          '</button>'
        ].join('')
      }).join('') : '<div class="api-empty-row"><strong>\uB4F1\uB85D\uB41C \uAE00\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</strong></div>',
      '</div>'
    ].join('')
  }

  function renderCommunityEditor(tab, post) {
    var editing = !!post
    return [
      '<form class="community-composer community-free-editor" data-community-compose="' + tab + '" data-edit-post="' + (editing ? escapeHtml(post.id) : '') + '">',
      '<div class="community-composer-title"><strong>' + (editing ? '\uAE00 \uC218\uC815' : '\uC0C8 \uAE00 \uC791\uC131') + '</strong><span>\uC0AC\uC9C4 \uCCA8\uBD80 \uAC00\uB2A5</span></div>',
      '<input name="title" value="' + escapeHtml(post ? post.title : '') + '" />',
      '<textarea name="body" rows="5">' + escapeHtml(post ? post.body : '') + '</textarea>',
      '<label class="community-file-field"><span>\uC0AC\uC9C4/\uC601\uC0C1 \uCCA8\uBD80</span><b>\uD30C\uC77C \uC120\uD0DD</b><input name="files" type="file" accept="image/*,video/*" multiple /><small>' + ((post && post.files && post.files.length) ? post.files.map(function (file) { return escapeHtml(file.name) }).join(', ') : mediaLimitText()) + '</small></label>',
      '<div class="community-editor-actions"><button type="button" class="cancel-button" data-community-cancel-edit>\uCDE8\uC18C</button><button type="submit">' + (editing ? '\uC800\uC7A5' : '\uB4F1\uB85D') + '</button></div>',
      '</form>'
    ].join('')
  }

  function renderCommunityFreeEditor(post) {
    return renderCommunityEditor('free', post)
  }

  function renderCommunityFreeBoard() {
    return renderCommunityBoard('free', true)
  }

  function renderCommunityDetail(tab) {
    var post = findCommunityPost(tab, communityState.selectedPostId)
    if (!post) {
      communityState.view = 'list'
      communityState.selectedPostId = null
      return renderCommunityBoard(tab, true)
    }
    return [
      '<div class="community-detail">',
      '<div class="community-detail-top"><button type="button" data-community-back-list>\uBAA9\uB85D</button><div><button type="button" data-community-edit-post="' + escapeHtml(post.id) + '">\uC218\uC815</button><button type="button" class="danger-button" data-community-delete-post="' + escapeHtml(post.id) + '">\uC0AD\uC81C</button></div></div>',
      communityState.editingPostId === post.id ? renderCommunityEditor(tab, post) : [
        '<article class="community-detail-article">',
        '<h3>' + escapeHtml(post.title) + '</h3>',
        '<span>' + escapeHtml(post.author) + ' / ' + escapeHtml(post.date || '') + ' ' + escapeHtml(post.time || '') + ' / \uC870\uD68C ' + formatCommunityNumber(post.views || 0) + '</span>',
        '<p>' + escapeHtml(post.body) + '</p>',
        renderCommunityFiles(post.files || []),
        '</article>'
      ].join(''),
      '<section class="community-detail-comments"><strong>\uB313\uAE00 ' + ((post.comments || []).length) + '</strong>',
      renderCommunityComments(post),
      '</section>',
      '</div>'
    ].join('')
  }

  function renderCommunityFreeDetail() {
    return renderCommunityDetail('free')
  }

  function wireCommunityPage() {
    document.querySelectorAll('[data-community-tab]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        communityState.activeTab = button.dataset.communityTab || 'notice'
        communityState.view = 'list'
        communityState.selectedPostId = null
        communityState.composing = false
        communityState.editingPostId = null
        renderCommunityPage(true)
      })
    })

    document.querySelectorAll('[data-community-compose-toggle]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        communityState.composing = !communityState.composing
        communityState.editingPostId = null
        renderCommunityPage(true)
      })
    })

    document.querySelectorAll('[data-community-open-post]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        var tab = communityState.activeTab || 'free'
        communityState.view = 'detail'
        communityState.selectedPostId = button.dataset.communityOpenPost
        communityState.composing = false
        communityState.editingPostId = null
        renderCommunityPage(true)
        loadCommunityDetail(tab, communityState.selectedPostId).then(function () {
          if (communityState.view === 'detail') renderCommunityPage(true)
        })
      })
    })

    document.querySelectorAll('[data-community-back-list]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        communityState.view = 'list'
        communityState.selectedPostId = null
        communityState.editingPostId = null
        renderCommunityPage(true)
      })
    })

    document.querySelectorAll('[data-community-edit-post]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        communityState.editingPostId = button.dataset.communityEditPost
        renderCommunityPage(true)
      })
    })

    document.querySelectorAll('[data-community-delete-post]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        showPatchConfirm('\uAE00\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
          var tab = communityState.activeTab || 'free'
          var post = findCommunityPost(tab, button.dataset.communityDeletePost)
          var removeLocal = function () {
            communityState[tab] = communityItems(tab).filter(function (item) {
              return item.id !== button.dataset.communityDeletePost
            })
            communityState.view = 'list'
            communityState.selectedPostId = null
            communityState.editingPostId = null
            showPatchToast('\uAE00\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
            renderCommunityPage(true)
          }
          if (!post || !post.serverId) {
            removeLocal()
            return
          }
          apiRequest('/community/posts/' + encodeURIComponent(post.serverId), { method: 'DELETE' }).then(removeLocal).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uAE00 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      })
    })

    document.querySelectorAll('[data-community-cancel-edit]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        communityState.composing = false
        communityState.editingPostId = null
        renderCommunityPage(true)
      })
    })

    document.querySelectorAll('[data-community-download]').forEach(function (link) {
      if (link.dataset.wired) return
      link.dataset.wired = 'true'
      link.addEventListener('click', function (event) {
        var href = link.getAttribute('href') || ''
        if (href && href !== '#') return
        event.preventDefault()
        showPatchToast('\uCCA8\uBD80\uD30C\uC77C\uC744 \uBA3C\uC800 \uC5C5\uB85C\uB4DC\uD574\uC8FC\uC138\uC694.')
      })
    })

    document.querySelectorAll('.community-file-field input[type="file"]').forEach(function (input) {
      if (input.dataset.wired) return
      input.dataset.wired = 'true'
      input.addEventListener('change', function () {
        var label = input.closest('.community-file-field')
        var small = label && label.querySelector('small')
        var files = getCommunityFileNames(input)
        if (small) small.textContent = files.length ? files.map(function (file) { return file.name }).join(', ') : '\uC120\uD0DD\uB41C \uD30C\uC77C \uC5C6\uC74C'
      })
    })

    document.querySelectorAll('[data-community-compose]').forEach(function (form) {
      if (form.dataset.wired) return
      form.dataset.wired = 'true'
      form.addEventListener('submit', function (event) {
        event.preventDefault()
        var tab = form.dataset.communityCompose || 'free'
        var title = form.elements.title.value.trim()
        var body = form.elements.body.value.trim()
        if (!title) {
          form.elements.title.focus()
          showPatchToast('\uC81C\uBAA9\uC740 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
          return
        }
        if (!body) {
          form.elements.body.focus()
          showPatchToast('\uB0B4\uC6A9\uC740 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
          return
        }
        var editId = form.dataset.editPost
        setCommunityFormBusy(form, true)
        uploadCommunityFiles(form.elements.files).then(function (uploadedFiles) {
          if (editId) {
            var targetPost = findCommunityPost(tab, editId)
            if (!targetPost) return
            var nextFiles = uploadedFiles.length ? uploadedFiles : (targetPost.files || [])
            return communityPostPayload(tab, title, body, nextFiles).then(function (payload) {
              if (!targetPost.serverId) {
                targetPost.title = title
                targetPost.body = body
                targetPost.files = nextFiles
                return targetPost
              }
              return apiRequest('/community/posts/' + encodeURIComponent(targetPost.serverId), {
                method: 'PUT',
                body: JSON.stringify(payload)
              }).then(function (saved) {
                return normalizeCommunityPost(saved, targetPost.comments || [])
              })
            }).then(function (savedPost) {
              replaceCommunityPost(tab, savedPost)
              communityState.editingPostId = null
              showPatchToast('\uAE00\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
              renderCommunityPage(true)
            })
          }
          return communityPostPayload(tab, title, body, uploadedFiles).then(function (payload) {
            return apiRequest('/community/posts', {
              method: 'POST',
              body: JSON.stringify(payload)
            }).then(function (saved) {
              return normalizeCommunityPost(saved, [])
            })
          }).then(function (newPost) {
            communityItems(tab).unshift(newPost)
            communityState.composing = false
            showPatchToast('\uAC8C\uC2DC\uAE00\uC744 \uB4F1\uB85D\uD588\uC2B5\uB2C8\uB2E4.')
            renderCommunityPage(true)
          })
        }).catch(function (error) {
          if (String(error && error.message || '').indexOf('INVALID_MEDIA') < 0) {
            showPatchToast(apiActionErrorMessage(error, '\uAC8C\uC2DC\uAE00 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          }
        }).finally(function () {
          setCommunityFormBusy(form, false)
        })
      })
    })

    document.querySelectorAll('[data-edit-comment]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        var post = findCommunityPost(communityState.activeTab || 'free', communityState.selectedPostId)
        var comment = post && (post.comments || []).find(function (item) {
          return item.id === button.dataset.editComment
        })
        if (!comment) return
        var next = window.prompt('\uB313\uAE00\uC744 \uC218\uC815\uD574\uC8FC\uC138\uC694.', comment.text)
        if (next === null) return
        if (!next.trim()) {
          showPatchToast('\uB313\uAE00\uC740 \uBE44\uC6CC\uB458 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.')
          return
        }
        var applyComment = function (saved) {
          var nextComment = saved ? normalizeCommunityComment(saved) : null
          comment.text = nextComment ? nextComment.text : next.trim()
          comment.time = nextComment ? nextComment.time : communityNowText()
          showPatchToast('\uB313\uAE00\uC744 \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.')
          renderCommunityPage(true)
        }
        if (!comment.serverId) {
          applyComment(null)
          return
        }
        apiRequest('/community/comments/' + encodeURIComponent(comment.serverId), {
          method: 'PUT',
          body: JSON.stringify({ body: next.trim() })
        }).then(applyComment).catch(function (error) {
          showPatchToast(apiActionErrorMessage(error, '\uB313\uAE00 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
        })
      })
    })

    document.querySelectorAll('[data-delete-comment]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        showPatchConfirm('\uB313\uAE00\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
          var post = findCommunityPost(communityState.activeTab || 'free', communityState.selectedPostId)
          if (!post) return
          var comment = (post.comments || []).find(function (item) {
            return item.id === button.dataset.deleteComment
          })
          var removeComment = function () {
            post.comments = (post.comments || []).filter(function (item) {
              return item.id !== button.dataset.deleteComment
            })
            showPatchToast('\uB313\uAE00\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
            renderCommunityPage(true)
          }
          if (!comment || !comment.serverId) {
            removeComment()
            return
          }
          apiRequest('/community/comments/' + encodeURIComponent(comment.serverId), { method: 'DELETE' }).then(removeComment).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uB313\uAE00 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      })
    })

    document.querySelectorAll('[data-comment-post]').forEach(function (form) {
      if (form.dataset.wired) return
      form.dataset.wired = 'true'
      form.addEventListener('submit', function (event) {
        event.preventDefault()
        var input = form.elements.comment
        var text = input.value.trim()
        if (!text) {
          input.focus()
          showPatchToast('\uB313\uAE00\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.')
          return
        }
        var post = communityItems(communityState.activeTab || 'free').find(function (item) {
          return item.id === form.dataset.commentPost
        })
        if (!post) return
        var addComment = function (comment) {
          post.comments = post.comments || []
          post.comments.push(comment)
          showPatchToast('\uB313\uAE00\uC744 \uB4F1\uB85D\uD588\uC2B5\uB2C8\uB2E4.')
          renderCommunityPage(true)
        }
        if (!post.serverId) {
          addComment({ id: 'comment-' + Date.now(), author: '\uB098', time: communityNowText(), text: text })
          return
        }
        apiRequest('/community/posts/' + encodeURIComponent(post.serverId) + '/comments', {
          method: 'POST',
          body: JSON.stringify({ body: text })
        }).then(function (saved) {
          addComment(normalizeCommunityComment(saved))
        }).catch(function () {
          showPatchToast('\uB313\uAE00 \uB4F1\uB85D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
        })
      })
    })
  }

  function enhanceAuthSso() {
    var card = document.querySelector('.auth-card')
    if (!card || card.dataset.ssoReady) return
    card.dataset.ssoReady = 'true'

    var submit = card.querySelector('.auth-submit')
    if (!submit) return

    var block = document.createElement('div')
    block.className = 'auth-sso-block'

    var divider = document.createElement('div')
    divider.className = 'auth-sso-divider'
    divider.textContent = 'SSO \uB85C\uADF8\uC778'
    block.appendChild(divider)

    var providerStatus = {}
    var statusLoaded = false
    var statusFailed = false
    var providers = [
      { key: 'naver', label: '\uB124\uC774\uBC84' },
      { key: 'kakao', label: '\uCE74\uCE74\uC624' },
      { key: 'google', label: '\uAD6C\uAE00' }
    ]

    function resolveSsoStartUrl(provider, item) {
      var startUrl = item && item.startUrl ? item.startUrl : '/auth/oauth/' + provider.key + '/start'
      var apiBase = window.FAMILY_PLATFORM_API_BASE_URL || localStorage.getItem('family-platform-api-base-url') || API_BASE_URL || '/api'
      if (/^https?:\/\//i.test(startUrl)) return startUrl
      if (startUrl.indexOf('/api/') === 0) {
        var rootBase = apiBase.replace(/\/api\/?$/, '')
        if (/^https?:\/\//i.test(rootBase)) return rootBase + startUrl
        return startUrl
      }
      return apiBase.replace(/\/$/, '') + (startUrl.charAt(0) === '/' ? startUrl : '/' + startUrl)
    }

    function updateProviderButtons() {
      providers.forEach(function (provider) {
        var button = block.querySelector('[data-sso-provider="' + provider.key + '"]')
        if (!button) return
        var item = providerStatus[provider.key]
        var configured = item && item.configured
        var unavailable = statusLoaded && !statusFailed && !configured
        button.classList.toggle('is-disabled', unavailable)
        button.title = unavailable ? '\uB3C4\uBA54\uC778\uACFC OAuth Client ID \uC124\uC815 \uD6C4 \uC5F0\uACB0\uB429\uB2C8\uB2E4.' : provider.label + ' \uB85C\uADF8\uC778'
      })
    }

    apiGetJson('/auth/oauth/providers').then(function (items) {
      providerStatus = {}
      ;(items || []).forEach(function (item) {
        providerStatus[item.provider] = item
      })
      statusLoaded = true
      statusFailed = false
      updateProviderButtons()
    }).catch(function () {
      statusLoaded = true
      statusFailed = true
      updateProviderButtons()
    })

    providers.forEach(function (provider) {
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'auth-sso-button ' + provider.key
      button.dataset.ssoProvider = provider.key
      button.textContent = provider.label + ' \uB85C\uADF8\uC778'
      button.addEventListener('click', function () {
        var item = providerStatus[provider.key]
        if (statusLoaded && !statusFailed && (!item || !item.configured)) {
          showPatchToast(provider.label + ' SSO\uB294 \uB3C4\uBA54\uC778\uACFC OAuth Client ID \uC124\uC815 \uD6C4 \uC5F0\uACB0\uB429\uB2C8\uB2E4.')
          return
        }
        window.location.href = resolveSsoStartUrl(provider, item)
      })
      block.appendChild(button)
    })

    updateProviderButtons()
    submit.insertAdjacentElement('afterend', block)
  }

  function hideReactOwnedElement(element) {
    if (!element) return
    hidePatchElement(element)
  }

  function enhanceHomeDashboard() {
    var content = document.querySelector('.content-grid')
    if (!content) return
    document.querySelectorAll('.sync-panel').forEach(function (panel) {
      hideReactOwnedElement(panel)
    })
    document.querySelectorAll('.topbar .custom-select, .topbar .user-chip').forEach(function (item) {
      hideReactOwnedElement(item)
    })

    Array.from(content.querySelectorAll('.summary-band')).forEach(function (panel) {
      hideReactOwnedElement(panel)
    })
    Array.from(content.querySelectorAll('.panel')).forEach(function (panel) {
      if (getCleanText(panel).indexOf('\uAC00\uC871 \uC0DD\uD65C \uB370\uC774\uD130') >= 0) hideReactOwnedElement(panel)
    })

    var panels = Array.from(content.querySelectorAll('.panel'))
    var todayPanel = panels.find(function (panel) {
      var h2 = panel.querySelector('.panel-header h2')
      return getCleanText(h2) === '\uC624\uB298 \uD560 \uC77C' || getCleanText(h2) === '\uC624\uB298\uC758 \uC77C\uC815'
    })

    if (todayPanel) {
      todayPanel.classList.add('home-today-schedule', 'full-span')
      var header = todayPanel.querySelector('.panel-header')
      var title = header && header.querySelector('h2')
      var action = header && header.querySelector('button')
      if (title && title.textContent !== '\uC624\uB298\uC758 \uC77C\uC815') title.textContent = '\uC624\uB298\uC758 \uC77C\uC815'
      if (action) {
        if (action.textContent !== '\uCE98\uB9B0\uB354') action.textContent = '\uCE98\uB9B0\uB354'
        if (!action.dataset.navReady) {
          action.dataset.navReady = 'true'
          action.addEventListener('click', function () { goMenu('\uCE98\uB9B0\uB354') })
        }
      }

      var list = todayPanel.querySelector('.task-list')
      if (list && !todayPanel.dataset.scheduleReady) {
        todayPanel.dataset.scheduleReady = 'true'
        list.innerHTML = ''
      }

      todayPanel.style.order = '-10'

      if (!todayPanel.dataset.navReady) {
        todayPanel.dataset.navReady = 'true'
        todayPanel.addEventListener('click', function (event) {
          if (event.target && event.target.closest && event.target.closest('button')) return
          goMenu('\uCE98\uB9B0\uB354')
        })
      }
    }

    var metricLinks = [
      ['\uC774\uBC88 \uB2EC \uC9C0\uCD9C', '\uAC00\uACC4\uBD80'],
      ['\uC5EC\uD589 \uB204\uC801', '\uC5EC\uD589'],
      ['\uC721\uC544 \uAE30\uB85D', '\uC721\uC544'],
      ['\uAC00\uC871 \uBA64\uBC84', '\uAC00\uC871\uADF8\uB8F9']
    ]
    document.querySelectorAll('.metric-grid .metric').forEach(function (metric) {
      if (metric.dataset.navReady) return
      var label = getCleanText(metric.querySelector('span'))
      var target = (metricLinks.find(function (item) { return item[0] === label }) || [])[1]
      if (!target) return
      metric.dataset.navReady = 'true'
      metric.setAttribute('role', 'button')
      metric.tabIndex = 0
      metric.addEventListener('click', function () { goMenu(target) })
      metric.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') goMenu(target)
      })
    })

    var summaryButtons = Array.from(document.querySelectorAll('.summary-actions button'))
    if (summaryButtons[0] && !summaryButtons[0].dataset.navReady) {
      summaryButtons[0].dataset.navReady = 'true'
      summaryButtons[0].addEventListener('click', function () { goMenu('\uAC00\uACC4\uBD80') })
    }
    if (summaryButtons[1] && !summaryButtons[1].dataset.navReady) {
      summaryButtons[1].dataset.navReady = 'true'
      summaryButtons[1].addEventListener('click', function () { goMenu('\uC77C\uAE30') })
    }

    document.querySelectorAll('.panel.wide .panel-header button').forEach(function (button) {
      if (getCleanText(button) !== '\uC804\uCCB4 \uBCF4\uAE30' || button.dataset.navReady) return
      button.dataset.navReady = 'true'
      button.addEventListener('click', function () { goMenu('\uAC00\uACC4\uBD80') })
    })
  }

  function hideBabyEmptySelectionPanel() {
    document.querySelectorAll('.panel').forEach(function (panel) {
      var title = getCleanText(panel.querySelector('.panel-header h2'))
      if (title === '\uC544\uC774 \uC120\uD0DD') {
        hidePatchElement(panel)
      }
    })
  }

  function enhanceBabyRecordMedia() {
    document.querySelectorAll('.baby-record-row').forEach(function (row) {
      var media = Array.from(row.querySelectorAll('img, video')).filter(function (item) {
        return !item.closest('.baby-record-media')
      })
      if (!media.length) return

      row.classList.add('has-media')
      var mediaWrap = row.querySelector('.baby-record-media')
      if (!mediaWrap) {
        mediaWrap = document.createElement('div')
        mediaWrap.className = 'baby-record-media'
        row.insertBefore(mediaWrap, row.firstChild)
      }

      media.slice(0, 3).forEach(function (item) {
        mediaWrap.appendChild(item)
      })
      if (media.length > 1) {
        mediaWrap.dataset.count = '+' + media.length
      }
    })
  }

  function cleanupBabyDetailButtons() {
    var detail = document.querySelector('.baby-detail')
    if (!detail) return

    var headerBack = document.querySelector('.panel-header .baby-header-back-button')
    var inlineBack = detail.querySelector('.back-button')
    if (headerBack && inlineBack) {
      hidePatchElement(inlineBack)
    }

    var mainHeader = Array.from(document.querySelectorAll('.panel-header')).find(function (header) {
      return getCleanText(header.querySelector('h2')) === '\uC721\uC544 \uAE30\uB85D'
    })
    if (mainHeader && !mainHeader.querySelector('.baby-header-back-button')) {
      var backButton = document.createElement('button')
      backButton.type = 'button'
      backButton.className = 'baby-header-back-button'
      backButton.textContent = '\uBAA9\uB85D'
      backButton.addEventListener('click', function () {
        var nav = findNavButton('\uC721\uC544') || findNavButtonContains('\uC721\uC544')
        if (nav) triggerNavButton(nav)
      })
      mainHeader.appendChild(backButton)
    }

    document.querySelectorAll('.growth-panel.insight-card .panel-header button, .pattern-panel.insight-card .panel-header button').forEach(function (button) {
      if (button.dataset.passiveInsightReady) return
      var badge = document.createElement('span')
      badge.className = 'passive-header-chip baby-insight-chip'
      badge.textContent = getCleanText(button) || '\uC0C1\uC138'
      badge.dataset.passiveInsightReady = 'true'
      button.replaceWith(badge)
    })
  }

  function getVisibleBabyProfile() {
    var band = document.querySelector('.baby-profile-band')
    if (!band) return null
    var name = getCleanText(band.querySelector('strong')) || '\uC544\uC774'
    var meta = getCleanText(band.querySelector('span'))
    var memo = getCleanText(band.querySelector('p'))
    var metric = getCleanText(band.querySelector('small'))
    var metaParts = meta.split('\u00B7').map(function (item) { return item.trim() }).filter(Boolean)
    var birthDate = metaParts.find(function (item) { return /^\d{4}-\d{2}-\d{2}$/.test(item) }) || todayText()
    var gender = metaParts[0] || null
    var heightMatch = metric.match(/(\d+(?:\.\d+)?)\s*cm/i)
    var weightMatch = metric.match(/(\d+(?:\.\d+)?)\s*kg/i)
    return {
      name: name,
      gender: gender,
      birthDate: birthDate,
      memo: memo,
      latestHeightCm: heightMatch ? Number(heightMatch[1]) : null,
      latestWeightKg: weightMatch ? Number(weightMatch[1]) : null
    }
  }

  function ensureApiBabyForDetail() {
    var detail = document.querySelector('.baby-detail')
    if (detail && detail.dataset.apiBabyId) return Promise.resolve(detail.dataset.apiBabyId)
    var profile = getVisibleBabyProfile()
    if (!profile) return Promise.reject(new Error('BABY_PROFILE_REQUIRED'))
    return fetchBabies().then(function (babies) {
      var found = babies.find(function (baby) {
        return String(baby.name || '').trim() === profile.name
      })
      if (found && found.id) return found.id
      return getCurrentFamilyId().then(function (familyId) {
        return postJson('/babies?familyId=' + encodeURIComponent(familyId), profile)
      }).then(function (baby) {
        return baby.id
      })
    })
  }

  function optionalDecimal(value) {
    var text = String(value || '').replace(/[^\d.]/g, '')
    var firstDot = text.indexOf('.')
    if (firstDot >= 0) {
      text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '')
    }
    return text ? Number(text) : null
  }

  function sanitizeDecimalText(value) {
    var text = String(value || '').replace(/[^\d.]/g, '')
    var firstDot = text.indexOf('.')
    if (firstDot < 0) return text
    return text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '')
  }

  function setBabyApiRecordBusy(form, busy) {
    if (!form) return
    form.querySelectorAll('button, input, textarea, select').forEach(function (field) {
      field.disabled = !!busy
    })
    var submit = form.querySelector('button[type="submit"]')
    if (submit) {
      if (!submit.dataset.originalText) submit.dataset.originalText = submit.textContent
      submit.textContent = busy ? '\uC800\uC7A5 \uC911' : submit.dataset.originalText
    }
  }

  function ensureBabyApiRecordForm() {
    var detail = document.querySelector('.baby-detail')
    if (!detail || detail.querySelector('.baby-api-record-card')) return

    var side = detail.querySelector('.baby-api-detail-side')
    var anchor = side || detail.querySelector('.record-filter-bar') || detail.querySelector('.baby-record-list') || detail.lastElementChild
    var card = document.createElement('section')
    card.className = 'baby-api-record-card'
    card.innerHTML = [
      '<header><div><span>\uC721\uC544 \uAE30\uB85D</span><strong>\uC0C8 \uAE30\uB85D \uCD94\uAC00</strong></div><small>\uC800\uC7A5 \uD6C4 \uAE30\uB85D\uC5D0 \uBC18\uC601\uB429\uB2C8\uB2E4.</small></header>',
      '<form class="baby-api-record-form">',
      '<div class="baby-api-form-grid">',
      '<label class="form-field"><span class="form-label">\uAE30\uB85D\uC885\uB958</span><input name="recordType" type="hidden" required value="\uC218\uC720" /><div class="custom-select baby-api-record-type-select"><button type="button" class="custom-select-trigger form-control" data-baby-record-type-trigger><span>\uC218\uC720</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="custom-select-list" hidden><button type="button" data-baby-record-type="\uC218\uC720">\uC218\uC720</button><button type="button" data-baby-record-type="\uB300\uBCC0">\uB300\uBCC0</button><button type="button" data-baby-record-type="\uC18C\uBCC0">\uC18C\uBCC0</button><button type="button" data-baby-record-type="\uC218\uBA74">\uC218\uBA74</button><button type="button" data-baby-record-type="\uC131\uC7A5">\uC131\uC7A5</button><button type="button" data-baby-record-type="\uBCD1\uC6D0">\uBCD1\uC6D0</button><button type="button" data-baby-record-type="\uBA54\uBAA8">\uBA54\uBAA8</button></div></div></label>',
      '<label class="date-picker-field baby-api-date-field form-field"><span class="form-label">\uB0A0\uC9DC</span><input name="recordDate" type="hidden" required value="' + todayText() + '" /><button type="button" class="date-picker-trigger baby-api-date-button form-control" data-baby-api-record-date-trigger><span>' + todayText().replace(/-/g, '.') + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2v4M16 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></label>',
      '<label class="form-field"><span class="form-label">\uC2DC\uAC04</span><input class="form-control" name="recordTime" type="text" inputmode="numeric" autocomplete="off" maxlength="5" value="' + currentTimeText() + '" /></label>',
      '<label class="form-field"><span class="form-label">\uC218\uC720\uB7C9(ml)</span><input class="form-control" name="amountMl" type="text" inputmode="numeric" /></label>',
      '<label class="form-field"><span class="form-label">\uD0A4(cm)</span><input class="form-control" name="heightCm" type="text" inputmode="decimal" autocomplete="off" /></label>',
      '<label class="form-field"><span class="form-label">\uBAB8\uBB34\uAC8C(kg)</span><input class="form-control" name="weightKg" type="text" inputmode="decimal" autocomplete="off" /></label>',
      '</div>',
      '<label class="baby-api-memo form-field"><span class="form-label">\uBA54\uBAA8</span><textarea class="form-control" name="memo" rows="3"></textarea></label>',
      '<label class="community-file-field baby-api-file-field"><span>\uC0AC\uC9C4/\uC601\uC0C1 \uCCA8\uBD80</span><b>\uD30C\uC77C \uC120\uD0DD</b><input name="files" type="file" accept="image/*,video/*" multiple /><small>' + mediaLimitText() + '</small></label>',
      '<div class="baby-api-record-actions"><button type="button" class="cancel-button" data-baby-api-clear>\uCD08\uAE30\uD654</button><button type="submit" class="save-button">\uC800\uC7A5</button></div>',
      '</form>'
    ].join('')

    if (side) {
      side.appendChild(card)
    } else if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(card, anchor)
    } else {
      detail.appendChild(card)
    }
    bindBabyApiRecordDateField(card)
    bindBabyApiRecordTypeSelect(card)
  }

  function bindBabyApiRecordTypeSelect(scope) {
    var select = scope && scope.querySelector('.baby-api-record-type-select')
    if (!select || select.dataset.ready === 'true') return
    select.dataset.ready = 'true'
    var trigger = select.querySelector('[data-baby-record-type-trigger]')
    var list = select.querySelector('.custom-select-list')
    var input = scope.querySelector('[name="recordType"]')
    if (!trigger || !list || !input) return
    trigger.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      var open = list.hidden
      document.querySelectorAll('.custom-select.open').forEach(function (item) {
        item.classList.remove('open')
        var itemList = item.querySelector('.custom-select-list')
        if (itemList) itemList.hidden = true
      })
      list.hidden = !open
      select.classList.toggle('open', open)
      trigger.classList.toggle('open', open)
    })
    list.querySelectorAll('[data-baby-record-type]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        input.value = button.dataset.babyRecordType || ''
        var label = trigger.querySelector('span')
        if (label) label.textContent = input.value || '\uC120\uD0DD'
        list.hidden = true
        select.classList.remove('open')
        trigger.classList.remove('open')
      })
    })
  }

  function bindBabyApiRecordDateField(scope) {
    var input = scope && scope.querySelector('[name="recordDate"]')
    var trigger = scope && scope.querySelector('[data-baby-api-record-date-trigger]')
    if (!input || !trigger || trigger.dataset.babyApiDateReady === 'true') return
    trigger.dataset.babyApiDateReady = 'true'
  }

  function handleBabyApiRecordDateTrigger(event, skipRecentPointer) {
    var trigger = event.target && event.target.closest && event.target.closest('[data-baby-api-record-date-trigger]')
    if (!trigger) return false
    if (skipRecentPointer && trigger.dataset.babyApiPointerAt && Date.now() - Number(trigger.dataset.babyApiPointerAt) < 600) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      return true
    }
    var form = trigger.closest('.baby-api-record-form')
    var input = form && form.querySelector('[name="recordDate"]')
    if (!input) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (event.type === 'pointerdown') trigger.dataset.babyApiPointerAt = String(Date.now())
    toggleCommonDatePopover(input, trigger)
    return true
  }

  function bindBabyGrowthDateField(scope) {
    var input = scope && scope.querySelector('.baby-growth-api-form [name="recordDate"]')
    var trigger = scope && scope.querySelector('[data-baby-growth-date-trigger]')
    if (!input || !trigger || trigger.dataset.babyGrowthDateReady === 'true') return
    trigger.dataset.babyGrowthDateReady = 'true'
  }

  function handleBabyGrowthDateTrigger(event, skipRecentPointer) {
    var trigger = event.target && event.target.closest && event.target.closest('[data-baby-growth-date-trigger]')
    if (!trigger) return false
    if (skipRecentPointer && trigger.dataset.babyGrowthPointerAt && Date.now() - Number(trigger.dataset.babyGrowthPointerAt) < 600) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      return true
    }
    var form = trigger.closest('.baby-growth-api-form')
    var input = form && form.querySelector('[name="recordDate"]')
    if (!input) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (event.type === 'pointerdown') trigger.dataset.babyGrowthPointerAt = String(Date.now())
    toggleCommonDatePopover(input, trigger)
    return true
  }

  document.addEventListener('pointerdown', function (event) {
    handleBabyApiRecordDateTrigger(event, false)
    handleBabyGrowthDateTrigger(event, false)
  }, true)

  document.addEventListener('click', function (event) {
    handleBabyApiRecordDateTrigger(event, true)
    handleBabyGrowthDateTrigger(event, true)
  }, true)

  document.addEventListener('pointerdown', closeBabyCommonDatePopoverOnOutsideEvent, true)
  document.addEventListener('focusin', closeBabyCommonDatePopoverOnOutsideEvent, true)

  function enhanceBabyEditMediaHelper() {
    document.querySelectorAll('.baby-record-row .edit-button').forEach(function (button) {
      if (button.dataset.mediaEditReady) return
      button.dataset.mediaEditReady = 'true'
      button.addEventListener('click', function () {
        window.setTimeout(function () {
          var photoInput = Array.from(document.querySelectorAll('.photo-input, label, div')).find(function (item) {
            var panel = item.closest('.panel, form, article')
            var text = getCleanText(panel)
            var itemText = getCleanText(item)
            return itemText.indexOf('\uC0AC\uC9C4') >= 0 && (text.indexOf('\uC721\uC544') >= 0 || text.indexOf('\uAE30\uB85D') >= 0 || text.indexOf('\uC0AC\uC9C4') >= 0)
          })
          if (!photoInput) return
          photoInput.classList.add('media-edit-target')
          if (!photoInput.querySelector('.media-edit-helper')) {
            var helper = document.createElement('small')
            helper.className = 'media-edit-helper'
            helper.textContent = '\uC0AC\uC9C4/\uC601\uC0C1\uC740 \uC218\uC815 \uC800\uC7A5 \uC804\uC5D0 \uC0C8 \uD30C\uC77C\uC744 \uC120\uD0DD\uD558\uBA74 \uAD50\uCCB4\uB429\uB2C8\uB2E4.'
            photoInput.appendChild(helper)
          }
          photoInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 180)
      }, true)
    })
  }

  function setGrowthMode(dialog, mode) {
    dialog.dataset.growthMode = mode
    dialog.querySelectorAll('.growth-tab-button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.growthMode === mode)
    })

    var desc = dialog.querySelector('header p')
    if (desc) {
      desc.textContent = mode === 'height'
        ? 'X\uCD95\uC740 \uB0A0\uC9DC, Y\uCD95\uC740 \uD0A4(cm)\uC785\uB2C8\uB2E4.'
        : 'X\uCD95\uC740 \uB0A0\uC9DC, Y\uCD95\uC740 \uBAB8\uBB34\uAC8C(kg)\uC785\uB2C8\uB2E4.'
    }

    dialog.querySelectorAll('.growth-history.detailed span').forEach(function (span) {
      if (!span.dataset.fullText) span.dataset.fullText = span.textContent.trim()
      var parts = span.dataset.fullText.split('\u00B7').map(function (item) { return item.trim() })
      var value = mode === 'height'
        ? (parts.find(function (item) { return item.indexOf('cm') >= 0 }) || '-')
        : (parts.find(function (item) { return item.indexOf('kg') >= 0 }) || '-')
      span.textContent = value
    })
  }

  function enhanceBabyGrowthTabs() {
    document.querySelectorAll('.insight-dialog').forEach(function (dialog) {
      var title = getCleanText(dialog.querySelector('h2'))
      if (title !== '\uC131\uC7A5\uACE1\uC120' || dialog.dataset.growthTabsReady) return
      dialog.dataset.growthTabsReady = 'true'

      var header = dialog.querySelector('header')
      if (!header) return

      var tabs = document.createElement('div')
      tabs.className = 'growth-tab-switch'

      var heightButton = document.createElement('button')
      heightButton.type = 'button'
      heightButton.className = 'growth-tab-button'
      heightButton.dataset.growthMode = 'height'
      heightButton.textContent = '\uD0A4'

      var weightButton = document.createElement('button')
      weightButton.type = 'button'
      weightButton.className = 'growth-tab-button'
      weightButton.dataset.growthMode = 'weight'
      weightButton.textContent = '\uBAB8\uBB34\uAC8C'

      heightButton.addEventListener('click', function () {
        setGrowthMode(dialog, 'height')
      })

      weightButton.addEventListener('click', function () {
        setGrowthMode(dialog, 'weight')
      })

      tabs.appendChild(heightButton)
      tabs.appendChild(weightButton)
      header.insertAdjacentElement('afterend', tabs)
      setGrowthMode(dialog, 'height')
    })
  }

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

  function searchLocationPlaces(query, limit) {
    var text = String(query || '').trim()
    if (!text || text.length < 2 || !getStoredAuthToken()) return Promise.resolve([])
    return apiRequest('/places/search?q=' + encodeURIComponent(text) + '&limit=' + encodeURIComponent(limit || 6)).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function locationCandidateLabel(item) {
    return String(item && (item.name || item.address) || '').trim()
  }

  function locationCandidateDetail(item) {
    return String(item && item.address || '').trim()
  }

  function setLocationCandidate(input, item, options) {
    if (!input || !item) return
    options = options || {}
    var label = locationCandidateLabel(item)
    var detail = locationCandidateDetail(item)
    setNativeInputValue(input, label || detail)
    var latitude = Number(item.latitude)
    var longitude = Number(item.longitude)
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
      input.dataset.latitude = String(latitude)
      input.dataset.longitude = String(longitude)
      if (options.storeCoordinatesOnForm && input.form) {
        input.form.dataset.latitude = String(latitude)
        input.form.dataset.longitude = String(longitude)
      }
    } else {
      delete input.dataset.latitude
      delete input.dataset.longitude
      if (options.storeCoordinatesOnForm && input.form) {
        delete input.form.dataset.latitude
        delete input.form.dataset.longitude
      }
    }
    if (detail) input.dataset.placeAddress = detail
    else delete input.dataset.placeAddress
    if (options.addressSelector && input.form) {
      var addressInput = input.form.querySelector(options.addressSelector)
      if (addressInput && detail) setNativeInputValue(addressInput, detail)
    }
    if (typeof options.onSelect === 'function') {
      options.onSelect(input, item, { latitude: latitude, longitude: longitude, label: label, detail: detail })
    }
    input.dispatchEvent(new CustomEvent('family-platform-location-selected', {
      bubbles: true,
      detail: { item: item, latitude: latitude, longitude: longitude, label: label, address: detail }
    }))
  }

  function getLocationCoordinates(form, selector) {
    var input = form && form.querySelector(selector)
    if (!input) return null
    var latitude = Number(input.dataset.latitude || form.dataset.latitude)
    var longitude = Number(input.dataset.longitude || form.dataset.longitude)
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
      return { latitude: latitude, longitude: longitude }
    }
    var match = String(input.value || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
    if (!match) return null
    latitude = Number(match[1])
    longitude = Number(match[2])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
    return { latitude: latitude, longitude: longitude }
  }

  function resolveLocationForSubmit(form, location, selector, options) {
    var existing = getLocationCoordinates(form, selector)
    if (existing || !String(location || '').trim()) return Promise.resolve(existing)
    return searchLocationPlaces(location, 1).then(function (items) {
      var first = items[0]
      if (!first) return null
      var input = form.querySelector(selector)
      setLocationCandidate(input, first, options)
      return { latitude: Number(first.latitude), longitude: Number(first.longitude) }
    })
  }

  function ensureLocationSearch(form, selector, options) {
    options = options || {}
    var input = form && form.querySelector(selector)
    if (!input || input.dataset.placeSearchReady === 'true') return
    input.dataset.placeSearchReady = 'true'
    var label = input.closest('label')
    var candidates = document.createElement('div')
    candidates.className = 'location-candidates travel-location-candidates'
    candidates.hidden = true
    if (label && label.parentElement) {
      label.insertAdjacentElement('afterend', candidates)
    }
    var timer = null

    function hideCandidates() {
      candidates.hidden = true
      candidates.innerHTML = ''
    }

    function renderCandidates(query, items) {
      if (String(input.value || '').trim() !== query) return
      if (!items.length) {
        items = [{ id: 'manual:' + query, name: query, address: '\uC785\uB825\uD55C \uC704\uCE58\uB85C \uC800\uC7A5', latitude: '', longitude: '', source: 'manual' }]
      }
      candidates.innerHTML = '<span>\uC704\uCE58\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.</span>' + items.map(function (item, index) {
        return '<button type="button" data-place-index="' + index + '">' +
          '<b>' + escapeHtml(locationCandidateLabel(item)) + '</b>' +
          '<small>' + escapeHtml(locationCandidateDetail(item)) + '</small>' +
          '</button>'
      }).join('')
      candidates.hidden = false
      candidates.querySelectorAll('button[data-place-index]').forEach(function (button) {
        button.addEventListener('mousedown', function (event) { event.preventDefault() })
        button.addEventListener('click', function () {
          var item = items[Number(button.dataset.placeIndex)]
          setLocationCandidate(input, item, options)
          hideCandidates()
        })
      })
    }

    function queuePlaceSearch(clearCoordinates) {
      if (clearCoordinates) {
        delete input.dataset.latitude
        delete input.dataset.longitude
        delete input.dataset.placeAddress
        if (options.storeCoordinatesOnForm && input.form) {
          delete input.form.dataset.latitude
          delete input.form.dataset.longitude
        }
      }
      window.clearTimeout(timer)
      var query = String(input.value || '').trim()
      if (query.length < 2) {
        hideCandidates()
        return
      }
      timer = window.setTimeout(function () {
        candidates.innerHTML = '<span>\uC704\uCE58\uB97C \uAC80\uC0C9\uD558\uB294 \uC911\uC785\uB2C8\uB2E4.</span>'
        candidates.hidden = false
        searchLocationPlaces(query, 6).then(function (items) {
          renderCandidates(query, items)
        })
      }, 280)
    }

    input.addEventListener('input', function () {
      queuePlaceSearch(true)
    })
    input.addEventListener('focus', function () {
      if (String(input.value || '').trim().length >= 2 && candidates.hidden) {
        queuePlaceSearch(false)
      }
    })
    input.addEventListener('blur', function () {
      window.setTimeout(hideCandidates, 220)
    })
  }
  function scheduleTimeText(item) {
    return item.scheduleTime ? String(item.scheduleTime).slice(0, 5) : '\uC2DC\uAC04 \uBBF8\uC815'
  }

  var calendarScheduleCache = {
    key: '',
    items: [],
    loadedAt: 0
  }
  var homeMetricsRequestSeq = 0
  var homeLedgerRequestSeq = 0
  var ledgerPageRequestSeq = 0

  function rangeForCalendarMode() {
    var mode = getActiveCalendarMode ? getActiveCalendarMode() : 'month'
    var modeDate = getCalendarModeDate(mode)
    var focused = apiDate(modeDate || (getFocusedDate ? getFocusedDate() : todayText()))
    if (mode === 'year') return { start: focused.slice(0, 4) + '-01-01', end: focused.slice(0, 4) + '-12-31' }
    if (mode === 'day') return { start: focused, end: focused }
    if (mode === 'week') {
      var start = weekStart(new Date(focused + 'T00:00:00'))
      return { start: apiDate(start), end: apiDate(addDays(start, 6)) }
    }
    return monthRangeFor(focused)
  }

  function normalizeScheduleItem(item) {
    return {
      id: item.id,
      title: item.title || '',
      scheduleDate: item.scheduleDate || item.date || '',
      scheduleTime: item.scheduleTime || item.time || '',
      category: item.category || '\uC77C\uC815',
      memberName: item.memberName || item.member || '',
      memo: item.memo || item.note || '',
      repeatRule: item.repeatRule || item.repeat || 'none',
      calendarBasis: item.calendarBasis || item.basis || 'solar'
    }
  }

  function loadCalendarScheduleCache(force) {
    if (!document.querySelector('.family-calendar-panel')) return Promise.resolve([])
    var range = rangeForCalendarMode()
    var key = range.start + ':' + range.end
    if (!force && calendarScheduleCache.key === key && Date.now() - calendarScheduleCache.loadedAt < 30000) {
      return Promise.resolve(calendarScheduleCache.items)
    }
    return fetchSchedules(range.start, range.end).then(function (items) {
      calendarScheduleCache = {
        key: key,
        items: (items || []).map(normalizeScheduleItem),
        loadedAt: Date.now()
      }
      return calendarScheduleCache.items
    })
  }

  function schedulesForDate(date) {
    var dateText = formatDate(date)
    return calendarScheduleCache.items.filter(function (item) {
      return item.scheduleDate === dateText
    }).sort(function (a, b) {
      return String(a.scheduleTime || '').localeCompare(String(b.scheduleTime || ''))
    })
  }

  function getCalendarCardDate(card, index) {
    var focused = getFocusedDate ? getFocusedDate() : new Date()
    if (card.classList.contains('calendar-day-card')) {
      var first = new Date(focused.getFullYear(), focused.getMonth(), 1)
      var start = addDays(first, -first.getDay())
      return addDays(start, index)
    }
    var strong = card.querySelector('strong, .day-number')
    var text = strong ? strong.textContent : ''
    var nums = (text.match(/\d+/g) || []).map(Number)
    if (nums.length >= 2) return new Date(focused.getFullYear(), nums[0] - 1, nums[1])
    if (nums.length === 1) return new Date(focused.getFullYear(), focused.getMonth(), nums[0])
    return null
  }

  function renderScheduleRowsFromApi(items, label) {
    var card = document.querySelector('.schedule-list-card')
    if (!card) return
    cleanupHardcodedCalendarRows()
    var list = card.querySelector('.api-schedule-list')
    if (!list) {
      list = document.createElement('div')
      list.className = 'api-schedule-list'
      card.appendChild(list)
    }
    var schedules = (items || []).slice().sort(function (a, b) {
      return String(a.scheduleDate || '').localeCompare(String(b.scheduleDate || '')) ||
        String(a.scheduleTime || '').localeCompare(String(b.scheduleTime || ''))
    })
    window.__familyScheduleItemsById = window.__familyScheduleItemsById || {}
    schedules.forEach(function (item) {
      window.__familyScheduleItemsById[String(item.id)] = item
    })
    setScheduleListContext(label || '\uC77C\uC815\uD45C', schedules.length + '\uAC74')
    if (!schedules.length) {
      list.innerHTML = '<p class="empty-note">\uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
      return
    }
    list.innerHTML = schedules.map(function (item) {
      var date = new Date(String(item.scheduleDate || todayText()) + 'T00:00:00')
      var weekday = formatKoreanShortDate(date).replace(/^.*\((.)\).*$/, '$1')
      return '<div class="schedule-row api-schedule-row" role="button" tabindex="0" data-api-schedule-id="' + escapeHtml(item.id) + '">' +
        '<span class="schedule-date-badge"><strong>' + date.getDate() + '</strong><span>' + escapeHtml(weekday) + '</span></span>' +
        '<div><strong>' + escapeHtml(item.title || '\uC77C\uC815') + '</strong><p>' + escapeHtml(scheduleTimeText(item) + ' \u00B7 ' + (item.category || '\uC77C\uC815') + (item.memberName ? ' \u00B7 ' + item.memberName : '')) + '</p><small>' + escapeHtml(item.memo || '') + '</small></div>' +
        '<div class="schedule-row-actions"><button type="button" class="edit-button">\uC218\uC815</button><button type="button" class="danger-button">\uC0AD\uC81C</button></div>' +
        '</div>'
    }).join('')
    list.querySelectorAll('.api-schedule-row').forEach(function (row, index) {
      var item = schedules[index]
      var editButton = row.querySelector('.schedule-row-actions .edit-button')
      var deleteButton = row.querySelector('.schedule-row-actions .danger-button')
      if (editButton) {
        editButton.addEventListener('click', function (event) {
          event.preventDefault()
          event.stopPropagation()
          if (event.stopImmediatePropagation) event.stopImmediatePropagation()
          startScheduleApiEdit(item)
        })
      }
      if (deleteButton) {
        deleteButton.addEventListener('click', function (event) {
          event.preventDefault()
          event.stopPropagation()
          if (event.stopImmediatePropagation) event.stopImmediatePropagation()
          deleteScheduleApiItem(item, function () {
            renderCalendarApiSchedules(true)
          })
        })
      }
      row.addEventListener('click', function (event) {
        if (event.target && event.target.closest && event.target.closest('.schedule-row-actions button')) return
        openScheduleApiDetail(item)
      })
      row.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        openScheduleApiDetail(item)
      })
    })
  }

  function renderCalendarApiSchedules(force) {
    if (!document.querySelector('.family-calendar-panel')) return Promise.resolve([])
    removeDeveloperServerPanels()
    var mode = getActiveCalendarMode ? getActiveCalendarMode() : 'month'
    var requestMode = mode
    if (mode === 'year') {
      if (force) {
        window.__familyYearScheduleCache = null
        window.__familyYearMonthListState = null
      }
      renderYearSelectedMonthList(getYearSelectedMonthDate(), false)
      return Promise.resolve([])
    }
    var label = mode === 'day' ? '\uC77C\uAC04 \uC77C\uC815\uD45C' : (mode === 'week' ? '\uC8FC\uAC04 \uC77C\uC815\uD45C' : '\uC6D4\uAC04 \uC77C\uC815\uD45C')
    document.querySelectorAll('.family-calendar-panel .calendar-day-card, .family-calendar-panel .fc-day').forEach(function (card) {
      card.removeAttribute('data-api-chip-title')
      card.removeAttribute('data-api-chip-count')
    })
    if (!getStoredAuthToken()) {
      renderScheduleRowsFromApi([], label)
      return Promise.resolve([])
    }
    return loadCalendarScheduleCache(force).then(function (items) {
      if (getActiveCalendarMode && getActiveCalendarMode() !== requestMode) return []
      var grouped = {}
      ;(items || []).forEach(function (item) {
        var key = String(item.scheduleDate || '')
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(item)
      })
      document.querySelectorAll('.family-calendar-panel .calendar-day-card, .family-calendar-panel .fc-day').forEach(function (card, index) {
        var date = getCalendarCardDate(card, index)
        if (!date) return
        var dayItems = grouped[formatDate(date)] || []
        if (!dayItems.length) return
        card.setAttribute('data-api-chip-title', dayItems[0].title || '\uC77C\uC815')
        if (dayItems.length > 1) card.setAttribute('data-api-chip-count', '+' + (dayItems.length - 1))
      })
      renderScheduleRowsFromApi(items, label)
      return items
    })
  }

  function openCalendarApiDayPopup(date, sourceItems) {
    var items = (sourceItems || schedulesForDate(date)).map(normalizeScheduleItem)
    var old = document.querySelector('.schedule-day-patch-backdrop')
    if (old) old.remove()
    if (!items.length) return false
    if (items.length === 1) {
      openScheduleApiDetail(items[0])
      return true
    }

    var backdrop = document.createElement('div')
    backdrop.className = 'schedule-day-patch-backdrop schedule-detail-patch-backdrop'
    var dialog = document.createElement('section')
    dialog.className = 'schedule-day-patch-dialog schedule-detail-patch-dialog'
    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'schedule-detail-patch-close'
    close.textContent = 'x'
    close.addEventListener('click', function () { backdrop.remove() })
    var dateLabel = document.createElement('span')
    dateLabel.className = 'schedule-detail-patch-date'
    dateLabel.textContent = formatKoreanShortDate(date)
    var heading = document.createElement('h2')
    heading.textContent = '\uC120\uD0DD\uC77C \uC77C\uC815'
    var list = document.createElement('div')
    list.className = 'schedule-day-patch-list'
    items.forEach(function (item) {
      var button = document.createElement('button')
      button.type = 'button'
      button.textContent = scheduleTimeText(item) + ' ' + item.title
      button.addEventListener('click', function () {
        openScheduleApiDetail(item, { keepParent: true })
      })
      list.appendChild(button)
    })
    dialog.appendChild(close)
    dialog.appendChild(dateLabel)
    dialog.appendChild(heading)
    dialog.appendChild(list)
    backdrop.appendChild(dialog)
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) backdrop.remove()
    })
    document.body.appendChild(backdrop)
    return true
  }

  function renderHomeSchedulesFromApi(force) {
    var todayPanel = document.querySelector('.home-today-schedule')
    var list = todayPanel && todayPanel.querySelector('.task-list')
    if (!list || todayPanel.dataset.apiLoading === 'true') return
    if (!force && todayPanel.dataset.apiBacked === 'true') return
    todayPanel.dataset.apiLoading = 'true'

    var today = todayText()
    fetchSchedules(today, today).then(function (items) {
      todayPanel.dataset.apiLoading = 'false'
      todayPanel.dataset.apiBacked = 'true'
      if (!items.length) {
        list.innerHTML = '<li class="api-empty-row"><span></span><strong>\uC624\uB298 \uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</strong><small>\uCE98\uB9B0\uB354\uC5D0\uC11C \uC77C\uC815\uC744 \uCD94\uAC00\uD574\uBCF4\uC138\uC694.</small></li>'
        return
      }
      list.innerHTML = items.slice(0, 5).map(function (item) {
        return '<li data-api-schedule-id="' + item.id + '"><span></span><strong>' +
          escapeHtml(scheduleTimeText(item) + ' ' + item.title) +
          '</strong><small>' + escapeHtml((item.category || '\uC77C\uC815') + (item.memberName ? ' · ' + item.memberName : '')) +
          '</small></li>'
      }).join('')
    })
  }

  function emptyRow(message, detail) {
    return '<div class="api-empty-row"><strong>' + escapeHtml(message) + '</strong>' +
      (detail ? '<small>' + escapeHtml(detail) + '</small>' : '') + '</div>'
  }

  function setMetricValue(metric, value) {
    if (!metric) return
    var strong = metric.querySelector('strong')
    if (strong) strong.textContent = value
  }

  function resetHomeMetrics(metrics) {
    setMetricValue(metrics[0], '0\uC6D0')
    setMetricValue(metrics[1], '0\uC6D0')
    setMetricValue(metrics[2], '0\uAC1C')
    setMetricValue(metrics[3], '0\uBA85')
  }

  function fetchFamilyMembers() {
    if (!getStoredAuthToken()) return Promise.resolve([])
    return getCurrentFamilyId().then(function (familyId) {
      return apiRequest('/families/' + encodeURIComponent(familyId) + '/members')
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function calculateTripTotal(trips) {
    return Promise.all((trips || []).slice(0, 30).map(function (trip) {
      return fetchTripRecords(trip.id).then(function (records) {
        return records.reduce(function (sum, item) {
          return sum + Number(item.amount || 0)
        }, 0)
      })
    })).then(function (totals) {
      return totals.reduce(function (sum, value) { return sum + value }, 0)
    })
  }

  function countBabyRecords(babies) {
    var range = monthRangeFor(todayText())
    return Promise.all((babies || []).slice(0, 20).map(function (baby) {
      return fetchBabyRecords(baby.id, range.start, range.end).then(function (records) {
        return records.length
      })
    })).then(function (counts) {
      return counts.reduce(function (sum, value) { return sum + value }, 0)
    })
  }

  function renderHomeMetricsFromApi(force) {
    var metrics = Array.from(document.querySelectorAll('.metric-grid .metric'))
    if (!metrics.length || (!force && document.documentElement.dataset.homeMetricsApiBacked === 'true')) return
    if (!getStoredAuthToken()) {
      resetHomeMetrics(metrics)
      return
    }
    var requestSeq = ++homeMetricsRequestSeq
    var firstLoad = document.documentElement.dataset.homeMetricsApiBacked !== 'true'
    document.documentElement.dataset.homeMetricsApiBacked = 'true'
    var range = monthRangeFor(todayText())
    Promise.all([
      fetchLedgerSummary(range.start, range.end),
      fetchTrips().then(calculateTripTotal),
      fetchBabies().then(countBabyRecords),
      fetchFamilyMembers()
    ]).then(function (results) {
      if (requestSeq !== homeMetricsRequestSeq) return
      setMetricValue(metrics[0], Number((results[0] && results[0].expense) || 0).toLocaleString('ko-KR') + '\uC6D0')
      setMetricValue(metrics[1], Number(results[1] || 0).toLocaleString('ko-KR') + '\uC6D0')
      setMetricValue(metrics[2], Number(results[2] || 0).toLocaleString('ko-KR') + '\uAC1C')
      setMetricValue(metrics[3], Number((results[3] && results[3].length) || 0).toLocaleString('ko-KR') + '\uBA85')
    }).catch(function () {
      if (firstLoad && requestSeq === homeMetricsRequestSeq) resetHomeMetrics(metrics)
    })
  }

  function renderHomeLedgerFromApi(force) {
    var table = document.querySelector('.content-grid .panel.wide .ledger-table')
    if (!table) return
    if (table.dataset.apiHomeLedgerInitialized !== 'true') {
      table.dataset.apiHomeLedgerInitialized = 'true'
      table.innerHTML = emptyRow('\uCD5C\uADFC \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
    }
    if (!getStoredAuthToken()) {
      table.dataset.apiBacked = 'true'
      table.dataset.apiLoading = 'false'
      table.innerHTML = emptyRow('\uCD5C\uADFC \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
      return
    }
    if (table.dataset.apiLoading === 'true') return
    if (!force && table.dataset.apiBacked === 'true') return
    table.dataset.apiLoading = 'true'
    var requestSeq = ++homeLedgerRequestSeq
    if (table.dataset.apiBacked !== 'true') {
      table.innerHTML = emptyRow('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.', '')
    }

    var range = monthRangeFor(todayText())
    fetchLedgerEntries(range.start, range.end).then(function (items) {
      if (requestSeq !== homeLedgerRequestSeq) return
      table.dataset.apiLoading = 'false'
      table.dataset.apiBacked = 'true'
      if (!items.length) {
        table.innerHTML = emptyRow('\uCD5C\uADFC \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
        return
      }
      items.forEach(storeLedgerItemForDetail)
      table.innerHTML = items.slice(0, 5).map(function (item) {
        return '<div class="ledger-row api-ledger-row" data-api-ledger-id="' + item.id + '">' +
          '<div><strong>' + escapeHtml(item.title) + '</strong><span>' +
          escapeHtml((item.transactionDate || '').replace(/-/g, '.') + ' · ' + (item.category || '-') + ' · ' + (item.memberName || '-')) +
          '</span></div><span>' + escapeHtml(item.paymentMethod || '-') + '</span><b class="' + escapeHtml(item.entryType || 'expense') + '">' +
          escapeHtml(moneyText(item.amount, item.entryType)) + '</b></div>'
      }).join('')
    }).catch(function () {
      if (requestSeq !== homeLedgerRequestSeq) return
      table.dataset.apiLoading = 'false'
      table.dataset.apiBacked = 'true'
      table.innerHTML = emptyRow('\uCD5C\uADFC \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
    })
  }

  function formatLedgerDateLabel(dateText) {
    if (!dateText) return '\uB0A0\uC9DC \uBBF8\uC815'
    return new Date(dateText + 'T00:00:00').toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    })
  }

  function storeLedgerItemForDetail(item) {
    if (!item || item.id == null) return
    window.__familyLedgerItemsById = window.__familyLedgerItemsById || {}
    window.__familyLedgerItemsById[String(item.id)] = item
  }

  function resolveLedgerItemForDetail(entryId) {
    var id = String(entryId || '')
    if (!id) return Promise.resolve(null)
    var cached = window.__familyLedgerItemsById && window.__familyLedgerItemsById[id]
    if (cached) return Promise.resolve(cached)
    var range = getLedgerPageRange()
    return fetchLedgerEntries(range.start, range.end).then(function (items) {
      ;(items || []).forEach(storeLedgerItemForDetail)
      return (window.__familyLedgerItemsById && window.__familyLedgerItemsById[id]) || null
    })
  }

  function getLedgerPageRange() {
    var text = getCleanText(document.querySelector('.filter-panel'))
    var monthMatch = text.match(/(\d{4})\uB144\s*(\d{1,2})\uC6D4/)
    if (monthMatch) {
      var monthDate = monthMatch[1] + '-' + String(Number(monthMatch[2])).padStart(2, '0') + '-01'
      return monthRangeFor(monthDate)
    }
    return monthRangeFor(todayText())
  }

  function getLedgerListHost() {
    var existing = document.querySelector('.daily-ledger')
    if (existing) return existing
    var panel = Array.from(document.querySelectorAll('.content-grid .panel.wide, .content-grid .panel')).find(function (candidate) {
      return candidate.querySelector('.ledger-summary') && (candidate.querySelector('.sms-parser') || candidate.querySelector('.parser-box'))
    })
    if (!panel) return null
    var host = panel.querySelector('.api-ledger-list-host')
    if (!host) {
      host = document.createElement('section')
      host.className = 'daily-ledger api-ledger-list-host'
      var empty = panel.querySelector('.empty-message')
      if (empty) {
        empty.replaceWith(host)
      } else {
        var message = panel.querySelector('.form-message') || panel.querySelector('.sms-parser') || panel.querySelector('.parser-box')
        if (message) message.insertAdjacentElement('afterend', host)
        else panel.appendChild(host)
      }
    }
    return host
  }

  function pageHeadingIs(label) {
    return Array.from(document.querySelectorAll('h1')).some(function (heading) {
      return getCleanText(heading) === label
    })
  }

  function renderLedgerPageFromApi(force) {
    if (!pageHeadingIs('\uAC00\uACC4\uBD80')) return
    var summary = document.querySelector('.ledger-summary')
    var daily = getLedgerListHost()
    if (!summary && !daily) return
    var range = getLedgerPageRange()
    var key = range.start + ':' + range.end
    if (daily && daily.dataset.apiLoading === 'true' && daily.dataset.apiPendingKey === key) return
    if (!force && daily && daily.dataset.apiRangeKey === key && (!summary || summary.dataset.apiRangeKey === key)) return
    var requestSeq = ++ledgerPageRequestSeq
    if (daily) {
      daily.dataset.apiLoading = 'true'
      daily.dataset.apiPendingKey = key
    }
    if (summary) summary.dataset.apiPendingKey = key

    fetchLedgerSummary(range.start, range.end).then(function (values) {
      if (requestSeq !== ledgerPageRequestSeq) return
      if (!pageHeadingIs('\uAC00\uACC4\uBD80')) return
      if (summary && summary.dataset.apiPendingKey !== key) return
      var cards = summary ? Array.from(summary.querySelectorAll('.metric strong')) : []
      setMetricValue(cards[0] && cards[0].closest('.metric'), Number(values.expense || 0).toLocaleString('ko-KR') + '\uC6D0')
      setMetricValue(cards[1] && cards[1].closest('.metric'), Number(values.income || 0).toLocaleString('ko-KR') + '\uC6D0')
      setMetricValue(cards[2] && cards[2].closest('.metric'), Number(values.total || 0).toLocaleString('ko-KR') + '\uC6D0')
      if (summary) summary.dataset.apiRangeKey = key
    })

    if (!daily) return
    if (daily.dataset.apiBacked !== 'true') {
      daily.innerHTML = emptyRow('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.', '')
    }
    fetchLedgerEntries(range.start, range.end).then(function (items) {
      if (requestSeq !== ledgerPageRequestSeq) return
      if (!pageHeadingIs('\uAC00\uACC4\uBD80')) return
      if (daily.dataset.apiPendingKey !== key) return
      daily.dataset.apiLoading = 'false'
      daily.dataset.apiBacked = 'true'
      daily.dataset.apiRangeKey = key
      window.__familyLedgerItemsById = {}
      if (!items.length) {
        daily.innerHTML = emptyRow('\uD574\uB2F9 \uAE30\uAC04\uC758 \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
        return
      }
      var groups = items.reduce(function (map, item) {
        var date = item.transactionDate || item.txDate || ''
        map[date] = map[date] || []
        map[date].push(item)
        return map
      }, {})
      daily.innerHTML = Object.keys(groups).sort().reverse().map(function (date) {
        var rows = groups[date].slice().sort(function (a, b) {
          return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
        })
        rows.forEach(function (item) {
          storeLedgerItemForDetail(item)
        })
        return '<section class="api-ledger-day">' +
          '<header><strong>' + escapeHtml(formatLedgerDateLabel(date)) + '</strong></header>' +
          rows.map(function (item) {
            return '<div class="ledger-row api-ledger-row" data-api-ledger-id="' + item.id + '">' +
              '<div><strong>' + escapeHtml(item.title || '') + '</strong><span>' +
              escapeHtml((item.category || '-') + ' \u00B7 ' + (item.memberName || '-') + ' \u00B7 ' + (item.paymentMethod || '-')) +
              '</span></div><b class="' + escapeHtml(item.entryType || 'expense') + '">' +
              escapeHtml(moneyText(item.amount, item.entryType)) + '</b><div class="ledger-row-actions">' +
              '<button type="button" data-ledger-edit-id="' + escapeHtml(item.id) + '">\uC218\uC815</button>' +
              '<button type="button" class="danger-button" data-ledger-delete-id="' + escapeHtml(item.id) + '">\uC0AD\uC81C</button>' +
              '</div></div>'
          }).join('') +
          '</section>'
      }).join('')
    }).catch(function () {
      if (requestSeq !== ledgerPageRequestSeq) return
      daily.dataset.apiLoading = 'false'
      daily.dataset.apiBacked = 'true'
      daily.dataset.apiRangeKey = key
      daily.innerHTML = emptyRow('\uD574\uB2F9 \uAE30\uAC04\uC758 \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
    })
  }

  function setLedgerDateValue(form, value) {
    var date = parseApiDate(value) || todayText()
    Array.from(form.querySelectorAll('.date-picker-field, label')).forEach(function (field) {
      var fieldText = getCleanText(field)
      if (fieldText.indexOf('\uAC70\uB798\uC77C') < 0 && fieldText.indexOf('\uB0A0\uC9DC') < 0) return
      var triggerText = field.querySelector('.date-picker-trigger span')
      if (triggerText) triggerText.textContent = date.replace(/-/g, '.')
      field.querySelectorAll('input').forEach(function (input) {
        setInputValue(input, input.type === 'date' ? date : date.replace(/-/g, '.'))
      })
    })
  }

  function findLedgerForm() {
    return Array.from(document.querySelectorAll('.ledger-form, .entry-panel, form')).find(function (form) {
      var text = getCleanText(form)
      return (text.indexOf('\uAC70\uB798\uC77C') >= 0 || text.indexOf('\uB0A0\uC9DC') >= 0) && text.indexOf('\uAE08\uC561') >= 0
    })
  }

  function fillLedgerFormForEdit(item) {
    var form = findLedgerForm()
    if (!form || !item) return false
    var editId = String(item.id || '')
    form.dataset.apiLedgerEditId = editId
    window.__familyEditingLedgerId = editId
    var ledgerShell = form.closest('.ledger-form, .entry-panel, aside, section, article')
    if (ledgerShell) ledgerShell.dataset.apiLedgerEditId = editId
    var ledgerInner = form.classList && form.classList.contains('ledger-form') ? form : form.querySelector('.ledger-form')
    if (ledgerInner) ledgerInner.dataset.apiLedgerEditId = editId
    setInputValueByLabel(form, '\uB0B4\uC5ED', item.title || '')
      || setInputValueByLabel(form, '\uC81C\uBAA9', item.title || '')
      || setInputValueByLabel(form, '\uAC00\uB9F9\uC810/\uB0B4\uC6A9', item.title || '')
      || setScheduleTextInputAt(form, 0, item.title || '')
    setInputValueByLabel(form, '\uAE08\uC561', Number(item.amount || 0).toLocaleString('ko-KR'))
    setInputValueByLabel(form, '\uBA54\uBAA8', item.memo || '')
    setLedgerDateValue(form, item.transactionDate)
    setCustomSelectValueByLabel(form, '\uAD6C\uBD84', item.entryType === 'income' ? '\uC218\uC785' : '\uC9C0\uCD9C')
    setCustomSelectValueByLabel(form, '\uCE74\uD14C\uACE0\uB9AC', item.category || '')
    setCustomSelectValueByLabel(form, '\uACB0\uC81C\uC218\uB2E8', item.paymentMethod || '')
    setCustomSelectValueByLabel(form, '\uC0AC\uC6A9\uC790', item.memberName || '')
    setCustomSelectValueByLabel(form, '\uAC00\uC871', item.memberName || '')
    var submit = form.querySelector('button[type="submit"], .submit-action')
    if (submit) {
      submit.textContent = '\uC800\uC7A5'
      submit.dataset.ledgerEditSubmit = 'true'
      submit.onclick = function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation) event.stopImmediatePropagation()
        submitLedgerEdit(form)
        return false
      }
    }
    var target = form.querySelector('input, textarea, .custom-select-trigger, .date-picker-trigger')
    if (target) target.focus()
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return true
  }

  function showLedgerDetail(item) {
    if (!item) {
      showPatchToast('\uC0C1\uC138\uB97C \uBCFC \uB0B4\uC5ED\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      return
    }
    var old = document.querySelector('.patch-ledger-detail-backdrop')
    if (old) old.remove()
    var backdrop = document.createElement('div')
    backdrop.className = 'patch-ledger-detail-backdrop'
    backdrop.innerHTML = [
      '<section class="patch-ledger-detail-dialog">',
      '<button type="button" class="dialog-close" data-ledger-detail-close>\u00D7</button>',
      '<span class="ledger-detail-chip">' + escapeHtml(item.entryType === 'income' ? '\uC218\uC785' : '\uC9C0\uCD9C') + '</span>',
      '<h2>' + escapeHtml(item.title || '\uB0B4\uC5ED \uC5C6\uC74C') + '</h2>',
      '<strong class="ledger-detail-amount ' + escapeHtml(item.entryType || 'expense') + '">' + escapeHtml(moneyText(item.amount, item.entryType)) + '</strong>',
      '<dl>',
      '<div><dt>\uAC70\uB798\uC77C</dt><dd>' + escapeHtml((item.transactionDate || '').replace(/-/g, '.')) + '</dd></div>',
      '<div><dt>\uCE74\uD14C\uACE0\uB9AC</dt><dd>' + escapeHtml(item.category || '-') + '</dd></div>',
      '<div><dt>\uACB0\uC81C\uC218\uB2E8</dt><dd>' + escapeHtml(item.paymentMethod || '-') + '</dd></div>',
      '<div><dt>\uC0AC\uC6A9\uC790</dt><dd>' + escapeHtml(item.memberName || '-') + '</dd></div>',
      '</dl>',
      '<p>' + escapeHtml(item.memo || '\uBA54\uBAA8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.') + '</p>',
      '<div class="ledger-detail-actions">',
      '<button type="button" class="edit-button" data-ledger-detail-edit="' + escapeHtml(item.id) + '">\uC218\uC815</button>',
      '<button type="button" class="danger-button" data-ledger-detail-delete="' + escapeHtml(item.id) + '">\uC0AD\uC81C</button>',
      '</div>',
      '</section>'
    ].join('')
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop || event.target.closest('[data-ledger-detail-close]')) {
        backdrop.remove()
        return
      }
      var edit = event.target.closest('[data-ledger-detail-edit]')
      if (edit) {
        backdrop.remove()
        if (!fillLedgerFormForEdit(item)) showPatchToast('\uC218\uC815\uD560 \uB300\uC0C1\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
        return
      }
      var del = event.target.closest('[data-ledger-detail-delete]')
      if (del) {
        deleteLedgerEntry(del.dataset.ledgerDetailDelete)
      }
    })
    document.body.appendChild(backdrop)
  }

  function ledgerPayloadFromForm(form) {
    return {
      title: getInputValueByLabel(form, '\uB0B4\uC6A9') || getInputValueByLabel(form, '\uB0B4\uC5ED') || getInputValueByLabel(form, '\uC81C\uBAA9') || getInputValueByLabel(form, '\uAC00\uB9F9\uC810/\uB0B4\uC6A9') || firstInputValue(form),
      entryType: normalizeLedgerType(getCustomSelectValue('\uAD6C\uBD84')),
      category: getCustomSelectValue('\uCE74\uD14C\uACE0\uB9AC') || null,
      paymentMethod: getCustomSelectValue('\uACB0\uC81C\uC218\uB2E8') || null,
      memberName: getCustomSelectValue('\uC0AC\uC6A9\uC790') || getCustomSelectValue('\uAC00\uC871') || null,
      amount: parseAmountValue(getInputValueByLabel(form, '\uAE08\uC561') || getFieldValue(form, '[data-field="ledger-amount"]') || getFieldValue(form, 'input[inputmode="numeric"]')),
      transactionDate: getDatePickerValue(form, '\uB0A0\uC9DC') || getDatePickerValue(form, '\uAC70\uB798\uC77C'),
      memo: getInputValueByLabel(form, '\uBA54\uBAA8') || ''
    }
  }

  function refreshLedgerAfterMutation() {
    var daily = document.querySelector('.daily-ledger')
    if (daily) delete daily.dataset.apiRangeKey
    var summary = document.querySelector('.ledger-summary')
    if (summary) delete summary.dataset.apiRangeKey
    renderLedgerPageFromApi(true)
    renderHomeMetricsFromApi(true)
    renderHomeLedgerFromApi(true)
  }

  function isLedgerEntryForm(form) {
    if (!form || !pageHeadingIs('\uAC00\uACC4\uBD80')) return false
    var text = getCleanText(form)
    return text.indexOf('\uAE08\uC561') >= 0 && (text.indexOf('\uB0B4\uC6A9') >= 0 || text.indexOf('\uAC00\uB9F9\uC810/\uB0B4\uC6A9') >= 0)
  }

  function focusLedgerField(form, labelText) {
    var label = findLabelByText(form, labelText)
    var target = label && label.querySelector('input, textarea, button')
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(function () {
      target.focus()
    }, 120)
  }

  function resetLedgerCreateForm(form) {
    setInputValueByLabel(form, '\uB0B4\uC6A9', '')
      || setInputValueByLabel(form, '\uAC00\uB9F9\uC810/\uB0B4\uC6A9', '')
      || setScheduleTextInputAt(form, 0, '')
    setInputValueByLabel(form, '\uAE08\uC561', '')
    setInputValueByLabel(form, '\uBA54\uBAA8', '')
    setLedgerDateValue(form, todayText())
    normalizeLedgerEntryForm()
  }

  function getLedgerEditId(form) {
    if (!form) return ''
    var node = form
    while (node && node !== document) {
      if (node.dataset && node.dataset.apiLedgerEditId) return node.dataset.apiLedgerEditId
      node = node.parentElement
    }
    var inner = form.querySelector && form.querySelector('.ledger-form[data-api-ledger-edit-id]')
    return (inner && inner.dataset.apiLedgerEditId) || window.__familyEditingLedgerId || ''
  }

  function clearLedgerEditMode(form) {
    if (!form) return
    var node = form
    while (node && node !== document) {
      if (node.dataset) delete node.dataset.apiLedgerEditId
      node = node.parentElement
    }
    if (form.querySelectorAll) {
      form.querySelectorAll('[data-api-ledger-edit-id]').forEach(function (item) {
        delete item.dataset.apiLedgerEditId
      })
    }
    window.__familyEditingLedgerId = ''
    var submit = form.querySelector('button[type="submit"], .submit-action')
    if (submit) {
      submit.textContent = '\uCD94\uAC00'
      delete submit.dataset.ledgerEditSubmit
    }
  }

  function validateLedgerPayload(form, payload) {
    if (!payload.title) {
      showPatchToast('\uB0B4\uC6A9\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
      focusLedgerField(form, '\uB0B4\uC6A9')
      return false
    }
    if (!payload.amount) {
      showPatchToast('\uAE08\uC561\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
      focusLedgerField(form, '\uAE08\uC561')
      return false
    }
    if (!parseApiDate(payload.transactionDate)) {
      showPatchToast('\uB0A0\uC9DC\uB294 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
      focusLedgerField(form, '\uB0A0\uC9DC')
      return false
    }
    return true
  }

  function submitLedgerCreate(form) {
    if (!isLedgerEntryForm(form) || form.dataset.ledgerCreateSubmitting === 'true') return
    var payload = ledgerPayloadFromForm(form)
    if (!validateLedgerPayload(form, payload)) return
    var submit = form.querySelector('button[type="submit"], .submit-action')
    form.dataset.ledgerCreateSubmitting = 'true'
    if (submit) {
      submit.disabled = true
      submit.textContent = '\uCD94\uAC00 \uC911'
    }
    getReadableFamilyId().then(function (familyId) {
      return postJson('/ledger-entries?familyId=' + encodeURIComponent(familyId), payload)
    }).then(function () {
      showPatchToast('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.')
      resetLedgerCreateForm(form)
      refreshLedgerAfterMutation()
    }).catch(function (error) {
      showPatchToast(apiActionErrorMessage(error, '\uAC00\uACC4\uBD80 \uCD94\uAC00\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
    }).finally(function () {
      delete form.dataset.ledgerCreateSubmitting
      if (submit) {
        submit.disabled = false
        submit.textContent = '\uCD94\uAC00'
      }
    })
  }

  function submitLedgerEdit(form) {
    var entryId = getLedgerEditId(form)
    if (!entryId || form.dataset.ledgerEditSubmitting === 'true') return
    var payload = ledgerPayloadFromForm(form)
    if (!validateLedgerPayload(form, payload)) return
    showPatchConfirm('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uC218\uC815\uD560\uAE4C\uC694?', function () {
      form.dataset.ledgerEditSubmitting = 'true'
      getCurrentFamilyId().then(function (familyId) {
        return apiRequest('/ledger-entries/' + encodeURIComponent(entryId) + '?familyId=' + encodeURIComponent(familyId), {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
      }).then(function () {
        clearLedgerEditMode(form)
        showPatchToast('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.')
        refreshLedgerAfterMutation()
      }).catch(function (error) {
        showPatchToast(apiActionErrorMessage(error, '\uAC00\uACC4\uBD80 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      }).finally(function () {
        delete form.dataset.ledgerEditSubmitting
      })
    })
  }

  function deleteLedgerEntry(entryId) {
    if (!entryId) return
    showPatchConfirm('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
      apiRequest('/ledger-entries/' + encodeURIComponent(entryId), { method: 'DELETE' }).then(function () {
        showPatchToast('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
        refreshLedgerAfterMutation()
      }).catch(function (error) {
        showPatchToast(apiActionErrorMessage(error, '\uAC00\uACC4\uBD80 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      })
    })
  }

  function fetchRestaurants() {
    return getReadableFamilyId().then(function (familyId) {
      return apiRequest('/restaurants?familyId=' + encodeURIComponent(familyId)).then(function (items) {
        return Array.isArray(items) ? items : []
      })
    })
  }

  function restaurantPayloadFromForm(form) {
    var locationInput = form.querySelector('[data-restaurant-location]')
    return {
      name: getFieldValue(form, '[data-restaurant-name]'),
      menu: getFieldValue(form, '[data-restaurant-menu]') || null,
      price: parseAmountValue(getFieldValue(form, '[data-restaurant-price]')) || null,
      rating: Number(getFieldValue(form, '[data-restaurant-rating]')) || null,
      visitDate: getFieldValue(form, '[data-restaurant-visit-date]') || todayText(),
      location: getFieldValue(form, '[data-restaurant-location]') || null,
      address: getFieldValue(form, '[data-restaurant-address]') || null,
      latitude: Number(form.dataset.latitude || (locationInput && locationInput.dataset.latitude) || '') || null,
      longitude: Number(form.dataset.longitude || (locationInput && locationInput.dataset.longitude) || '') || null,
      scope: getFieldValue(form, '[data-restaurant-scope]') || '\uC804\uCCB4 \uAC00\uC871',
      memo: getFieldValue(form, '[data-restaurant-memo]') || null,
      mediaUrls: []
    }
  }

  function clearRestaurantForm(form) {
    if (!form) return
    form.dataset.editId = ''
    form.querySelectorAll('input, textarea').forEach(function (input) {
      if (input.matches('[data-restaurant-visit-date]')) setOptionalInputValue(input, todayText())
      else setOptionalInputValue(input, '')
      delete input.dataset.latitude
      delete input.dataset.longitude
      delete input.dataset.placeAddress
    })
    delete form.dataset.latitude
    delete form.dataset.longitude
    var mapBox = form.querySelector('.restaurant-location-map-box')
    if (mapBox) mapBox.remove()
    renderRestaurantDefaultLocationMap(form.querySelector('[data-restaurant-location]'))
    var scope = form.querySelector('[data-restaurant-scope]')
    if (scope) setOptionalInputValue(scope, '\uC804\uCCB4 \uAC00\uC871')
    var submit = form.querySelector('button[type="submit"]')
    if (submit) submit.textContent = '\uCD94\uAC00'
  }

  function fillRestaurantForm(form, item) {
    if (!form || !item) return
    form.dataset.editId = String(item.id || '')
    setOptionalInputValue(form.querySelector('[data-restaurant-name]'), item.name || '')
    setOptionalInputValue(form.querySelector('[data-restaurant-menu]'), item.menu || '')
    setOptionalInputValue(form.querySelector('[data-restaurant-price]'), item.price != null ? String(Math.round(Number(item.price))) : '')
    setOptionalInputValue(form.querySelector('[data-restaurant-rating]'), item.rating != null ? String(item.rating) : '')
    setOptionalInputValue(form.querySelector('[data-restaurant-visit-date]'), item.visitDate || todayText())
    setOptionalInputValue(form.querySelector('[data-restaurant-location]'), item.location || '')
    setOptionalInputValue(form.querySelector('[data-restaurant-address]'), item.address || '')
    setOptionalInputValue(form.querySelector('[data-restaurant-scope]'), item.scope || '\uC804\uCCB4 \uAC00\uC871')
    setOptionalInputValue(form.querySelector('[data-restaurant-memo]'), item.memo || '')
    form.dataset.latitude = item.latitude || ''
    form.dataset.longitude = item.longitude || ''
    var locationInput = form.querySelector('[data-restaurant-location]')
    if (locationInput) {
      if (item.latitude) locationInput.dataset.latitude = String(item.latitude)
      else delete locationInput.dataset.latitude
      if (item.longitude) locationInput.dataset.longitude = String(item.longitude)
      else delete locationInput.dataset.longitude
      if (item.address) locationInput.dataset.placeAddress = item.address
      else delete locationInput.dataset.placeAddress
      if (item.latitude && item.longitude) {
        renderRestaurantLocationMap(locationInput, Number(item.latitude), Number(item.longitude), item.location || item.name || '', item.address || '')
      } else {
        var mapBox = form.querySelector('.restaurant-location-map-box')
        if (mapBox) mapBox.remove()
        renderRestaurantDefaultLocationMap(locationInput)
      }
    }
    var submit = form.querySelector('button[type="submit"]')
    if (submit) submit.textContent = '\uC800\uC7A5'
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    var first = form.querySelector('[data-restaurant-name]')
    if (first) window.setTimeout(function () { first.focus() }, 180)
  }

  function renderRestaurantRows(root, items) {
    var list = root.querySelector('[data-restaurant-list]')
    root.querySelectorAll('[data-restaurant-count]').forEach(function (count) {
      count.textContent = (items || []).length + '\uACF3'
    })
    if (!list) return
    if (!items || !items.length) {
      list.innerHTML = '<p class="api-empty-row">\uB4F1\uB85D\uB41C \uB9DB\uC9D1\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
      return
    }
    list.innerHTML = items.map(function (item) {
      var rating = Number(item.rating || 0)
      var meta = [
        item.visitDate ? item.visitDate.replace(/-/g, '.') : '',
        item.price != null ? Number(item.price).toLocaleString('ko-KR') + '\uC6D0' : '',
        item.scope || ''
      ].filter(Boolean)
      var location = item.location || item.address || ''
      var caption = item.menu || location || '\uB300\uD45C \uBA54\uB274\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.'
      var memo = item.memo || item.address || ''
      return '<article class="restaurant-card" data-restaurant-id="' + escapeHtml(item.id) + '">' +
        '<div class="restaurant-empty-photo" aria-hidden="true"><span>\uB9DB\uC9D1</span></div>' +
        '<div class="restaurant-card-body">' +
        '<div class="restaurant-card-top"><strong>' + escapeHtml(item.name || '\uC0C1\uD638\uBA85') + '</strong><span>' + (rating ? '\u2605 ' + escapeHtml(rating) : '') + '</span></div>' +
        '<p>' + escapeHtml(caption) + '</p>' +
        '<div class="restaurant-meta">' + meta.map(function (text) { return '<span>' + escapeHtml(text) + '</span>' }).join('') + '</div>' +
        (memo ? '<em>' + escapeHtml(memo) + '</em>' : '') +
        (location ? '<small>' + escapeHtml(location) + '</small>' : '') +
        '<div class="restaurant-actions"><button type="button" class="edit-button" data-restaurant-edit="' + escapeHtml(item.id) + '">\uC218\uC815</button><button type="button" class="danger-button" data-restaurant-delete="' + escapeHtml(item.id) + '">\uC0AD\uC81C</button></div>' +
        '</div>' +
        '</article>'
    }).join('')
    list.querySelectorAll('[data-restaurant-edit]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation()
        var item = items.find(function (candidate) { return String(candidate.id) === String(button.dataset.restaurantEdit) })
        fillRestaurantForm(root.querySelector('[data-restaurant-form]'), item)
      })
    })
    list.querySelectorAll('[data-restaurant-delete]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation()
        var id = button.dataset.restaurantDelete
        showPatchConfirm('\uB9DB\uC9D1\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
          apiRequest('/restaurants/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
            showPatchToast('\uB9DB\uC9D1\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
            loadRestaurantApiPage(root, true)
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uB9DB\uC9D1 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      })
    })
  }

  function loadRestaurantApiPage(root, force) {
    if (!root || (root.dataset.loaded === 'true' && !force)) return
    root.dataset.loaded = 'true'
    var list = root.querySelector('[data-restaurant-list]')
    if (list) list.innerHTML = '<p class="api-empty-row">\uB9DB\uC9D1\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchRestaurants().then(function (items) {
      root.__restaurantItems = items
      renderRestaurantRows(root, items)
    }).catch(function (error) {
      if (list) list.innerHTML = '<p class="api-empty-row">' + escapeHtml(apiActionErrorMessage(error, '\uB9DB\uC9D1\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')) + '</p>'
    })
  }

  function renderRestaurantPageFromApi() {
    if (!pageHeadingIs('\uB9DB\uC9D1')) return
    clearCustomPatchPageNow()
    removeHardcodedDemoData()
    removeFeaturePlaceholders()

    var content = document.querySelector('.content-grid')
    if (!content) return
    if (content.dataset.restaurantApiReady !== 'true') {
      content.dataset.restaurantApiReady = 'true'
      content.className = 'content-grid'
      content.innerHTML = [
        '<section class="panel restaurant-api-panel">',
        '<div class="panel-header"><h2>\uB9DB\uC9D1</h2><span class="passive-header-chip" data-restaurant-count>0\uACF3</span></div>',
        '<div class="restaurant-hero"><div><span>\uBC29\uBB38\uD55C \uACF3</span><strong>\uAC00\uC871\uACFC \uD568\uAED8 \uAE30\uB85D\uD55C \uB9DB\uC9D1</strong></div><b data-restaurant-count>0\uACF3</b></div>',
        '<div class="restaurant-grid restaurant-api-list" data-restaurant-list></div>',
        '</section>',
        '<aside class="panel entry-panel restaurant-api-form-panel">',
        '<div class="panel-header"><h2>\uB9DB\uC9D1 \uCD94\uAC00</h2></div>',
        '<form class="restaurant-form restaurant-api-form" data-restaurant-form>',
        '<label class="form-field"><span class="form-label">\uC0C1\uD638\uBA85 <em class="required-mark">*</em></span><input class="form-control" data-restaurant-name autocomplete="off" /></label>',
        '<label class="form-field"><span class="form-label">\uB300\uD45C \uBA54\uB274</span><input class="form-control" data-restaurant-menu autocomplete="off" /></label>',
        '<div class="form-row two"><label class="form-field"><span class="form-label">\uAC00\uACA9</span><input class="form-control" data-restaurant-price inputmode="numeric" autocomplete="off" /></label><label class="form-field"><span class="form-label">\uBCC4\uC810</span><input class="form-control" data-restaurant-rating inputmode="decimal" autocomplete="off" /></label></div>',
        '<label class="form-field"><span class="form-label">\uBC29\uBB38\uC77C <em class="required-mark">*</em></span><input class="form-control" data-restaurant-visit-date type="date" value="' + todayText() + '" /></label>',
        '<label class="form-field"><span class="form-label">\uC704\uCE58</span><input class="form-control" data-restaurant-location autocomplete="off" /></label>',
        '<label class="form-field"><span class="form-label">\uC8FC\uC18C</span><input class="form-control" data-restaurant-address autocomplete="off" /></label>',
        '<label class="form-field"><span class="form-label">\uACF5\uAC1C\uBC94\uC704</span><input class="form-control" data-restaurant-scope value="\uC804\uCCB4 \uAC00\uC871" autocomplete="off" /></label>',
        '<label class="form-field"><span class="form-label">\uBA54\uBAA8</span><textarea class="form-control" data-restaurant-memo rows="4"></textarea></label>',
        '<div class="form-actions"><button type="button" class="cancel-button" data-restaurant-reset>\uCD08\uAE30\uD654</button><button type="submit" class="save-button">\uCD94\uAC00</button></div>',
        '</form>',
        '</aside>'
      ].join('')

      var form = content.querySelector('[data-restaurant-form]')
      form.addEventListener('submit', function (event) {
        event.preventDefault()
        var payload = restaurantPayloadFromForm(form)
        if (!payload.name) {
          var nameInput = form.querySelector('[data-restaurant-name]')
          showPatchToast('\uC0C1\uD638\uBA85\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
          if (nameInput) nameInput.focus()
          return
        }
        if (!payload.visitDate) {
          var dateInput = form.querySelector('[data-restaurant-visit-date]')
          showPatchToast('\uBC29\uBB38\uC77C\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
          if (dateInput) dateInput.focus()
          return
        }
        var editId = form.dataset.editId
        var request = editId
          ? function () { return apiRequest('/restaurants/' + encodeURIComponent(editId), { method: 'PUT', body: JSON.stringify(payload) }) }
          : function () { return getReadableFamilyId().then(function (familyId) { return postJson('/restaurants?familyId=' + encodeURIComponent(familyId), payload) }) }
        showPatchConfirm(editId ? '\uB9DB\uC9D1\uC744 \uC218\uC815\uD560\uAE4C\uC694?' : '\uB9DB\uC9D1\uC744 \uCD94\uAC00\uD560\uAE4C\uC694?', function () {
          request().then(function () {
            showPatchToast(editId ? '\uB9DB\uC9D1\uC744 \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.' : '\uB9DB\uC9D1\uC744 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.')
            clearRestaurantForm(form)
            loadRestaurantApiPage(content, true)
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, editId ? '\uB9DB\uC9D1 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.' : '\uB9DB\uC9D1 \uCD94\uAC00\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      })
      var reset = content.querySelector('[data-restaurant-reset]')
      if (reset) reset.addEventListener('click', function () { clearRestaurantForm(form) })
    }
    syncRestaurantMenuState()
    var restaurantForm = content.querySelector('[data-restaurant-form]')
    ensureRestaurantLocationSearch(restaurantForm)
    renderRestaurantDefaultLocationMap(restaurantForm && restaurantForm.querySelector('[data-restaurant-location]'))
    loadRestaurantApiPage(content, false)
  }

  function ensureRestaurantLocationSearch(form) {
    ensureLocationSearch(form, '[data-restaurant-location]', {
      addressSelector: '[data-restaurant-address]',
      storeCoordinatesOnForm: true,
      onSelect: updateRestaurantLocationMapFromSelection
    })
  }

  function updateRestaurantLocationMapFromSelection(input, item, coords) {
    if (!pageHeadingIs('\uB9DB\uC9D1') || !input) return
    var latitude = Number(coords && coords.latitude != null ? coords.latitude : item && item.latitude)
    var longitude = Number(coords && coords.longitude != null ? coords.longitude : item && item.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === 0 || longitude === 0) return
    var form = input.closest('form')
    if (form) {
      form.dataset.latitude = String(latitude)
      form.dataset.longitude = String(longitude)
    }
    var candidates = form && form.querySelector('.location-candidates')
    if (candidates) {
      candidates.hidden = true
      candidates.innerHTML = ''
      window.setTimeout(function () {
        candidates.hidden = true
        candidates.innerHTML = ''
      }, 420)
    }
    window.setTimeout(function () {
      renderRestaurantLocationMap(input, latitude, longitude, locationCandidateLabel(item), locationCandidateDetail(item))
    }, 80)
  }

  function ensureRestaurantLocationMapBox(input) {
    var form = input && input.closest('form')
    var box = form && form.querySelector('.restaurant-location-map-box')
    if (!box) {
      box = document.createElement('div')
      box.className = 'restaurant-location-map-box location-map-box'
      var candidates = form && form.querySelector('.location-candidates')
      var anchor = input && input.closest('label')
      if (candidates) candidates.insertAdjacentElement('afterend', box)
      else if (anchor) anchor.insertAdjacentElement('afterend', box)
    }
    var map = box.querySelector('.restaurant-location-map-osm')
    if (!map) {
      box.innerHTML = ''
      map = document.createElement('div')
      map.className = 'restaurant-location-map-osm location-map-osm'
      box.appendChild(map)
    }
    return map
  }

  function renderRestaurantLocationMap(input, latitude, longitude, title, address) {
    var mapNode = ensureRestaurantLocationMapBox(input)
    if (!mapNode) return
    mapNode.dataset.locationSelected = 'true'
    if (window.L && typeof window.L.map === 'function') {
      try {
        mapNode.innerHTML = ''
        delete mapNode._leaflet_id
        var map = window.L.map(mapNode, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
        map.setView([latitude, longitude], 15)
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map)
        var marker = window.L.marker([latitude, longitude], {
          title: title || address || '\uC704\uCE58'
        }).addTo(map)
        if (title || address) {
          marker.bindPopup('<strong>' + escapeHtml(title || '\uC704\uCE58') + '</strong>' + (address ? '<br />' + escapeHtml(address) : '')).openPopup()
        }
        window.setTimeout(function () { map.invalidateSize() }, 120)
        return
      } catch (error) {
        mapNode.innerHTML = ''
      }
    }
    mapNode.innerHTML = '<a class="map-static-link" href="https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(latitude + ',' + longitude) + '" target="_blank" rel="noreferrer">' +
      '<strong>' + escapeHtml(title || '\uC704\uCE58') + '</strong>' +
      '<span>' + escapeHtml(address || (latitude.toFixed(6) + ', ' + longitude.toFixed(6))) + '</span>' +
      '</a>'
  }

  function renderRestaurantDefaultLocationMap(input) {
    if (!pageHeadingIs('\uB9DB\uC9D1') || !input) return
    var mapNode = ensureRestaurantLocationMapBox(input)
    if (!mapNode || mapNode.dataset.locationSelected === 'true') return
    mapNode.dataset.locationSelected = 'false'
    if (window.L && typeof window.L.map === 'function') {
      try {
        mapNode.innerHTML = ''
        delete mapNode._leaflet_id
        var map = window.L.map(mapNode, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
        map.setView([36.5, 127.8], 6)
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map)
        window.setTimeout(function () { map.invalidateSize() }, 120)
        return
      } catch (error) {
        mapNode.innerHTML = ''
      }
    }
    mapNode.innerHTML = '<div class="map-static-link restaurant-empty-map"><strong>\uC704\uCE58\uB97C \uAC80\uC0C9\uD558\uBA74 \uC9C0\uB3C4\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4.</strong></div>'
  }

  function normalizeRestaurantVisitDate() {
    if (!pageHeadingIs('\uB9DB\uC9D1')) return
    var visitDateField = Array.from(document.querySelectorAll('.date-picker-field, .restaurant-form label, .entry-panel label')).find(function (label) {
      return label.textContent.indexOf('\uBC29\uBB38\uC77C') !== -1
    })
    var triggerText = visitDateField && visitDateField.querySelector('.date-picker-trigger span')
    if (triggerText && (!triggerText.textContent || triggerText.textContent.trim() === '2026.06.03')) {
      triggerText.textContent = formatDotDate(new Date())
    }
    var visitDateInput = visitDateField && visitDateField.querySelector('input')
    if (visitDateInput && (!visitDateInput.value || visitDateInput.value === '2026.06.03')) {
      setInputValue(visitDateInput, formatDotDate(new Date()))
    }
  }

  function normalizeRestaurantFormControls() {
    var form = document.querySelector('.restaurant-form')
    if (!form) return
    if (form.matches('[data-restaurant-form]')) return
    Array.from(form.querySelectorAll('label')).forEach(function (label) {
      var labelText = getCleanText(label)
      var title = label.querySelector('span')

      if (labelText.indexOf('\uB9DB\uC9D1 \uC774\uB984') >= 0) {
        if (title) title.textContent = '\uC0C1\uD638\uBA85'
        label.querySelectorAll('input, textarea').forEach(function (field) {
          field.removeAttribute('placeholder')
        })
      }

      if (labelText.indexOf('\uAC00\uACA9\uB300') >= 0 || (title && getCleanText(title) === '\uAC00\uACA9')) {
        if (title) title.textContent = '\uAC00\uACA9'
        var priceInput = label.querySelector('[data-restaurant-price-input]')
        if (!priceInput) {
          priceInput = document.createElement('input')
          priceInput.type = 'text'
          priceInput.inputMode = 'numeric'
          priceInput.pattern = '[0-9]*'
          priceInput.name = 'restaurantPrice'
          priceInput.dataset.restaurantPriceInput = 'true'
          priceInput.autocomplete = 'off'
          label.appendChild(priceInput)
          priceInput.addEventListener('input', function () {
            var next = String(priceInput.value || '').replace(/[^\d]/g, '')
            if (priceInput.value !== next) setInputValue(priceInput, next)
          })
        }
        priceInput.removeAttribute('placeholder')
        label.querySelectorAll('.custom-select, select').forEach(function (select) {
          if (!select.contains(priceInput)) hidePatchElement(select)
        })
      }
    })
  }

  function setInputValue(input, value) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    if (setter && setter.set) setter.set.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function removePlaceholdersIn(root, labelTexts) {
    if (!root) return
    var labels = Array.from(root.querySelectorAll('label'))
    labels.forEach(function (label) {
      var text = getCleanText(label)
      if (!labelTexts.some(function (target) { return text.indexOf(target) >= 0 })) return
      label.querySelectorAll('input, textarea').forEach(function (field) {
        field.removeAttribute('placeholder')
      })
    })
  }

  function setDateFieldToToday(root, labelTexts) {
    if (!root) return
    var dotToday = formatDotDate(new Date())
    var isoToday = todayText()
    Array.from(root.querySelectorAll('.date-picker-field, label')).forEach(function (field) {
      var text = getCleanText(field)
      if (!labelTexts.some(function (target) { return text.indexOf(target) >= 0 })) return
      var triggerText = field.querySelector('.date-picker-trigger span')
      if (triggerText && (!triggerText.textContent || parseApiDate(triggerText.textContent) === '2026-06-03')) {
        triggerText.textContent = dotToday
      }
      field.querySelectorAll('input').forEach(function (input) {
        var nextValue = input.type === 'date' ? isoToday : dotToday
        if (!input.value || parseApiDate(input.value) === '2026-06-03') setInputValue(input, nextValue)
      })
    })
  }

  function normalizeTimeInputs(root) {
    var scope = root || document
    var now = currentTimeText()
    scope.querySelectorAll('input[type="time"], input[name="recordTime"], [data-field="travel-record-time"]').forEach(function (input) {
      if (!input || input.disabled) return
      input.setAttribute('maxlength', '5')
      input.setAttribute('inputmode', 'numeric')
      input.setAttribute('pattern', '[0-2][0-9]:[0-5][0-9]')
      if (document.activeElement === input) return
      if (input.matches && input.matches('input[name="recordTime"]')) {
        var value = String(input.value || '').trim()
        if (!value || ((value === '00:00' || value === '14:00') && input.dataset.timeDefaulted !== 'true')) {
          setInputValue(input, now)
          input.dataset.timeDefaulted = 'true'
        } else {
          setInputValue(input, formatClockText(value, ''))
        }
        return
      }
      if (!input.value || ((input.value === '00:00' || input.value === '14:00') && input.dataset.timeDefaulted !== 'true')) {
        setInputValue(input, now)
        input.dataset.timeDefaulted = 'true'
      }
    })
  }

  function formatClockTyping(value) {
    var digits = String(value || '').replace(/\D/g, '').slice(0, 4)
    if (digits.length <= 2) return digits
    return digits.slice(0, 2) + ':' + digits.slice(2)
  }

  function normalizeClockTypingValue(value) {
    var digits = String(value || '').replace(/\D/g, '').slice(0, 4)
    if (digits.length >= 2 && Number(digits.slice(0, 2)) > 23) {
      digits = '0' + digits.slice(0, 1) + digits.slice(2)
    }
    if (digits.length >= 4 && Number(digits.slice(2, 4)) > 59) {
      digits = digits.slice(0, 2) + '59'
    }
    return formatClockTyping(digits)
  }

  function formatClockText(value, fallback) {
    var digits = String(value || '').replace(/\D/g, '').slice(0, 4)
    if (!digits) return fallback || ''
    if (digits.length <= 2) digits += '00'
    if (digits.length === 3) digits = '0' + digits
    var hour = Math.min(23, Number(digits.slice(0, 2)) || 0)
    var minute = Math.min(59, Number(digits.slice(2, 4)) || 0)
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0')
  }

  document.addEventListener('input', function (event) {
    var input = event.target && event.target.closest && event.target.closest('input[name="recordTime"], [data-field="travel-record-time"]')
    if (!input) return
    input.dataset.timeTouched = 'true'
    var next = normalizeClockTypingValue(input.value)
    if (input.value !== next) input.value = next
  }, true)

  document.addEventListener('blur', function (event) {
    var input = event.target && event.target.closest && event.target.closest('input[name="recordTime"], [data-field="travel-record-time"]')
    if (!input) return
    var next = formatClockText(input.value, currentTimeText())
    if (input.value !== next) setInputValue(input, next)
  }, true)

  function clearSampleFieldValues(root) {
    if (!root) return
    root.querySelectorAll('input, textarea').forEach(function (field) {
      var value = String(field.value || '').trim()
      var placeholder = String(field.getAttribute('placeholder') || '')
      if (placeholder.indexOf('\uC608:') >= 0 || placeholder.indexOf('\uD611\uC7AC\uD574\uC218\uC695\uC7A5') >= 0 || placeholder.indexOf('\uC81C\uC8FC\uB3C4') >= 0) {
        field.removeAttribute('placeholder')
      }
      if (value === '24,500' || value === '24500' || value.indexOf('\uD611\uC7AC\uD574\uC218\uC695\uC7A5') >= 0) setInputValue(field, '')
    })
  }

  function removeFeaturePlaceholders(root) {
    var scope = root || document
    scope.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(function (field) {
      if (field.closest('.auth-card, .auth-recovery-dialog, .password-change-dialog')) return
      field.removeAttribute('placeholder')
    })
  }

  function schedulePlaceholderSweep(root) {
    ;[0, 60, 180, 400, 800, 1400, 2400, 3600].forEach(function (delay) {
      window.setTimeout(function () {
        removeFeaturePlaceholders(root || document)
      }, delay)
    })
  }

  function ensureRequiredMarkForInput(input) {
    if (!input) return
    var label = input.closest('label')
    ensureRequiredMarkForLabel(label)
  }

  function ensureRequiredMarkForLabel(label) {
    var title = getLabelTitle(label)
    if (!title || title.querySelector('.required-mark')) return
    var mark = document.createElement('em')
    mark.className = 'required-mark'
    mark.textContent = '*'
    title.appendChild(document.createTextNode(' '))
    title.appendChild(mark)
  }

  function renameLabelTitle(form, fromText, toText) {
    var labels = Array.from(form.querySelectorAll('label'))
    var label = labels.find(function (item) {
      return getLabelText(item) === fromText
    })
    var title = getLabelTitle(label)
    if (title) title.textContent = toText
    return label || null
  }

  function findLabelByText(form, text) {
    return Array.from(form.querySelectorAll('label')).find(function (label) {
      return getLabelText(label) === text
    }) || null
  }

  function normalizeLedgerEntryForm() {
    if (!pageHeadingIs('\uAC00\uACC4\uBD80')) return
    var forms = document.querySelectorAll('.ledger-form, .entry-panel, form')
    forms.forEach(function (form) {
      var text = getCleanText(form)
      if (text.indexOf('\uAC00\uACC4\uBD80') < 0 && text.indexOf('\uAC70\uB798\uC77C') < 0 && text.indexOf('\uAE08\uC561') < 0) return
      renameLabelTitle(form, '\uAC00\uB9F9\uC810/\uB0B4\uC6A9', '\uB0B4\uC6A9')
      renameLabelTitle(form, '\uAC70\uB798\uC77C', '\uB0A0\uC9DC')
      var requiredLedgerLabels = ['\uB0B4\uC6A9', '\uAE08\uC561', '\uB0A0\uC9DC']
      requiredLedgerLabels.forEach(function (labelText) {
        ensureRequiredMarkForLabel(findLabelByText(form, labelText))
      })
      var submit = form.querySelector('button[type="submit"], .submit-action')
      if (submit && !form.dataset.apiLedgerEditId) submit.textContent = '\uCD94\uAC00'
      removePlaceholdersIn(form, ['\uAC00\uB9F9\uC810', '\uB0B4\uC6A9', '\uAE08\uC561'])
      setDateFieldToToday(form, ['\uAC70\uB798\uC77C', '\uB0A0\uC9DC'])
    })
    removeFeaturePlaceholders()
  }

  function removeLedgerManageButton() {
    if (!pageHeadingIs('\uAC00\uACC4\uBD80')) return
    Array.from(document.querySelectorAll('.panel-header')).forEach(function (header) {
      var title = getCleanText(header.querySelector('h2'))
      if (title !== '\uAC00\uACC4\uBD80 \uC870\uD68C') return
      Array.from(header.querySelectorAll('button, .passive-header-chip, [role="button"]')).forEach(function (button) {
        if (getCleanText(button) === '\uB0B4\uC5ED \uAD00\uB9AC') button.remove()
      })
    })
  }

  function normalizeTravelEntryForm() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    document.querySelectorAll('.travel-form, .trip-manager, .entry-panel, form').forEach(function (form) {
      var text = getCleanText(form)
      var isTripPeriodForm = text.indexOf('\uC2DC\uC791') >= 0 || text.indexOf('\uC885\uB8CC') >= 0
      var isTravelRecordForm = !!form.querySelector('[data-field="travel-title"], [data-field="travel-record-time"], [data-field="travel-location"]')
      if (!isTripPeriodForm && !isTravelRecordForm) return
      setDateFieldToToday(form, ['\uC2DC\uC791\uC77C', '\uC885\uB8CC\uC77C'])
      clearSampleFieldValues(form)
      normalizeTimeInputs(form)
      ensureRequiredMarkForInput(form.querySelector('[data-field="travel-title"]'))
      ensureRequiredMarkForInput(form.querySelector('[data-field="travel-record-date"]'))
      ensureRequiredMarkForInput(form.querySelector('[data-field="travel-record-time"]'))
      ensureRequiredMarkForLabel(findLabelByText(form, '\uB0A0\uC9DC'))
      ensureRequiredMarkForLabel(findLabelByText(form, '\uC2DC\uAC04'))
      normalizeTravelLocationOptional(form)
      ensureTravelLocationSearch(form)
      form.querySelectorAll('[data-field="travel-location"], [data-field="travel-amount"], [data-field="travel-title"]').forEach(function (field) {
        field.removeAttribute('placeholder')
      })
      form.querySelectorAll('button, span, b, strong, small').forEach(function (node) {
        if (getCleanText(node) === '\uC5EC\uD589' && !node.closest('label')) node.remove()
      })
    })
    cleanupTravelMapUi()
    removeFeaturePlaceholders()
  }

  function normalizeTravelLocationOptional(form) {
    var input = form && form.querySelector('[data-field="travel-location"]')
    if (!input) return
    input.required = false
    input.removeAttribute('required')
    var label = input.closest('label')
    var mark = label && label.querySelector('.required-mark')
    if (mark) {
      var previous = mark.previousSibling
      mark.remove()
      if (previous && previous.nodeType === 3 && !previous.textContent.trim()) previous.remove()
    }
  }

  function searchTravelPlaces(query, limit) {
    var text = String(query || '').trim()
    if (!text || text.length < 2 || !getStoredAuthToken()) return Promise.resolve([])
    return apiRequest('/places/search?q=' + encodeURIComponent(text) + '&limit=' + encodeURIComponent(limit || 6)).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function placeCandidateLabel(item) {
    return String(item && (item.name || item.address) || '').trim()
  }

  function placeCandidateDetail(item) {
    return String(item && item.address || '').trim()
  }

  function setTravelLocationCandidate(input, item) {
    if (!input || !item) return
    var label = placeCandidateLabel(item)
    var detail = placeCandidateDetail(item)
    setNativeInputValue(input, label || detail)
    if (Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) && Number(item.latitude) !== 0 && Number(item.longitude) !== 0) {
      input.dataset.latitude = String(item.latitude)
      input.dataset.longitude = String(item.longitude)
    } else {
      delete input.dataset.latitude
      delete input.dataset.longitude
    }
    if (detail) input.dataset.placeAddress = detail
    else delete input.dataset.placeAddress
    input.dispatchEvent(new CustomEvent('family-platform-location-selected', {
      bubbles: true,
      detail: {
        label: label || detail,
        address: detail,
        latitude: input.dataset.latitude || '',
        longitude: input.dataset.longitude || ''
      }
    }))
  }

  function getTravelLocationCoordinates(form) {
    var input = form && form.querySelector('[data-field="travel-location"]')
    if (!input) return null
    var latitude = Number(input.dataset.latitude)
    var longitude = Number(input.dataset.longitude)
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
      return { latitude: latitude, longitude: longitude }
    }
    var match = String(input.value || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
    if (!match) return null
    latitude = Number(match[1])
    longitude = Number(match[2])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
    return { latitude: latitude, longitude: longitude }
  }

  function resolveTravelLocationForSubmit(form, location) {
    var existing = getTravelLocationCoordinates(form)
    if (existing || !String(location || '').trim()) return Promise.resolve(existing)
    return searchTravelPlaces(location, 1).then(function (items) {
      var first = items[0]
      if (!first) return null
      var input = form.querySelector('[data-field="travel-location"]')
      setTravelLocationCandidate(input, first)
      return { latitude: Number(first.latitude), longitude: Number(first.longitude) }
    })
  }

  function ensureTravelLocationSearch(form) {
    var input = form && form.querySelector('[data-field="travel-location"]')
    if (!input || input.dataset.placeSearchReady === 'true') return
    input.dataset.placeSearchReady = 'true'
    var label = input.closest('label')
    var candidates = document.createElement('div')
    candidates.className = 'location-candidates travel-location-candidates'
    candidates.hidden = true
    if (label && label.parentElement) {
      label.insertAdjacentElement('afterend', candidates)
    }
    var timer = null

    function hideCandidates() {
      candidates.hidden = true
      candidates.innerHTML = ''
    }

    function renderCandidates(query, items) {
      if (String(input.value || '').trim() !== query) return
      if (!items.length) {
        items = [{ id: 'manual:' + query, name: query, address: '\uC785\uB825\uD55C \uC704\uCE58\uB85C \uC800\uC7A5', latitude: '', longitude: '', source: 'manual' }]
      }
      candidates.innerHTML = '<span>\uC704\uCE58\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.</span>' + items.map(function (item, index) {
        return '<button type="button" data-place-index="' + index + '">' +
          '<b>' + escapeHtml(placeCandidateLabel(item)) + '</b>' +
          '<small>' + escapeHtml(placeCandidateDetail(item)) + '</small>' +
          '</button>'
      }).join('')
      candidates.hidden = false
      candidates.querySelectorAll('button[data-place-index]').forEach(function (button) {
        button.addEventListener('mousedown', function (event) { event.preventDefault() })
        button.addEventListener('click', function () {
          var item = items[Number(button.dataset.placeIndex)]
          setTravelLocationCandidate(input, item)
          hideCandidates()
        })
      })
    }

    function queuePlaceSearch(clearCoordinates) {
      if (clearCoordinates) {
        delete input.dataset.latitude
        delete input.dataset.longitude
        delete input.dataset.placeAddress
      }
      window.clearTimeout(timer)
      var query = String(input.value || '').trim()
      if (query.length < 2) {
        hideCandidates()
        return
      }
      timer = window.setTimeout(function () {
        candidates.innerHTML = '<span>\uC704\uCE58\uB97C \uAC80\uC0C9\uD558\uB294 \uC911\uC785\uB2C8\uB2E4.</span>'
        candidates.hidden = false
        searchTravelPlaces(query, 6).then(function (items) {
          renderCandidates(query, items)
        })
      }, 280)
    }

    input.addEventListener('input', function () {
      queuePlaceSearch(true)
    })
    input.addEventListener('focus', function () {
      if (String(input.value || '').trim().length >= 2 && candidates.hidden) {
        queuePlaceSearch(false)
      }
    })
    input.addEventListener('blur', function () {
      window.setTimeout(hideCandidates, 220)
    })
  }

  function ensureTravelHeaderActions() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    var panel = document.querySelector('.trip-manager')
    if (!panel) return
    cleanupTravelPageCaption()
    var header = panel.querySelector('.panel-header') || panel.closest('.panel') && panel.closest('.panel').querySelector('.panel-header')
    if (!header) return
    var isListMode = panel.classList.contains('list-mode')
    var actions = header.querySelector('.travel-header-actions')

    if (isListMode) {
      if (actions) {
        actions.querySelectorAll('[data-travel-new-entry], [data-travel-list-back]').forEach(function (button) { button.remove() })
        if (!actions.children.length) actions.remove()
      }
      normalizeTravelListWorkspace()
      return
    }

    var originalList = Array.from(panel.querySelectorAll('button')).find(function (button) {
      return getCleanText(button) === '\uBAA9\uB85D' && !button.dataset.travelListBack
    })
    if (!originalList) {
      if (actions) {
        actions.querySelectorAll('[data-travel-new-entry]').forEach(function (button) { button.remove() })
        if (!actions.children.length) actions.remove()
      }
      normalizeTravelListWorkspace()
      return
    }
    if (!actions) {
      actions = document.createElement('div')
      actions.className = 'travel-header-actions'
      header.appendChild(actions)
    }
    actions.querySelectorAll('[data-travel-new-entry]').forEach(function (button) { button.remove() })
    actions.querySelectorAll('[data-travel-list-back]').forEach(function (button) {
      if (button !== originalList) button.remove()
    })
    originalList.dataset.travelListBack = 'true'
    actions.appendChild(originalList)
    normalizeTravelListWorkspace()
  }

  function cleanupTravelPageCaption() {
    document.querySelectorAll('body *').forEach(function (node) {
      if (node.children.length) return
      if (getCleanText(node) === '\uC7A5\uC18C, \uB3D9\uC120, \uBE44\uC6A9') node.remove()
    })
  }

  function cleanupTravelMapUi() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    document.querySelectorAll('.location-map-actions a, .location-map-actions button, a.map-link').forEach(function (node) {
      if (getCleanText(node) === '\uC9C0\uB3C4\uC5D0\uC11C \uC5F4\uAE30') node.remove()
    })
    document.querySelectorAll('.route-map .route-sequence').forEach(function (node) {
      node.remove()
    })
    normalizeTravelRecordRows()
  }

  function normalizeTravelRecordRows() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    document.querySelectorAll('.travel-row').forEach(function (row) {
      normalizeTravelRecordMapButton(row)
      normalizeTravelRecordText(row)
    })
  }

  function normalizeTravelRecordMapButton(row) {
    var link = row && row.querySelector('.row-actions a.map-link')
    if (!link) return
    var query = getTravelMapQuery(link)
    var title = getCleanText(row.querySelector('.travel-main strong, .travel-record-head strong'))
    if (!query || query === '\uB300\uD55C\uBBFC\uAD6D' || query === title || isEmptyTravelCoordinateQuery(query)) {
      link.remove()
    }
  }

  function getTravelMapQuery(link) {
    try {
      return String(new URL(link.href).searchParams.get('query') || '').trim()
    } catch (error) {
      return ''
    }
  }

  function isEmptyTravelCoordinateQuery(query) {
    var match = String(query || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
    if (!match) return false
    return Math.abs(Number(match[1])) < 0.000001 && Math.abs(Number(match[2])) < 0.000001
  }

  function normalizeTravelRecordText(row) {
    var main = row && row.querySelector('.travel-main')
    if (!main || main.querySelector('.travel-record-head')) return
    var title = getCleanText(main.querySelector('strong')) || '\uC5EC\uD589 \uAE30\uB85D'
    var metaText = normalizeTravelCostText(getCleanText(main.querySelector('span')))
    var bodyText = getCleanText(main.querySelector('p'))
    var bodyParts = bodyText.split(/\s*\u00B7\s*/)
    var dateTime = bodyParts.shift() || ''
    var note = bodyParts.join(' \u00B7 ').trim()
    main.innerHTML = ''

    var head = document.createElement('div')
    head.className = 'travel-record-head'
    var titleNode = document.createElement('strong')
    titleNode.textContent = title
    head.appendChild(titleNode)
    if (dateTime) {
      var timeNode = document.createElement('time')
      timeNode.textContent = dateTime
      head.appendChild(timeNode)
    }
    main.appendChild(head)

    if (metaText) {
      var meta = document.createElement('span')
      meta.className = 'travel-record-cost'
      meta.textContent = metaText
      main.appendChild(meta)
    }

    if (note) {
      var noteNode = document.createElement('p')
      noteNode.className = 'travel-record-note'
      noteNode.textContent = note
      main.appendChild(noteNode)
    }
  }

  function normalizeTravelCostText(text) {
    var value = String(text || '').trim()
    if (!value || value.indexOf('\u00B7') >= 0) return value
    var match = value.match(/^(.+?)(-?[\d,]+\uC6D0)$/)
    if (!match) return value
    return match[1].trim() + ' \u00B7 ' + match[2]
  }

  function normalizeTravelListWorkspace() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    var manager = document.querySelector('.trip-manager')
    if (!manager) return
    document.querySelectorAll('.travel-trip-create-card').forEach(function (node) {
      var row = node.querySelector('.trip-add-row')
      if (row && !manager.contains(row)) {
        var list = manager.querySelector('.trip-list')
        manager.insertBefore(row, list || manager.firstChild)
      }
      node.remove()
    })
    var panel = manager.closest('.panel')
    if (!panel) return
    panel.classList.remove('full-span', 'fp-side-panel')
    panel.classList.add('fp-primary-panel', 'fp-wide-panel')
  }

  function cleanupTravelListWorkspace() {
    if (pageHeadingIs('\uC5EC\uD589')) return
    document.querySelectorAll('.travel-trip-create-card').forEach(function (node) { node.remove() })
  }

  function normalizeDiaryEntryForm() {
    if (!pageHeadingIs('\uC77C\uAE30')) return
    document.querySelectorAll('.diary-form, .entry-panel, form').forEach(function (form) {
      var text = getCleanText(form)
      if (text.indexOf('\uC81C\uBAA9') < 0 && text.indexOf('\uB0B4\uC6A9') < 0) return
      bindVisibleDiarySubmit(form)
      removePlaceholdersIn(form, ['\uC81C\uBAA9', '\uCD5C\uC800 \uC628\uB3C4', '\uCD5C\uACE0 \uC628\uB3C4', '\uB0B4\uC6A9'])
      setDateFieldToToday(form, ['\uB0A0\uC9DC'])
    })
    removeFeaturePlaceholders()
  }

  function bindVisibleDiarySubmit(form) {
    if (!form) return
    if (!form.matches || !form.matches('.diary-form')) return
    var submit = form.querySelector('button[type="submit"], .submit-action')
    var submitDirectly = function (event) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      var panel = form.closest('aside, section, article, .panel, .entry-panel') || form
      submitExistingDiaryPanel(panel, submit)
    }
    if (form.dataset.diaryDirectSubmitBound !== 'true') {
      form.dataset.diaryDirectSubmitBound = 'true'
      form.addEventListener('submit', submitDirectly, true)
    }
    if (submit) {
      var directButton = form.querySelector('[data-diary-direct-submit-button="true"]')
      if (!directButton) {
        directButton = document.createElement('button')
        directButton.type = 'button'
        directButton.className = submit.className || 'submit-action'
        directButton.textContent = submit.textContent || '\uC77C\uAE30 \uCD94\uAC00'
        directButton.dataset.diaryDirectSubmitButton = 'true'
        submit.style.display = 'none'
        submit.parentNode.insertBefore(directButton, submit.nextSibling)
      }
      if (directButton.dataset.diaryDirectClickBound !== 'true') {
        directButton.dataset.diaryDirectClickBound = 'true'
        directButton.addEventListener('pointerdown', submitDirectly, true)
        directButton.addEventListener('mousedown', submitDirectly, true)
        directButton.addEventListener('click', submitDirectly, true)
        directButton.onclick = submitDirectly
      }
    }
  }

  function normalizeBabyEntryForms() {
    if (!pageHeadingIs('\uC721\uC544')) return
    document.querySelectorAll('.baby-form, .baby-create-form, .entry-panel, form').forEach(function (form) {
      var text = getCleanText(form)
      if (text.indexOf('\uC544\uC774') < 0 && text.indexOf('\uC721\uC544') < 0 && text.indexOf('\uD0A4') < 0) return
      removePlaceholdersIn(form, ['\uC544\uC774 \uC774\uB984', '\uC774\uB984', '\uC131\uBCC4', '\uBA54\uBAA8', '\uD0A4', '\uBAB8\uBB34\uAC8C'])
      setDateFieldToToday(form, ['\uC0DD\uC77C', '\uB0A0\uC9DC'])
    })
    removeFeaturePlaceholders()
  }

  function renderDiaryPageFromApi(force) {
    if (!pageHeadingIs('\uC77C\uAE30')) return
    var section = document.querySelector('.diary-section')
    var list = section && section.querySelector('.diary-list')
    if (!section || !list) return
    var range = monthRangeFor(todayText())
    var key = range.start + ':' + range.end
    if (!force && list.dataset.apiRangeKey === key) return
    list.dataset.apiRangeKey = key
    var badge = section.querySelector('.passive-header-chip')
    if (badge) badge.textContent = '0\uAC1C'
    list.innerHTML = emptyRow('\uC77C\uAE30\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.', '')
    fetchDiaries(range.start, range.end).then(function (items) {
      if (badge) badge.textContent = Number(items.length || 0).toLocaleString('ko-KR') + '\uAC1C'
      if (!items.length) {
        list.innerHTML = emptyRow('\uB4F1\uB85D\uB41C \uC77C\uAE30\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
        return
      }
      list.innerHTML = items.map(function (item) {
        var date = item.diaryDate || item.date || ''
        var temp = item.minTemperature || item.maxTemperature
          ? (item.minTemperature || '-') + '/' + (item.maxTemperature || '-') + '\uB3C4'
          : '\uC628\uB3C4 \uBBF8\uC785\uB825'
        return '<div class="diary-list-row api-diary-row" data-api-diary-id="' + escapeHtml(item.id) + '">' +
          '<button class="diary-open-button" type="button" data-api-diary-open="' + escapeHtml(item.id) + '"><div><strong>' + escapeHtml(item.title || '') + '</strong>' +
          '<span>' + escapeHtml([date, item.weather || '\uB0A0\uC528 \uBBF8\uC785\uB825', temp, item.mood || ''].filter(Boolean).join(' \u00B7 ')) + '</span>' +
          '<p>' + escapeHtml(item.body || '') + '</p></div></button></div>'
      }).join('')
      list.querySelectorAll('[data-api-diary-open]').forEach(function (button) {
        button.addEventListener('click', function () {
          var item = items.find(function (entry) { return String(entry.id) === String(button.dataset.apiDiaryOpen) })
          showDiaryDetail(item)
        })
      })
    }).catch(function (error) {
      list.innerHTML = emptyRow(apiActionErrorMessage(error, '\uC77C\uAE30\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.'), '')
    })
  }

  function showDiaryDetail(item) {
    if (!item) {
      showPatchToast('\uC0C1\uC138\uB97C \uBCFC \uC77C\uAE30\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      return
    }
    var old = document.querySelector('.patch-diary-detail-backdrop')
    if (old) old.remove()
    var backdrop = document.createElement('div')
    backdrop.className = 'patch-ledger-detail-backdrop patch-diary-detail-backdrop'
    function renderView() {
      var temp = item.minTemperature || item.maxTemperature
        ? (item.minTemperature || '-') + '/' + (item.maxTemperature || '-') + '\uB3C4'
        : '\uC628\uB3C4 \uBBF8\uC785\uB825'
      backdrop.innerHTML = [
        '<section class="patch-ledger-detail-dialog diary-detail-dialog">',
        '<button type="button" class="dialog-close" data-diary-detail-close>\u00D7</button>',
        '<span class="ledger-detail-chip">\uC77C\uAE30</span>',
        '<h2>' + escapeHtml(item.title || '\uC77C\uAE30') + '</h2>',
        '<dl>',
        '<div><dt>\uB0A0\uC9DC</dt><dd>' + escapeHtml(String(item.diaryDate || item.date || '').replace(/-/g, '.')) + '</dd></div>',
        '<div><dt>\uB0A0\uC528</dt><dd>' + escapeHtml(item.weather || '-') + '</dd></div>',
        '<div><dt>\uAE30\uBD84</dt><dd>' + escapeHtml(item.mood || '-') + '</dd></div>',
        '<div><dt>\uC628\uB3C4</dt><dd>' + escapeHtml(temp) + '</dd></div>',
        '</dl>',
        '<p>' + escapeHtml(item.body || '\uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.') + '</p>',
        '<div class="ledger-detail-actions">',
        '<button type="button" class="edit-button" data-diary-detail-edit>\uC218\uC815</button>',
        '<button type="button" class="danger-button" data-diary-detail-delete>\uC0AD\uC81C</button>',
        '</div>',
        '</section>'
      ].join('')
    }
    function renderEdit() {
      backdrop.innerHTML = [
        '<section class="patch-ledger-detail-dialog diary-detail-dialog diary-detail-edit">',
        '<button type="button" class="dialog-close" data-diary-detail-close>\u00D7</button>',
        '<h2>\uC77C\uAE30 \uC218\uC815</h2>',
        '<label><span>\uC81C\uBAA9</span><input data-diary-edit-title value="' + escapeHtml(item.title || '') + '" /></label>',
        '<label><span>\uB0A0\uC9DC</span><input data-diary-edit-date type="date" value="' + escapeHtml(item.diaryDate || item.date || todayText()) + '" /></label>',
        '<div class="form-row two">',
        '<label><span>\uB0A0\uC528</span><input data-diary-edit-weather value="' + escapeHtml(item.weather || '') + '" /></label>',
        '<label><span>\uAE30\uBD84</span><input data-diary-edit-mood value="' + escapeHtml(item.mood || '') + '" /></label>',
        '</div>',
        '<div class="form-row two">',
        '<label><span>\uCD5C\uC800 \uC628\uB3C4</span><input data-diary-edit-min value="' + escapeHtml(item.minTemperature || '') + '" /></label>',
        '<label><span>\uCD5C\uACE0 \uC628\uB3C4</span><input data-diary-edit-max value="' + escapeHtml(item.maxTemperature || '') + '" /></label>',
        '</div>',
        '<label><span>\uB0B4\uC6A9</span><textarea data-diary-edit-body rows="5">' + escapeHtml(item.body || '') + '</textarea></label>',
        '<div class="ledger-detail-actions">',
        '<button type="button" class="cancel-button" data-diary-detail-view>\uCDE8\uC18C</button>',
        '<button type="button" class="edit-button" data-diary-detail-save>\uC800\uC7A5</button>',
        '</div>',
        '</section>'
      ].join('')
      var first = backdrop.querySelector('[data-diary-edit-title]')
      if (first) first.focus()
    }
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop || event.target.closest('[data-diary-detail-close]')) {
        backdrop.remove()
        return
      }
      if (event.target.closest('[data-diary-detail-edit]')) {
        renderEdit()
        return
      }
      if (event.target.closest('[data-diary-detail-view]')) {
        renderView()
        return
      }
      if (event.target.closest('[data-diary-detail-save]')) {
        var title = getFieldValue(backdrop, '[data-diary-edit-title]')
        var diaryDate = getFieldValue(backdrop, '[data-diary-edit-date]')
        if (!title) {
          showPatchToast('\uC81C\uBAA9\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
          var titleInput = backdrop.querySelector('[data-diary-edit-title]')
          if (titleInput) titleInput.focus()
          return
        }
        if (!diaryDate) {
          showPatchToast('\uB0A0\uC9DC\uB294 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
          var dateInput = backdrop.querySelector('[data-diary-edit-date]')
          if (dateInput) dateInput.focus()
          return
        }
        showPatchConfirm('\uC77C\uAE30\uB97C \uC218\uC815\uD560\uAE4C\uC694?', function () {
          apiRequest('/diaries/' + encodeURIComponent(item.id), {
            method: 'PUT',
            body: JSON.stringify({
              title: title,
              body: getFieldValue(backdrop, '[data-diary-edit-body]'),
              diaryDate: diaryDate,
              weather: getFieldValue(backdrop, '[data-diary-edit-weather]') || null,
              mood: getFieldValue(backdrop, '[data-diary-edit-mood]') || null,
              minTemperature: getFieldValue(backdrop, '[data-diary-edit-min]') || null,
              maxTemperature: getFieldValue(backdrop, '[data-diary-edit-max]') || null,
              mediaUrls: item.mediaUrls || []
            })
          }).then(function (updated) {
            item = updated || item
            showPatchToast('\uC77C\uAE30\uB97C \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.')
            renderDiaryPageFromApi(true)
            renderView()
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uC77C\uAE30 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
        return
      }
      if (event.target.closest('[data-diary-detail-delete]')) {
        showPatchConfirm('\uC77C\uAE30\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
          apiRequest('/diaries/' + encodeURIComponent(item.id), { method: 'DELETE' }).then(function () {
            showPatchToast('\uC77C\uAE30\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
            backdrop.remove()
            renderDiaryPageFromApi(true)
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uC77C\uAE30 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      }
    })
    renderView()
    document.body.appendChild(backdrop)
  }

  function renderTravelPageFromApi(force) {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    var panel = document.querySelector('.trip-manager')
    var headerAction = document.querySelector('.panel-header .passive-header-chip, .panel.wide.full-span .panel-header button')
    if (!panel && !headerAction) return
    var forceListMode = !!window.__familyTravelForceListMode
    var hasApiDetail = panel && !!panel.querySelector('.api-trip-detail')
    var shouldForceList = forceListMode || !hasApiDetail
    if (shouldForceList) resetTravelApiListMode(panel)
    var existingList = panel && panel.querySelector('.trip-list')
    var hasRenderedList = existingList && (existingList.querySelector('.api-trip-card') || existingList.querySelector('.api-empty-row'))
    if (!force && panel && panel.dataset.apiBacked === 'true' && hasRenderedList) {
      window.__familyTravelForceListMode = false
      return
    }
    if (panel) panel.dataset.apiBacked = 'true'
    normalizeTravelListWorkspace()
    fetchTrips().then(function (trips) {
      if (headerAction) headerAction.textContent = Number(trips.length || 0).toLocaleString('ko-KR') + '\uAC1C'
      if (panel) renderApiTripList(panel, trips)
      normalizeTravelListWorkspace()
      removeHardcodedDemoData()
      window.__familyTravelForceListMode = false
    })
  }

  function resetTravelApiListMode(panel) {
    if (!panel) return
    panel.querySelectorAll('.api-trip-detail').forEach(function (detail) { detail.remove() })
    Array.from(panel.children).forEach(function (child) {
      if (!child || !child.matches) return
      if (
        child.matches('.trip-list') ||
        child.matches('.trip-add-row') ||
        child.matches('.travel-trip-create-card')
      ) return
      if (
        child.matches('.travel-summary') ||
        child.matches('.route-map') ||
        child.matches('.route-map-grid') ||
        child.matches('.timeline') ||
        child.matches('.travel-form') ||
        child.matches('.api-trip-record-list')
      ) child.remove()
    })
    setTripDetailMode(panel, false)
  }

  function forceTravelListModeNow() {
    window.__familyTravelForceListMode = true
    try { localStorage.removeItem(API_TRIP_ID_KEY) } catch {}
    var panel = document.querySelector('.trip-manager')
    if (panel) resetTravelApiListMode(panel)
    if (pageHeadingIs('\uC5EC\uD589')) renderTravelPageFromApi(true)
  }

  function renderApiTripList(panel, trips) {
    var list = panel.querySelector('.trip-list')
    if (!list) {
      list = document.createElement('div')
      list.className = 'trip-list'
      panel.appendChild(list)
    }
    if (!trips.length) {
      list.innerHTML = emptyRow('\uB4F1\uB85D\uB41C \uC5EC\uD589\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
      return
    }
    list.innerHTML = trips.map(function (trip) {
      return '<article class="trip-list-card api-trip-card" data-api-trip-id="' + escapeHtml(trip.id) + '" data-api-trip-title="' + escapeHtml(trip.title || '\uC5EC\uD589') + '" data-api-trip-start="' + escapeHtml(trip.startDate || '') + '" data-api-trip-end="' + escapeHtml(trip.endDate || trip.startDate || '') + '">' +
        '<button type="button" class="trip-card-main" data-api-trip-open="' + escapeHtml(trip.id) + '">' +
        '<div><strong>' + escapeHtml(trip.title || '\uC5EC\uD589') + '</strong>' +
        '<span>' + escapeHtml(tripPeriodText(trip)) + '</span></div>' +
        '</button>' +
        '<div class="trip-card-actions">' +
        '<button type="button" data-api-trip-edit="' + escapeHtml(trip.id) + '">\uC218\uC815</button>' +
        '<button type="button" class="danger-action" data-api-trip-delete="' + escapeHtml(trip.id) + '">\uC0AD\uC81C</button>' +
        '</div>' +
        '</article>'
    }).join('')
    list.querySelectorAll('[data-api-trip-open]').forEach(function (card) {
      card.addEventListener('click', function () {
        var trip = trips.find(function (item) { return String(item.id) === String(card.dataset.apiTripOpen) })
        if (trip) openApiTripDetail(panel, trip)
      })
    })
    list.querySelectorAll('[data-api-trip-edit]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        var trip = trips.find(function (item) { return String(item.id) === String(button.dataset.apiTripEdit) })
        if (trip) startTripEdit(panel, trip)
      })
    })
    list.querySelectorAll('[data-api-trip-delete]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        deleteApiTrip(panel, button.dataset.apiTripDelete)
      })
    })
  }

  function tripPeriodText(trip) {
    return (trip && trip.startDate ? trip.startDate : '') +
      (trip && trip.endDate && trip.endDate !== trip.startDate ? ' ~ ' + trip.endDate : '')
  }

  function tripFromCard(card) {
    if (!card) return null
    var period = getCleanText(card.querySelector('span'))
    var startDate = card.dataset.apiTripStart || ''
    var endDate = card.dataset.apiTripEnd || startDate
    if (!startDate && period.indexOf('~') >= 0) {
      var parts = period.split('~')
      startDate = String(parts[0] || '').trim()
      endDate = String(parts[1] || '').trim()
    } else if (!startDate) {
      startDate = period
      endDate = period
    }
    return {
      id: card.dataset.apiTripId || '',
      title: card.dataset.apiTripTitle || getCleanText(card.querySelector('strong')) || '\uC5EC\uD589',
      startDate: startDate,
      endDate: endDate
    }
  }

  function openApiTripCard(card) {
    if (!card || !pageHeadingIs('\uC5EC\uD589')) return
    var panel = card.closest('.trip-manager') || document.querySelector('.trip-manager')
    if (!panel) return
    var trip = tripFromCard(card)
    if (trip && trip.id) openApiTripDetail(panel, trip)
  }

  document.addEventListener('click', function (event) {
    if (!event.target || !event.target.closest || !pageHeadingIs('\uC5EC\uD589')) return
    var editButton = event.target.closest('[data-api-trip-edit]')
    if (editButton) {
      var editCard = editButton.closest('.api-trip-card')
      var editPanel = editCard && editCard.closest('.trip-manager') || document.querySelector('.trip-manager')
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      startTripEdit(editPanel, tripFromCard(editCard))
      return
    }
    var deleteButton = event.target.closest('[data-api-trip-delete]')
    if (deleteButton) {
      var deleteCard = deleteButton.closest('.api-trip-card')
      var deletePanel = deleteCard && deleteCard.closest('.trip-manager') || document.querySelector('.trip-manager')
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      deleteApiTrip(deletePanel, deleteButton.dataset.apiTripDelete)
      return
    }
    var card = event.target.closest('[data-api-trip-open]') || event.target.closest('.api-trip-card')
    if (!card) return
    card = card.closest('.api-trip-card') || card
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    openApiTripCard(card)
  }, true)

  function findTripAddRow(panel) {
    return panel && (panel.querySelector('.trip-add-row') || panel.querySelector('.trip-manager > form') || panel)
  }

  function tripPayloadFromRow(row) {
    var title = getFieldValue(row, '[data-field="trip-title"]') || getFieldValue(row, 'input')
    var dateFields = row ? row.querySelectorAll('.date-picker-field') : []
    var startDate = parseApiDate(getCleanText(dateFields[0])) || getFieldValue(row, '[data-field="trip-start-date"], input[type="date"]') || todayText()
    var endDate = parseApiDate(getCleanText(dateFields[1])) || getFieldValue(row, '[data-field="trip-end-date"]') || startDate
    return {
      title: String(title || '').trim(),
      startDate: startDate,
      endDate: endDate,
      description: startDate === endDate ? startDate : (startDate + ' ~ ' + endDate)
    }
  }

  function fillTripRow(row, trip) {
    if (!row || !trip) return false
    var titleInput = row.querySelector('[data-field="trip-title"], input')
    if (titleInput) setInputValue(titleInput, trip.title || '')
    var fields = row.querySelectorAll('.date-picker-field')
    ;[
      { field: fields[0], value: trip.startDate },
      { field: fields[1], value: trip.endDate || trip.startDate }
    ].forEach(function (item) {
      if (!item.field || !item.value) return
      var triggerText = item.field.querySelector('.date-picker-trigger span')
      var input = item.field.querySelector('input')
      if (triggerText) triggerText.textContent = String(item.value).replace(/-/g, '.')
      if (input) setInputValue(input, input.type === 'date' ? item.value : String(item.value).replace(/-/g, '.'))
    })
    var submit = row.querySelector('.submit-action, button[type="submit"]')
    if (submit) submit.textContent = '\uC800\uC7A5'
    row.dataset.apiTripEditId = String(trip.id)
    if (titleInput) window.setTimeout(function () { titleInput.focus() }, 60)
    return true
  }

  function clearTripEditMode(row) {
    if (!row) return
    delete row.dataset.apiTripEditId
    var submit = row.querySelector('.submit-action, button[type="submit"]')
    if (submit) submit.textContent = '\uC5EC\uD589 \uCD94\uAC00'
  }

  function startTripEdit(panel, trip) {
    var detail = panel && panel.querySelector('.api-trip-detail')
    if (detail) detail.remove()
    setTripDetailMode(panel, false)
    var row = findTripAddRow(panel)
    if (!fillTripRow(row, trip)) showPatchToast('\uC218\uC815\uD560 \uC5EC\uD589\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
  }

  function submitApiTripRow(row) {
    if (!row || row.dataset.tripSubmitting === 'true') return
    var payload = tripPayloadFromRow(row)
    var titleInput = row.querySelector('[data-field="trip-title"], input')
    if (!payload.title) {
      showPatchToast('\uC5EC\uD589\uBA85\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
      if (titleInput) titleInput.focus()
      return
    }
    if (payload.endDate < payload.startDate) {
      showPatchToast('\uC885\uB8CC\uC77C\uC740 \uC2DC\uC791\uC77C\uBCF4\uB2E4 \uC774\uC804\uC77C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.')
      return
    }
    var editId = row.dataset.apiTripEditId
    var panel = row.closest('.trip-manager') || document.querySelector('.trip-manager')
    var submit = row.querySelector('.submit-action, button[type="submit"]')
    row.dataset.tripSubmitting = 'true'
    if (submit) submit.disabled = true
    var request = editId
      ? putJson('/trips/' + encodeURIComponent(editId), payload)
      : getReadableFamilyId().then(function (familyId) {
        return postJson('/trips?familyId=' + encodeURIComponent(familyId), payload)
      })
    request.then(function (trip) {
      if (trip && trip.id) localStorage.setItem(API_TRIP_ID_KEY, String(trip.id))
      showPatchToast(editId ? '\uC5EC\uD589\uC744 \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.' : '\uC5EC\uD589\uC744 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.')
      if (titleInput) setInputValue(titleInput, '')
      clearTripEditMode(row)
      renderTravelPageFromApi(true)
    }).catch(function (error) {
      showPatchToast(apiActionErrorMessage(error, editId ? '\uC5EC\uD589 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.' : '\uC5EC\uD589 \uCD94\uAC00\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
    }).finally(function () {
      delete row.dataset.tripSubmitting
      if (submit) submit.disabled = false
    })
  }

  function deleteApiTrip(panel, tripId) {
    if (!tripId) return
    showPatchConfirm('\uC5EC\uD589\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
      apiRequest('/trips/' + encodeURIComponent(tripId), { method: 'DELETE' }).then(function () {
        showPatchToast('\uC5EC\uD589\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
          if (String(localStorage.getItem(API_TRIP_ID_KEY) || '') === String(tripId)) localStorage.removeItem(API_TRIP_ID_KEY)
          var detail = panel && panel.querySelector('.api-trip-detail')
          if (detail) detail.remove()
          setTripDetailMode(panel, false)
          renderTravelPageFromApi(true)
        }).catch(function (error) {
          showPatchToast(apiActionErrorMessage(error, '\uC5EC\uD589 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      })
    })
  }

  function openApiTripDetail(panel, trip) {
    if (!panel || !trip) return
    window.__familyTravelForceListMode = false
    localStorage.setItem(API_TRIP_ID_KEY, String(trip.id))
    setTripDetailMode(panel, true)
    var detail = panel.querySelector('.api-trip-detail')
    if (!detail) {
      detail = document.createElement('section')
      detail.className = 'api-trip-detail'
      panel.appendChild(detail)
    }
    detail.innerHTML = [
      '<div class="api-trip-detail-shell">',
      '<section class="api-trip-detail-main">',
      '<div class="api-trip-detail-toolbar"><button type="button" data-api-trip-back>\uBAA9\uB85D</button></div>',
      '<div class="travel-summary api-travel-summary"><div><span>\uCD1D \uC0AC\uC6A9\uAE08\uC561</span><strong data-trip-total-amount>0\uC6D0</strong></div><div><span>\uB2E4\uC74C \uC21C\uC11C</span><strong data-trip-next-order>01</strong></div></div>',
      '<div class="route-map api-trip-route-map"><div class="route-map-osm" data-trip-route-map></div><div class="route-map-empty" data-trip-route-empty>\uB4F1\uB85D\uB41C \uC704\uCE58\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div></div>',
      '<div class="api-trip-record-list"></div>',
      '</section>',
      '<aside class="api-trip-detail-side">',
      '<form class="travel-form api-travel-record-form">',
      '<h3>\uC5EC\uD589 \uAE30\uB85D \uCD94\uAC00</h3>',
      '<label class="form-field"><span class="form-label">\uC21C\uC11C</span><input class="form-control" data-field="travel-sort-order" inputmode="numeric" value="1" /></label>',
      '<label class="form-field"><span class="form-label">\uBE44\uC6A9 \uAD6C\uBD84</span><select class="form-control" data-field="travel-category"><option>\uAD50\uD1B5</option><option>\uC219\uBC15</option><option>\uC2DD\uBE44</option><option>\uAD00\uAD11</option><option>\uAE30\uD0C0</option></select></label>',
      '<label class="form-field travel-title-field"><span class="form-label">\uC81C\uBAA9 <em class="required-mark">*</em></span><input class="form-control" data-field="travel-title" /></label>',
      '<label class="form-field"><span class="form-label">\uB0A0\uC9DC <em class="required-mark">*</em></span><input class="form-control" data-field="travel-record-date" type="date" value="' + todayText() + '" /></label>',
      '<label class="form-field"><span class="form-label">\uC2DC\uAC04 <em class="required-mark">*</em></span><input class="form-control" data-field="travel-record-time" type="time" value="' + currentTimeText() + '" /></label>',
      '<label class="form-field travel-location-field"><span class="form-label">\uC704\uCE58</span><input class="form-control" data-field="travel-location" autocomplete="off" /></label>',
      '<div class="location-map-box api-location-map-box"><div class="location-map-osm" data-travel-location-map><span>\uC704\uCE58\uB97C \uC120\uD0DD\uD558\uBA74 \uC9C0\uB3C4\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4.</span></div></div>',
      '<label class="form-field"><span class="form-label">\uC0AC\uC6A9\uAE08\uC561</span><input class="form-control" data-field="travel-amount" inputmode="numeric" /></label>',
      '<label class="form-field travel-note-field"><span class="form-label">\uB0B4\uC6A9</span><textarea class="form-control" rows="5"></textarea></label>',
      '<div class="travel-form-actions"><button type="submit" class="submit-action">\uAE30\uB85D \uCD94\uAC00</button></div>',
      '</form>',
      '</aside>',
      '</div>'
    ].join('')
    var back = detail.querySelector('[data-api-trip-back]')
    if (back) back.addEventListener('click', function () {
      localStorage.removeItem(API_TRIP_ID_KEY)
      detail.remove()
      setTripDetailMode(panel, false)
    })
    normalizeTravelEntryForm()
    initApiTravelLocationMap(detail)
    renderApiTripRecords(detail, trip.id)
    var first = detail.querySelector('[data-field="travel-title"]')
    if (first) window.setTimeout(function () { first.focus() }, 120)
  }

  function initApiTravelLocationMap(detail) {
    var form = detail && detail.querySelector('.api-travel-record-form')
    if (!form) return
    var input = form.querySelector('[data-field="travel-location"]')
    var map = form.querySelector('[data-travel-location-map]')
    if (!input || !map) return
    input.addEventListener('family-platform-location-selected', function (event) {
      var data = event.detail || {}
      renderApiLocationPreview(map, data.latitude, data.longitude, data.label || input.value)
    })
  }

  function renderApiLocationPreview(map, latitude, longitude, label) {
    latitude = Number(latitude)
    longitude = Number(longitude)
    if (!map || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === 0 || longitude === 0) return
    map.innerHTML = '<iframe title="' + escapeHtml(label || '\uC704\uCE58') + '" src="https://maps.google.com/maps?q=' +
      encodeURIComponent(latitude + ',' + longitude) + '&z=15&output=embed" loading="lazy"></iframe>'
  }

  function setTripDetailMode(panel, enabled) {
    if (!panel) return
    panel.classList.toggle('detail-mode', !!enabled)
    panel.classList.toggle('list-mode', !enabled)
    panel.querySelectorAll('.trip-list, .trip-add-row, .travel-trip-create-card').forEach(function (node) {
      node.hidden = !!enabled
      if (enabled) node.style.setProperty('display', 'none', 'important')
      else node.style.removeProperty('display')
    })
  }

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!nav || getCleanText(nav).indexOf('\uC5EC\uD589') < 0) return
    forceTravelListModeNow()
    ;[80, 240, 600].forEach(function (delay) {
      window.setTimeout(forceTravelListModeNow, delay)
    })
  }, true)

  function renderApiTripRecords(detail, tripId) {
    var list = detail && detail.querySelector('.api-trip-record-list')
    if (!list) return
    list.innerHTML = '<p class="empty-note">\uC5EC\uD589 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchTripRecords(tripId).then(function (records) {
      updateApiTripSummary(detail, records)
      if (!records.length) {
        list.innerHTML = '<p class="empty-note">\uB4F1\uB85D\uB41C \uC5EC\uD589 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      list.innerHTML = records.map(function (record) {
        return '<article class="travel-record-card api-travel-record-card"><strong>' + escapeHtml(record.title || '') + '</strong>' +
          '<span>' + escapeHtml([record.recordDate || '', record.recordTime || '', record.category || '', record.location || ''].filter(Boolean).join(' \u00B7 ')) + '</span>' +
          '<p>' + escapeHtml(record.note || '') + '</p></article>'
      }).join('')
    })
  }

  function updateApiTripSummary(detail, records) {
    records = Array.isArray(records) ? records : []
    var totalNode = detail && detail.querySelector('[data-trip-total-amount]')
    var orderNode = detail && detail.querySelector('[data-trip-next-order]')
    var total = records.reduce(function (sum, item) { return sum + Number(item.amount || 0) }, 0)
    if (totalNode) totalNode.textContent = total.toLocaleString('ko-KR') + '\uC6D0'
    if (orderNode) orderNode.textContent = String(records.length + 1).padStart(2, '0')
    var formOrder = detail && detail.querySelector('[data-field="travel-sort-order"]')
    if (formOrder) setInputValue(formOrder, String(records.length + 1))
    renderApiTripRouteMap(detail, records)
  }

  function renderApiTripRouteMap(detail, records) {
    var map = detail && detail.querySelector('[data-trip-route-map]')
    var empty = detail && detail.querySelector('[data-trip-route-empty]')
    if (!map) return
    var candidates = records.filter(function (record) {
      return hasTravelRecordCoordinates(record) || String(record.location || '').trim()
    })
    if (!candidates.length) {
      map.innerHTML = ''
      if (empty) empty.hidden = false
      return
    }
    var first = candidates.find(hasTravelRecordCoordinates) || candidates[0]
    var query = hasTravelRecordCoordinates(first) ? first.latitude + ',' + first.longitude : first.location
    map.innerHTML = '<iframe loading="lazy" title="\uC5EC\uD589 \uACBD\uB85C \uC9C0\uB3C4" src="https://maps.google.com/maps?q=' +
      encodeURIComponent(query) + '&z=13&output=embed"></iframe>'
    if (empty) empty.hidden = true
  }

  function hasTravelRecordCoordinates(record) {
    var latitude = Number(record && record.latitude)
    var longitude = Number(record && record.longitude)
    return Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)
  }
  function ensureServerSchedulePanel() {
    removeDeveloperServerPanels()
    return
    var card = document.querySelector('.schedule-list-card')
    if (!card || card.querySelector('.server-schedule-list')) return
    var list = document.createElement('div')
    list.className = 'server-schedule-list'
    list.innerHTML = '<div class="server-data-heading"><strong>DB 일정</strong><span>서버 저장 데이터</span></div><div class="server-data-list"></div>'
    card.appendChild(list)
  }

  function renderCalendarServerSchedules(force) {
    removeDeveloperServerPanels()
    return
    if (!document.querySelector('.family-calendar-panel')) return
    ensureServerSchedulePanel()
    var panel = document.querySelector('.server-schedule-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    var range = rangeForCalendarMode()
    var key = range.start + ':' + range.end
    if (!force && panel.dataset.rangeKey === key) return
    panel.dataset.rangeKey = key
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uC77C\uC815\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    loadCalendarScheduleCache(force).then(function (items) {
      if (!items.length) {
        list.innerHTML = '<p class="server-data-empty">\uD574\uB2F9 \uAE30\uAC04\uC5D0 DB \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      list.innerHTML = items.slice(0, 20).map(function (item) {
        return '<button type="button" class="server-schedule-row" data-api-schedule-id="' + item.id + '">' +
          '<span>' + escapeHtml((item.scheduleDate || '').replace(/-/g, '.')) + '</span>' +
          '<strong>' + escapeHtml(scheduleTimeText(item) + ' ' + item.title) + '</strong>' +
          '<small>' + escapeHtml((item.category || '\uC77C\uC815') + (item.memo ? ' · ' + item.memo : '')) + '</small>' +
          '</button>'
      }).join('')
    })
  }

  function ensureServerLedgerPanel() {
    removeDeveloperServerPanels()
    return
    if (!document.querySelector('.ledger-form') && !document.querySelector('.daily-ledger')) return
    if (document.querySelector('.server-ledger-list')) return
    var anchor = document.querySelector('.daily-ledger') || document.querySelector('.ledger-form')
    if (!anchor || !anchor.parentElement) return
    var panel = document.createElement('section')
    panel.className = 'panel server-ledger-list'
    panel.innerHTML = '<header class="panel-header"><h2>DB 가계부 내역</h2><button type="button">서버 조회</button></header><div class="server-data-list"></div>'
    anchor.parentElement.insertBefore(panel, anchor.nextSibling)
  }

  function renderLedgerServerEntries(force) {
    removeDeveloperServerPanels()
    return
    if (getCleanText(document.querySelector('.topbar h1')) !== '\uAC00\uACC4\uBD80') return
    ensureServerLedgerPanel()
    var panel = document.querySelector('.server-ledger-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    var range = monthRangeFor(todayText())
    var key = range.start + ':' + range.end
    if (!force && panel.dataset.rangeKey === key) return
    panel.dataset.rangeKey = key
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uAC00\uACC4\uBD80\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchLedgerEntries(range.start, range.end).then(function (items) {
      if (!items.length) {
        list.innerHTML = '<p class="server-data-empty">\uC774\uBC88 \uB2EC DB \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      list.innerHTML = items.slice(0, 20).map(function (item) {
        return '<div class="ledger-row api-ledger-row" data-api-ledger-id="' + item.id + '">' +
          '<div><strong>' + escapeHtml(item.title) + '</strong><span>' +
          escapeHtml((item.transactionDate || '').replace(/-/g, '.') + ' · ' + (item.category || '-') + ' · ' + (item.memberName || '-')) +
          '</span></div><span>' + escapeHtml(item.paymentMethod || '-') + '</span><b class="' + escapeHtml(item.entryType || 'expense') + '">' +
          escapeHtml(moneyText(item.amount, item.entryType)) + '</b></div>'
      }).join('')
    })
  }

  function fetchTrips() {
    if (!getStoredAuthToken()) return Promise.resolve([])
    return readWithReadableFamily(function (familyId) {
      return '/trips?familyId=' + encodeURIComponent(familyId)
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchTripRecords(tripId) {
    if (!tripId || !getStoredAuthToken()) return Promise.resolve([])
    return apiRequest('/trips/' + encodeURIComponent(tripId) + '/records?_=' + encodeURIComponent(Date.now())).then(function (items) {
      window.__familyLastTripRecordsError = ''
      return Array.isArray(items) ? items : []
    }).catch(function (error) {
      window.__familyLastTripRecordsError = apiActionErrorMessage(error, '\uC5EC\uD589 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      throw error
    })
  }

  function ensureServerTravelPanel() {
    removeDeveloperServerPanels()
    return
    if (!document.querySelector('.travel-form') && !document.querySelector('.trip-list') && !document.querySelector('.travel-summary')) return
    if (document.querySelector('.server-travel-list')) return
    var anchor = document.querySelector('.trip-list') || document.querySelector('.travel-summary') || document.querySelector('.travel-form')
    if (!anchor || !anchor.parentElement) return
    var panel = document.createElement('section')
    panel.className = 'panel server-travel-list server-domain-panel'
    panel.innerHTML = '<header class="panel-header"><h2>DB 여행 기록</h2><button type="button">서버 조회</button></header><div class="server-data-list"></div>'
    anchor.parentElement.insertBefore(panel, anchor.nextSibling)
  }

  function renderTravelServerEntries(force) {
    removeDeveloperServerPanels()
    return
    if (getCleanText(document.querySelector('.topbar h1')) !== '\uC5EC\uD589') return
    ensureServerTravelPanel()
    var panel = document.querySelector('.server-travel-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    if (!force && panel.dataset.loaded === 'true') return
    panel.dataset.loaded = 'true'
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uC5EC\uD589\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchTrips().then(function (trips) {
      if (!trips.length) {
        list.innerHTML = '<p class="server-data-empty">DB \uC5EC\uD589 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      return Promise.all(trips.slice(0, 5).map(function (trip) {
        return fetchTripRecords(trip.id).then(function (records) {
          return { trip: trip, records: records }
        })
      })).then(function (groups) {
        list.innerHTML = groups.map(function (group) {
          var total = group.records.reduce(function (sum, item) { return sum + Number(item.amount || 0) }, 0)
          var first = group.records[0]
          return '<article class="server-domain-row" data-api-trip-id="' + group.trip.id + '">' +
            '<div><strong>' + escapeHtml(group.trip.title) + '</strong><span>' +
            escapeHtml((group.trip.startDate || '') + ' ~ ' + (group.trip.endDate || '')) +
            '</span></div><b>' + escapeHtml(total.toLocaleString('ko-KR') + '\uC6D0') + '</b>' +
            (first ? '<small>' + escapeHtml(first.title + ' · ' + (first.location || '')) + '</small>' : '<small>\uC5EC\uD589 \uAE30\uB85D \uC5C6\uC74C</small>') +
            '</article>'
        }).join('')
      })
    })
  }

  function fetchDiaries(startDate, endDate) {
    if (!getStoredAuthToken()) return Promise.resolve([])
    return readWithReadableFamily(function (familyId) {
      return '/diaries?familyId=' + encodeURIComponent(familyId) +
        '&startDate=' + encodeURIComponent(startDate) +
        '&endDate=' + encodeURIComponent(endDate)
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchBabies() {
    if (!getStoredAuthToken()) return Promise.resolve([])
    return readWithReadableFamily(function (familyId) {
      return '/babies?familyId=' + encodeURIComponent(familyId)
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchBabyRecords(babyId, startDate, endDate) {
    if (!babyId || !getStoredAuthToken()) return Promise.resolve([])
    return apiRequest('/babies/' + encodeURIComponent(babyId) + '/records' +
      '?startDate=' + encodeURIComponent(startDate) +
      '&endDate=' + encodeURIComponent(endDate)).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function ensureServerTravelPanel() {
    removeDeveloperServerPanels()
    return
    if (!document.querySelector('.travel-form') && !document.querySelector('.trip-list') && !document.querySelector('.travel-summary')) return
    if (document.querySelector('.server-travel-list')) return
    var anchor = document.querySelector('.trip-list') || document.querySelector('.travel-summary') || document.querySelector('.travel-form')
    if (!anchor || !anchor.parentElement) return
    var panel = document.createElement('section')
    panel.className = 'panel server-travel-list server-domain-panel'
    panel.innerHTML = '<header class="panel-header"><h2>DB 여행 기록</h2><button type="button">서버 조회</button></header><div class="server-data-list"></div>'
    anchor.parentElement.insertBefore(panel, anchor.nextSibling)
  }

  function renderTravelServerEntries(force) {
    removeDeveloperServerPanels()
    return
    if (getCleanText(document.querySelector('.topbar h1')) !== '\uC5EC\uD589') return
    ensureServerTravelPanel()
    var panel = document.querySelector('.server-travel-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    if (!force && panel.dataset.loaded === 'true') return
    panel.dataset.loaded = 'true'
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uC5EC\uD589\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchTrips().then(function (trips) {
      if (!trips.length) {
        list.innerHTML = '<p class="server-data-empty">DB \uC5EC\uD589 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      return Promise.all(trips.slice(0, 5).map(function (trip) {
        return fetchTripRecords(trip.id).then(function (records) {
          return { trip: trip, records: records }
        })
      })).then(function (groups) {
        list.innerHTML = groups.map(function (group) {
          var total = group.records.reduce(function (sum, item) { return sum + Number(item.amount || 0) }, 0)
          var first = group.records[0]
          return '<article class="server-domain-row" data-api-trip-id="' + group.trip.id + '">' +
            '<div><strong>' + escapeHtml(group.trip.title) + '</strong><span>' +
            escapeHtml((group.trip.startDate || '') + ' ~ ' + (group.trip.endDate || '')) +
            '</span></div><b>' + escapeHtml(total.toLocaleString('ko-KR') + '\uC6D0') + '</b>' +
            (first ? '<small>' + escapeHtml(first.title + ' · ' + (first.location || '')) + '</small>' : '<small>\uC5EC\uD589 \uAE30\uB85D \uC5C6\uC74C</small>') +
            '</article>'
        }).join('')
      })
    })
  }

  function ensureServerDiaryPanel() {
    removeDeveloperServerPanels()
    return
    if (!document.querySelector('.diary-list') && !document.querySelector('.diary-grid') && !document.querySelector('.diary-form')) return
    if (document.querySelector('.server-diary-list')) return
    var anchor = document.querySelector('.diary-list') || document.querySelector('.diary-grid') || document.querySelector('.diary-form')
    if (!anchor || !anchor.parentElement) return
    var panel = document.createElement('section')
    panel.className = 'panel server-diary-list server-domain-panel'
    panel.innerHTML = '<header class="panel-header"><h2>DB 일기</h2><button type="button">서버 조회</button></header><div class="server-data-list"></div>'
    anchor.parentElement.insertBefore(panel, anchor.nextSibling)
  }

  function renderDiaryServerEntries(force) {
    removeDeveloperServerPanels()
    return
    if (getCleanText(document.querySelector('.topbar h1')) !== '\uC77C\uAE30') return
    ensureServerDiaryPanel()
    var panel = document.querySelector('.server-diary-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    var range = monthRangeFor(todayText())
    var key = range.start + ':' + range.end
    if (!force && panel.dataset.rangeKey === key) return
    panel.dataset.rangeKey = key
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uC77C\uAE30\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchDiaries(range.start, range.end).then(function (items) {
      if (!items.length) {
        list.innerHTML = '<p class="server-data-empty">\uC774\uBC88 \uB2EC DB \uC77C\uAE30\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      list.innerHTML = items.slice(0, 12).map(function (item) {
        var temp = item.minTemperature || item.maxTemperature
          ? (item.minTemperature || '-') + '/' + (item.maxTemperature || '-') + '\uB3C4'
          : '\uC628\uB3C4 \uBBF8\uC785\uB825'
        return '<article class="server-domain-row" data-api-diary-id="' + item.id + '">' +
          '<div><strong>' + escapeHtml(item.title) + '</strong><span>' +
          escapeHtml((item.diaryDate || '').replace(/-/g, '.') + ' · ' + (item.weather || '\uB0A0\uC528 \uBBF8\uC785\uB825') + ' · ' + temp) +
          '</span></div><small>' + escapeHtml(item.body || '') + '</small></article>'
      }).join('')
    })
  }

  function ensureServerBabyPanel() {
    removeDeveloperServerPanels()
    return
    if (!document.querySelector('.baby-card') && !document.querySelector('.baby-record-list') && !document.querySelector('.baby-record-row')) return
    if (document.querySelector('.server-baby-list')) return
    var anchor = document.querySelector('.baby-record-list') || document.querySelector('.baby-card')
    if (!anchor || !anchor.parentElement) return
    var panel = document.createElement('section')
    panel.className = 'panel server-baby-list server-domain-panel'
    panel.innerHTML = '<header class="panel-header"><h2>DB 육아 기록</h2><button type="button">서버 조회</button></header><div class="server-data-list"></div>'
    anchor.parentElement.insertBefore(panel, anchor.nextSibling)
  }

  function renderBabyApiCards(force) {
    if (getCleanText(document.querySelector('.topbar h1')) !== '\uC721\uC544') return
    if (!getStoredAuthToken()) return
    if (force) {
      restoreBabyListGrid()
      document.querySelectorAll('.baby-api-detail, .baby-detail').forEach(function (detail) {
        detail.remove()
      })
    } else if (document.querySelector('.baby-detail')) {
      return
    }
    var grid = document.querySelector('.baby-list-grid')
    if (!grid) {
      var panel = Array.from(document.querySelectorAll('.panel')).find(function (item) {
        return getCleanText(item.querySelector('.panel-header h2, h2')).indexOf('\uC721\uC544') >= 0
      })
      if (!panel) return
      grid = document.createElement('div')
      grid.className = 'baby-list-grid'
      panel.appendChild(grid)
    }
    grid.hidden = false
    if (!force && grid.dataset.apiLoaded === 'true') return
    if (grid.dataset.apiLoading === 'true') return
    var hasRenderedCards = grid.querySelector('.baby-card[data-api-baby-id]')
    grid.dataset.apiLoaded = 'true'
    grid.dataset.apiLoading = 'true'
    if (!hasRenderedCards) {
      grid.innerHTML = '<div class="api-empty-row baby-api-empty"><strong>\uC544\uC774 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</strong></div>'
    }
    fetchBabies().then(function (babies) {
      window.__familyBabyItemsById = Object.create(null)
      if (!babies.length) {
        grid.innerHTML = '<div class="api-empty-row baby-api-empty"><strong>\uB4F1\uB85D\uB41C \uC544\uC774\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</strong></div>'
        return
      }
      grid.innerHTML = babies.map(function (baby) {
        window.__familyBabyItemsById[String(baby.id)] = baby
        var growth = [baby.latestHeightCm ? baby.latestHeightCm + 'cm' : '', baby.latestWeightKg ? baby.latestWeightKg + 'kg' : ''].filter(Boolean).join(' \u00B7 ')
        return [
          '<article class="baby-card" role="button" tabindex="0" data-api-baby-id="' + escapeHtml(baby.id) + '">',
          '<div><span class="baby-card-avatar">\uC544\uC774</span></div>',
          '<div><strong>' + escapeHtml(baby.name || '-') + '</strong>',
          '<span>' + escapeHtml([baby.gender || '', baby.birthDate || ''].filter(Boolean).join(' \u00B7 ')) + '</span>',
          '<p>' + escapeHtml(baby.memo || '') + '</p>',
          '<small>' + escapeHtml(growth || '\uC131\uC7A5 \uAE30\uB85D \uC5C6\uC74C') + '</small>',
          '</div>',
          '<span class="baby-card-actions"><button type="button" class="baby-card-edit-button">\uC218\uC815</button><button type="button" class="danger-button baby-card-delete-button" data-api-baby-delete-id="' + escapeHtml(baby.id) + '">\uC0AD\uC81C</button></span>',
          '</article>'
        ].join('')
      }).join('')
      bindBabyCardDetailEvents(grid)
    }).catch(function (error) {
      if (!hasRenderedCards) {
        grid.innerHTML = '<div class="api-empty-row baby-api-empty"><strong>' + escapeHtml(apiActionErrorMessage(error, '\uC544\uC774 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')) + '</strong></div>'
      }
    }).finally(function () {
      delete grid.dataset.apiLoading
    })
  }

  function babyMetaText(baby) {
    return [baby.gender || '', baby.birthDate || ''].filter(Boolean).join(' \u00B7 ')
  }

  function babyGrowthText(baby) {
    return [baby.latestHeightCm ? baby.latestHeightCm + 'cm' : '', baby.latestWeightKg ? baby.latestWeightKg + 'kg' : ''].filter(Boolean).join(' \u00B7 ') || '\uC131\uC7A5 \uAE30\uB85D \uC5C6\uC74C'
  }

  function renderBabyApiRecordRows(detail, babyId) {
    var list = detail && detail.querySelector('.baby-record-list')
    if (!list) return
    list.innerHTML = '<div class="api-empty-row">\uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</div>'
    var range = monthRangeFor(todayText())
    fetchBabyRecords(babyId, range.start, range.end).then(function (records) {
      var visibleRecords = records.filter(function (record) {
        return record.recordType !== '\uC131\uC7A5'
      })
      if (!visibleRecords.length) {
        list.innerHTML = '<div class="api-empty-row">\uB4F1\uB85D\uB41C \uC721\uC544 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>'
        return
      }
      list.innerHTML = visibleRecords.map(function (record) {
        var metrics = [
          record.amountMl ? record.amountMl + 'ml' : '',
          record.heightCm ? record.heightCm + 'cm' : '',
          record.weightKg ? record.weightKg + 'kg' : ''
        ].filter(Boolean).join(' \u00B7 ')
        return '<article class="baby-record-row api-baby-record-row" data-api-baby-record-id="' + escapeHtml(record.id) + '">' +
          '<div><strong>' + escapeHtml(record.recordType || '\uAE30\uB85D') + '</strong>' +
          '<span>' + escapeHtml([record.recordDate || '', record.recordTime || '', metrics].filter(Boolean).join(' \u00B7 ')) + '</span>' +
          '<p>' + escapeHtml(record.memo || '') + '</p></div>' +
          '</article>'
      }).join('')
    }).catch(function (error) {
      list.innerHTML = '<div class="api-empty-row">' + escapeHtml(apiActionErrorMessage(error, '\uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')) + '</div>'
    })
  }

  function openBabyApiDetailById(babyId) {
    if (!babyId) return
    var cached = window.__familyBabyItemsById && window.__familyBabyItemsById[String(babyId)]
    if (cached) {
      openBabyApiDetail(cached)
      return
    }
    fetchBabies().then(function (babies) {
      var baby = babies.find(function (item) { return String(item.id) === String(babyId) })
      if (baby) openBabyApiDetail(baby)
      else showPatchToast('\uC544\uC774 \uC815\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.')
    })
  }

  function openBabyCardDetail(card, event) {
    if (!card || !card.dataset.apiBabyId) return
    if (event && event.target && event.target.closest && event.target.closest('button, a, input, select, textarea')) return
    if (event) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    }
    openBabyApiDetailById(card.dataset.apiBabyId)
  }

  function detachBabyListGrid(grid) {
    if (!grid || !grid.parentElement) return
    if (window.__familyDetachedBabyListGrid && window.__familyDetachedBabyListGrid.grid === grid) return window.__familyDetachedBabyListGrid.marker
    var marker = document.createComment('family-baby-list-grid')
    grid.parentElement.insertBefore(marker, grid)
    grid.remove()
    window.__familyDetachedBabyListGrid = { grid: grid, marker: marker }
    return marker
  }

  function restoreBabyListGrid() {
    var detached = window.__familyDetachedBabyListGrid
    if (!detached || !detached.grid || !detached.marker) return document.querySelector('.baby-list-grid')
    if (detached.marker.parentElement) {
      detached.marker.parentElement.insertBefore(detached.grid, detached.marker)
      detached.marker.remove()
    }
    detached.grid.hidden = false
    delete window.__familyDetachedBabyListGrid
    return detached.grid
  }

  function bindBabyCardDetailEvents(root) {
    ;(root || document).querySelectorAll('.baby-card[data-api-baby-id]').forEach(function (card) {
      if (card.dataset.detailClickReady === 'true') return
      card.dataset.detailClickReady = 'true'
      card.addEventListener('click', function (event) {
        openBabyCardDetail(card, event)
      }, true)
      card.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return
        openBabyCardDetail(card, event)
      }, true)
    })
  }

  function openBabyApiDetail(baby) {
    var grid = document.querySelector('.baby-list-grid')
    if (!grid) return
    var old = document.querySelector('.baby-api-detail')
    if (old) old.remove()
    var listMarker = detachBabyListGrid(grid)
    var detail = document.createElement('section')
    detail.className = 'baby-detail baby-api-detail'
    detail.dataset.apiBabyId = baby.id
    detail.innerHTML = [
      '<button type="button" class="back-button">\uBAA9\uB85D</button>',
      '<div class="baby-api-detail-layout"><div class="baby-api-detail-main">',
      '<article class="baby-profile-band">',
      '<span class="baby-avatar large">\uC544\uC774</span>',
      '<div><strong>' + escapeHtml(baby.name || '-') + '</strong><span>' + escapeHtml(babyMetaText(baby)) + '</span><p>' + escapeHtml(baby.memo || '') + '</p><small>' + escapeHtml(babyGrowthText(baby)) + '</small></div>',
      '</article>',
      '<section class="baby-growth-api-panel"><header><h3>\uC131\uC7A5 \uAE30\uB85D</h3><button type="button" class="secondary-action baby-growth-history-button" data-baby-growth-history>\uACFC\uAC70\uC131\uC7A5\uAE30\uB85D</button></header><form class="baby-growth-api-form"><label class="date-picker-field baby-growth-date-field form-field"><span class="form-label">\uB0A0\uC9DC</span><input name="recordDate" type="hidden" required value="' + todayText() + '" /><button type="button" class="date-picker-trigger baby-growth-date-button form-control" data-baby-growth-date-trigger><span>' + todayText().replace(/-/g, '.') + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2v4M16 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></label><label class="form-field"><span class="form-label">\uD0A4(cm)</span><input class="form-control" name="heightCm" type="text" inputmode="decimal" autocomplete="off" /></label><label class="form-field"><span class="form-label">\uBAB8\uBB34\uAC8C(kg)</span><input class="form-control" name="weightKg" type="text" inputmode="decimal" autocomplete="off" /></label><button type="submit" class="save-button">\uC800\uC7A5</button></form><div class="baby-growth-api-history"></div></section>',
      '<section class="baby-pattern-api-panel"><header><h3>\uC0DD\uD65C \uD328\uD134</h3><span>\uC774\uBC88 \uB2EC</span></header><div class="baby-pattern-api-summary"></div></section>',
      '<section class="baby-record-list"></section>',
      '</div><aside class="baby-api-detail-side"></aside></div>'
    ].join('')
    if (listMarker && listMarker.parentElement) {
      listMarker.parentElement.insertBefore(detail, listMarker.nextSibling)
    } else {
      grid.insertAdjacentElement('afterend', detail)
    }
    var back = detail.querySelector('.back-button')
    if (back) {
      back.addEventListener('click', function () {
        detail.remove()
        restoreBabyListGrid()
      })
    }
    ensureBabyApiRecordForm()
    bindBabyGrowthDateField(detail)
    normalizeTimeInputs(detail)
    renderBabyApiRecordRows(detail, baby.id)
    renderBabyGrowthHistory(detail, baby.id)
    window.setTimeout(function () {
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function renderBabyGrowthHistory(detail, babyId) {
    var history = detail && detail.querySelector('.baby-growth-api-history')
    if (!history) return
    history.innerHTML = '<div class="api-empty-row">\uC131\uC7A5 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</div>'
    fetchBabyRecords(babyId, '2000-01-01', '2099-12-31').then(function (records) {
      var growthRecords = records.filter(function (record) {
        return record.heightCm || record.weightKg
      }).sort(compareBabyRecordDate)
      window.__familyBabyGrowthRecordsByBabyId = window.__familyBabyGrowthRecordsByBabyId || Object.create(null)
      window.__familyBabyGrowthRecordsByBabyId[String(babyId)] = growthRecords
      renderBabyPatternSummary(detail, records)
      if (!growthRecords.length) {
        history.innerHTML = '<div class="api-empty-row">\uC131\uC7A5 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>'
        return
      }
      history.innerHTML = buildBabyGrowthChartAndList(growthRecords)
    }).catch(function (error) {
      history.innerHTML = '<div class="api-empty-row">' + escapeHtml(apiActionErrorMessage(error, '\uC131\uC7A5 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')) + '</div>'
    })
  }

  function openBabyGrowthHistoryDialog(detail, babyId) {
    if (!detail || !babyId) return
    var old = document.querySelector('.baby-growth-history-backdrop')
    if (old) old.remove()
    var backdrop = document.createElement('div')
    backdrop.className = 'baby-profile-edit-backdrop baby-growth-history-backdrop'
    var dialog = document.createElement('section')
    dialog.className = 'baby-profile-edit-dialog baby-growth-history-dialog'
    dialog.innerHTML = [
      '<button type="button" class="dialog-close">x</button>',
      '<header><h2>\uACFC\uAC70\uC131\uC7A5\uAE30\uB85D</h2><p>\uB0A0\uC9DC\uBCC4 \uD0A4\uC640 \uBAB8\uBB34\uAC8C\uB97C \uD655\uC778\uD558\uACE0 \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p></header>',
      '<div class="baby-growth-history-dialog-list"><div class="api-empty-row">\uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</div></div>'
    ].join('')
    backdrop.appendChild(dialog)
    document.body.appendChild(backdrop)
    var close = function () { backdrop.remove() }
    dialog.querySelector('.dialog-close').addEventListener('click', close)
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) close()
    })
    var list = dialog.querySelector('.baby-growth-history-dialog-list')
    fetchBabyRecords(babyId, '2000-01-01', '2099-12-31').then(function (records) {
      var growthRecords = records.filter(function (record) {
        return record.heightCm || record.weightKg
      }).sort(compareBabyRecordDate).reverse()
      window.__familyBabyGrowthRecordsByBabyId = window.__familyBabyGrowthRecordsByBabyId || Object.create(null)
      window.__familyBabyGrowthRecordsByBabyId[String(babyId)] = growthRecords.slice().reverse()
      if (!growthRecords.length) {
        list.innerHTML = '<div class="api-empty-row">\uC131\uC7A5 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>'
        return
      }
      list.innerHTML = growthRecords.map(function (record) {
        var metrics = [
          record.heightCm ? record.heightCm + 'cm' : '',
          record.weightKg ? record.weightKg + 'kg' : ''
        ].filter(Boolean).join(' \u00B7 ')
        return '<article class="baby-growth-history-dialog-row" data-growth-record-id="' + escapeHtml(record.id) + '"><div><strong>' + escapeHtml(formatBabyRecordDateTime(record)) + '</strong><span>' + escapeHtml(metrics || '-') + '</span></div><div class="baby-growth-history-dialog-actions"><button type="button" class="edit-button" data-growth-edit-id="' + escapeHtml(record.id) + '">\uC218\uC815</button><button type="button" class="danger-button" data-growth-delete-id="' + escapeHtml(record.id) + '">\uC0AD\uC81C</button></div></article>'
      }).join('')
    }).catch(function (error) {
      list.innerHTML = '<div class="api-empty-row">' + escapeHtml(apiActionErrorMessage(error, '\uC131\uC7A5 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')) + '</div>'
    })
    list.addEventListener('click', function (event) {
      var edit = event.target && event.target.closest && event.target.closest('[data-growth-edit-id]')
      var del = event.target && event.target.closest && event.target.closest('[data-growth-delete-id]')
      if (edit) {
        var record = findBabyGrowthRecord(babyId, edit.dataset.growthEditId)
        if (record) {
          close()
          fillBabyGrowthFormForEdit(detail, record)
        }
        return
      }
      if (del) {
        var deleteId = del.dataset.growthDeleteId
        showPatchConfirm('\uC131\uC7A5 \uAE30\uB85D\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
          apiRequest('/baby-records/' + encodeURIComponent(deleteId), { method: 'DELETE' }).then(function () {
            showPatchToast('\uC131\uC7A5 \uAE30\uB85D\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
            close()
            renderBabyApiRecordRows(detail, babyId)
            renderBabyGrowthHistory(detail, babyId)
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uC131\uC7A5 \uAE30\uB85D \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      }
    })
  }

  function findBabyGrowthRecord(babyId, recordId) {
    var records = window.__familyBabyGrowthRecordsByBabyId && window.__familyBabyGrowthRecordsByBabyId[String(babyId)]
    return (records || []).find(function (record) { return String(record.id) === String(recordId) })
  }

  function fillBabyGrowthFormForEdit(detail, record) {
    var form = detail && detail.querySelector('.baby-growth-api-form')
    if (!form || !record) return
    form.dataset.growthEditId = record.id
    var dateInput = form.querySelector('[name="recordDate"]')
    var dateText = form.querySelector('[data-baby-growth-date-trigger] span')
    if (dateInput) dateInput.value = record.recordDate || todayText()
    if (dateText) dateText.textContent = String(record.recordDate || todayText()).replace(/-/g, '.')
    var height = form.querySelector('[name="heightCm"]')
    var weight = form.querySelector('[name="weightKg"]')
    if (height) height.value = record.heightCm || ''
    if (weight) weight.value = record.weightKg || ''
    var submit = form.querySelector('button[type="submit"]')
    if (submit) submit.textContent = '\uC218\uC815 \uC800\uC7A5'
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(function () {
      var target = height || weight || form.querySelector('[data-baby-growth-date-trigger]')
      if (target) target.focus()
    }, 160)
  }

  function compareBabyRecordDate(a, b) {
    return String((a.recordDate || '') + ' ' + (a.recordTime || '')).localeCompare(String((b.recordDate || '') + ' ' + (b.recordTime || '')))
  }

  function formatBabyRecordDateTime(record) {
    var source = String(record.recordDate || '')
    var parts = source.split('-')
    var date = source.replace(/-/g, '.')
    if (parts.length === 3) {
      var parsed = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      var weekdays = ['일', '월', '화', '수', '목', '금', '토']
      if (!Number.isNaN(parsed.getTime())) {
        date = parts[0] + '. ' + parts[1] + '. ' + parts[2] + '(' + weekdays[parsed.getDay()] + ')'
      }
    }
    return [date, record.recordTime || ''].filter(Boolean).join(' ')
  }

  function formatBabyRecordDate(record) {
    var source = String(record.recordDate || '')
    var parts = source.split('-')
    var date = source.replace(/-/g, '.')
    if (parts.length === 3) {
      var parsed = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      var weekdays = ['일', '월', '화', '수', '목', '금', '토']
      if (!Number.isNaN(parsed.getTime())) {
        date = parts[0] + '. ' + parts[1] + '. ' + parts[2] + '(' + weekdays[parsed.getDay()] + ')'
      }
    }
    return date
  }

  function babyGrowthNumber(value) {
    if (value === null || typeof value === 'undefined' || value === '') return null
    var number = Number(value)
    return Number.isFinite(number) ? number : null
  }

  function babyGrowthMetricValue(record, mode) {
    var value = babyGrowthNumber(mode === 'weight' ? record.weightKg : record.heightCm)
    if (value === null) return ''
    return value + (mode === 'weight' ? 'kg' : 'cm')
  }

  function babyGrowthRecordsForMode(records, mode) {
    return records.slice().sort(compareBabyRecordDate).filter(function (record) {
      return babyGrowthNumber(mode === 'weight' ? record.weightKg : record.heightCm) !== null
    })
  }

  function resolveBabyGrowthMode(records, mode) {
    var heightRecords = babyGrowthRecordsForMode(records, 'height')
    var weightRecords = babyGrowthRecordsForMode(records, 'weight')
    var selectedMode = mode === 'weight' ? 'weight' : 'height'
    if (selectedMode === 'height' && !heightRecords.length && weightRecords.length) selectedMode = 'weight'
    if (selectedMode === 'weight' && !weightRecords.length && heightRecords.length) selectedMode = 'height'
    return selectedMode
  }

  function buildBabyGrowthChartAndList(records, mode) {
    var selectedMode = resolveBabyGrowthMode(records, mode)
    return buildBabyGrowthChart(records, selectedMode) + buildBabyGrowthHistoryList(records, selectedMode)
  }

  function buildBabyGrowthHistoryList(records, mode) {
    var selectedMode = resolveBabyGrowthMode(records, mode)
    var growthRecords = babyGrowthRecordsForMode(records, selectedMode).slice().reverse()
    if (!growthRecords.length) {
      return '<div class="growth-history detailed baby-growth-history-list" data-baby-growth-history-mode="' + selectedMode + '"><div class="api-empty-row">\uC131\uC7A5 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div></div>'
    }
    return '<div class="growth-history detailed baby-growth-history-list" data-baby-growth-history-mode="' + selectedMode + '">' + growthRecords.map(function (record, index) {
      var number = index + 1
      return '<article class="baby-growth-history-row"><strong>' + number + '. ' + escapeHtml(formatBabyRecordDate(record)) + '</strong><span>' + escapeHtml(babyGrowthMetricValue(record, selectedMode)) + '</span></article>'
    }).join('') + '</div>'
  }

  function buildBabyGrowthChart(records, mode) {
    var heightRecords = babyGrowthRecordsForMode(records, 'height')
    var weightRecords = babyGrowthRecordsForMode(records, 'weight')
    var selectedMode = resolveBabyGrowthMode(records, mode)
    var selectedRecords = selectedMode === 'weight' ? weightRecords : heightRecords
    var selectedPoints = selectedRecords.map(function (record, index) {
      return {
        index: index,
        value: babyGrowthNumber(selectedMode === 'weight' ? record.weightKg : record.heightCm),
        label: String(record.recordDate || '').slice(5).replace('-', '.')
      }
    })
    var values = selectedPoints.map(function (point) { return point.value })
    if (!values.length) return ''
    var min = Math.min.apply(null, values)
    var max = Math.max.apply(null, values)
    if (min === max) {
      min = Math.max(0, min - 1)
      max += 1
    }
    var width = 720
    var height = 280
    var left = 58
    var right = 26
    var top = 28
    var bottom = 48
    var chartWidth = width - left - right
    var chartHeight = height - top - bottom
    var maxIndex = Math.max(selectedPoints.length - 1, 1)
    function xy(point) {
      var x = left + chartWidth * (point.index / maxIndex)
      var y = top + chartHeight * (1 - ((point.value - min) / (max - min)))
      return { x: x, y: y }
    }
    function line(points) {
      return points.map(function (point) {
        var pos = xy(point)
        return pos.x.toFixed(1) + ',' + pos.y.toFixed(1)
      }).join(' ')
    }
    function dots(points, cls) {
      return points.map(function (point) {
        var pos = xy(point)
        return '<circle class="' + cls + '" cx="' + pos.x.toFixed(1) + '" cy="' + pos.y.toFixed(1) + '" r="5"><title>' + escapeHtml(point.label + ' ' + point.value) + '</title></circle>'
      }).join('')
    }
    function chartButton(buttonMode, label, hasData) {
      var active = selectedMode === buttonMode
      return '<button type="button" data-baby-growth-chart-mode="' + buttonMode + '" class="' + (active ? 'active' : '') + '" aria-pressed="' + (active ? 'true' : 'false') + '"' + (hasData ? '' : ' disabled') + '>' + label + '</button>'
    }
    var labels = [0, 0.5, 1].map(function (rate) {
      var value = max - ((max - min) * rate)
      var y = top + chartHeight * rate
      return '<line class="grid-line" x1="' + left + '" x2="' + (width - right) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text class="axis-label" x="' + (left - 8) + '" y="' + (y + 4).toFixed(1) + '">' + value.toFixed(1) + '</text>'
    }).join('')
    var xLabels = selectedPoints.filter(function (_, index) {
      return selectedPoints.length <= 4 || index === 0 || index === selectedPoints.length - 1 || index === Math.floor((selectedPoints.length - 1) / 2)
    }).map(function (point) {
      var x = left + chartWidth * (point.index / maxIndex)
      return '<text class="x-label" x="' + x.toFixed(1) + '" y="' + (height - 10) + '">' + escapeHtml(point.label) + '</text>'
    }).join('')
    var lineClass = selectedMode === 'weight' ? 'weight-line' : 'height-line'
    var dotClass = selectedMode === 'weight' ? 'weight-dot' : 'height-dot'
    var unit = selectedMode === 'weight' ? 'kg' : 'cm'
    var label = selectedMode === 'weight' ? '\uBAB8\uBB34\uAC8C' : '\uD0A4'
    return [
      '<div class="growth-chart baby-growth-chart">',
      '<div class="growth-chart-toggle" role="group" aria-label="\uC131\uC7A5 \uCC28\uD2B8 \uC9C0\uD45C">',
      chartButton('height', '\uD0A4', !!heightRecords.length),
      chartButton('weight', '\uBAB8\uBB34\uAC8C', !!weightRecords.length),
      '</div>',
      '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + label + ' \uC131\uC7A5 \uCC28\uD2B8">',
      labels,
      '<line class="axis-line" x1="' + left + '" x2="' + (width - right) + '" y1="' + (height - bottom) + '" y2="' + (height - bottom) + '"/>',
      '<polyline class="' + lineClass + '" points="' + line(selectedPoints) + '"/>' + dots(selectedPoints, dotClass),
      xLabels,
      '<text class="unit-label" x="' + left + '" y="14">' + unit + '</text>',
      '</svg></div>'
    ].join('')
  }

  function renderBabyPatternSummary(detail, records) {
    var target = detail && detail.querySelector('.baby-pattern-api-summary')
    if (!target) return
    var range = monthRangeFor(todayText())
    var monthRecords = records.filter(function (record) {
      return record.recordDate >= range.start && record.recordDate <= range.end
    })
    var types = ['\uC218\uC720', '\uB300\uBCC0', '\uC18C\uBCC0', '\uC218\uBA74', '\uC131\uC7A5', '\uBCD1\uC6D0', '\uBA54\uBAA8']
    if (!monthRecords.length) {
      target.innerHTML = '<div class="api-empty-row">\uC774\uBC88 \uB2EC \uD328\uD134 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>'
      return
    }
    target.innerHTML = '<div class="pattern-grid">' + types.map(function (type) {
      var count = monthRecords.filter(function (record) { return record.recordType === type }).length
      return '<article><strong>' + escapeHtml(type) + '</strong><span>' + count + '\uAC74</span></article>'
    }).join('') + '</div>'
  }

  function deleteBabyProfile(babyId) {
    if (!babyId) return
    apiRequest('/babies/' + encodeURIComponent(babyId), { method: 'DELETE' }).then(function () {
      document.querySelectorAll('.baby-api-detail').forEach(function (detail) {
        if (String(detail.dataset.apiBabyId || '') === String(babyId)) detail.remove()
      })
      var grid = document.querySelector('.baby-list-grid')
      if (grid) {
        delete grid.dataset.apiLoaded
        delete grid.dataset.apiLoading
        grid.hidden = false
      }
      renderBabyApiCards(true)
      showPatchToast('\uC544\uC774 \uC815\uBCF4\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
    }).catch(function (error) {
      showPatchToast(apiActionErrorMessage(error, '\uC544\uC774 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
    })
  }

  function renderBabyServerEntries(force) {
    removeDeveloperServerPanels()
    return
    if (getCleanText(document.querySelector('.topbar h1')) !== '\uC721\uC544') return
    ensureServerBabyPanel()
    var panel = document.querySelector('.server-baby-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    var range = monthRangeFor(todayText())
    var key = range.start + ':' + range.end
    if (!force && panel.dataset.rangeKey === key) return
    panel.dataset.rangeKey = key
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uC721\uC544 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchBabies().then(function (babies) {
      if (!babies.length) {
        list.innerHTML = '<p class="server-data-empty">DB \uC544\uC774 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      return Promise.all(babies.slice(0, 4).map(function (baby) {
        return fetchBabyRecords(baby.id, range.start, range.end).then(function (records) {
          return { baby: baby, records: records }
        })
      })).then(function (groups) {
        list.innerHTML = groups.map(function (group) {
          var first = group.records[0]
          var growth = [group.baby.latestHeightCm ? group.baby.latestHeightCm + 'cm' : '', group.baby.latestWeightKg ? group.baby.latestWeightKg + 'kg' : ''].filter(Boolean).join(' · ')
          return '<article class="server-domain-row" data-api-baby-id="' + group.baby.id + '">' +
            '<div><strong>' + escapeHtml(group.baby.name) + '</strong><span>' +
            escapeHtml((group.baby.gender || '-') + ' · ' + (group.baby.birthDate || '-') + (growth ? ' · ' + growth : '')) +
            '</span></div><b>' + escapeHtml(group.records.length + '\uAC74') + '</b>' +
            (first ? '<small>' + escapeHtml((first.recordDate || '') + ' ' + (first.recordTime || '') + ' · ' + first.recordType + (first.memo ? ' · ' + first.memo : '')) + '</small>' : '<small>\uC774\uBC88 \uB2EC \uAE30\uB85D \uC5C6\uC74C</small>') +
            '</article>'
        }).join('')
      })
    })
  }

  function removeDeveloperServerPanels() {
    document.querySelectorAll([
      '.server-schedule-list',
      '.server-ledger-list',
      '.server-travel-list',
      '.server-diary-list',
      '.server-baby-list'
    ].join(',')).forEach(function (panel) {
      panel.remove()
    })
  }

  var HARDCODED_DEMO_PATTERNS = []

  function hasHardcodedDemoText(text) {
    return HARDCODED_DEMO_PATTERNS.some(function (pattern) {
      return text.indexOf(pattern) >= 0
    })
  }

  function findDemoDataContainer(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null
    if (node.closest('[data-api-ledger-id], [data-api-schedule-id], [data-api-trip-id], [data-api-baby-id], [data-api-diary-id]')) return null
    return node.closest([
      '.ledger-row',
      '.task-list li',
      '.trip-list article',
      '.trip-card',
      '.trip-list-card',
      '.travel-record-card',
      '.travel-card',
      '.route-sequence-item',
      '.route-item',
      '.baby-card',
      '.baby-record-row',
      '.baby-list article',
      '.diary-card',
      '.diary-entry',
      '.timeline-row',
      '.timeline-item',
      '.schedule-pill',
      '.restaurant-card',
      '.calendar-event-pill'
    ].join(','))
  }

  function removeHardcodedDemoData() {
    Array.from(document.querySelectorAll([
      '.ledger-row',
      '.task-list li',
      '.trip-list article',
      '.trip-card',
      '.trip-list-card',
      '.travel-record-card',
      '.travel-card',
      '.route-sequence-item',
      '.route-item',
      '.baby-card',
      '.baby-record-row',
      '.baby-list article',
      '.diary-card',
      '.diary-entry',
      '.timeline-row',
      '.timeline-item',
      '.schedule-pill',
      '.restaurant-card',
    '.calendar-event-pill'
    ].join(','))).forEach(function (node) {
      if (hasHardcodedDemoText(getCleanText(node))) {
        var container = findDemoDataContainer(node)
        if (container) container.remove()
      }
    })
  }

  function refreshServerDataViews(force) {
    purgeStaleLedgerSyncQueueOnce()
    removeDeveloperServerPanels()
    cleanupPatchRootsForCurrentMenu()
    normalizeMenuCaptions()
    normalizeLedgerEntryForm()
    removeLedgerManageButton()
    normalizeTravelEntryForm()
    ensureTravelHeaderActions()
    normalizeDiaryEntryForm()
    normalizeBabyEntryForms()
    normalizeTimeInputs()
    removeFeaturePlaceholders()
    removeHardcodedDemoData()
    renderCurrentLegacyTravelApiRecords(force)
    renderHomeMetricsFromApi(force)
    renderLedgerPageFromApi(force)
    renderTravelPageFromApi(force)
    renderDiaryPageFromApi(force)
    renderBabyApiCards(force)
    renderRestaurantPageFromApi()
    if (!getStoredAuthToken()) return
    renderHomeSchedulesFromApi(force)
    renderHomeLedgerFromApi(force)
    removeFeaturePlaceholders()
    window.setTimeout(removeHardcodedDemoData, 50)
  }

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!nav) return
    schedulePlaceholderSweep()
    window.setTimeout(function () {
      refreshServerDataViews(true)
    }, 700)
  }, true)

  function getCurrentFamilyId(forceRefresh) {
    var cachedId = Number(localStorage.getItem(API_FAMILY_ID_KEY) || '')
    if (!forceRefresh && Number.isFinite(cachedId) && cachedId > 0) return Promise.resolve(cachedId)

    return apiRequest('/families').then(function (families) {
      var family = Array.isArray(families) ? families[0] : null
      if (!family || !family.id) {
        localStorage.removeItem(API_FAMILY_ID_KEY)
        throw new Error('No family group available')
      }
      localStorage.setItem(API_FAMILY_ID_KEY, String(family.id))
      return family.id
    })
  }

  function getReadableFamilyId(forceRefresh) {
    return getCurrentFamilyId(forceRefresh).catch(function () {
      return 0
    })
  }

  function readWithReadableFamily(pathFactory) {
    return getReadableFamilyId(true).then(function (familyId) {
      return apiRequest(pathFactory(familyId)).catch(function (error) {
        if (familyId > 0 && error && (error.status === 403 || error.status === 404)) {
          localStorage.removeItem(API_FAMILY_ID_KEY)
          return apiRequest(pathFactory(0))
        }
        throw error
      })
    })
  }

  function postScheduleWithFreshFamily(payload, forceRefresh) {
    return getReadableFamilyId(forceRefresh).then(function (familyId) {
      return postJson('/schedules?familyId=' + encodeURIComponent(familyId), payload)
    })
  }

  function putJson(path, body) {
    return apiRequest(path, {
      method: 'PUT',
      body: JSON.stringify(body)
    })
  }

  function updateScheduleApiItem(id, payload) {
    return putJson('/schedules/' + encodeURIComponent(id), payload)
  }

  function resolveScheduleItemId(item) {
    if (!item) return ''
    var direct = item.id != null ? item.id : (item.scheduleId != null ? item.scheduleId : item.serverId)
    if (direct != null && String(direct)) return String(direct)
    var map = window.__familyYearScheduleItemsById || {}
    var foundKey = Object.keys(map).find(function (key) {
      var candidate = map[key] || {}
      return String(candidate.title || '') === String(item.title || '') &&
        String(candidate.scheduleDate || '') === String(item.scheduleDate || '')
    })
    return foundKey || ''
  }

  function resolveFullScheduleItem(item) {
    if (!item) return item
    var map = window.__familyYearScheduleItemsById || {}
    var itemId = resolveScheduleItemId(item)
    if (itemId && map[itemId]) return map[itemId]
    var foundKey = Object.keys(map).find(function (key) {
      var candidate = map[key] || {}
      return String(candidate.title || '') === String(item.title || '') &&
        (!item.scheduleDate || String(candidate.scheduleDate || '') === String(item.scheduleDate || ''))
    })
    return foundKey ? map[foundKey] : item
  }

  function deleteScheduleApiItem(item, afterDelete) {
    item = resolveFullScheduleItem(item)
    var itemId = resolveScheduleItemId(item)
    if (!itemId) return
    showPatchConfirm('\uC77C\uC815\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
      apiRequest('/schedules/' + encodeURIComponent(itemId), { method: 'DELETE' }).then(function () {
        calendarScheduleCache.key = ''
        calendarScheduleCache.items = []
        calendarScheduleCache.loadedAt = 0
        window.__familyYearScheduleCache = null
        window.__familyYearMonthListState = null
        showPatchToast('\uC77C\uC815\uC774 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
        refreshServerDataViews(true)
        renderCalendarApiSchedules(true)
        loadScheduleNotifications(true)
        if (afterDelete) afterDelete()
      }).catch(function (error) {
        showPatchToast(apiActionErrorMessage(error, '\uC77C\uC815 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      })
    })
  }

  function parseApiDate(value) {
    if (!value) return null
    var match = String(value).match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/)
    if (!match) return null
    return [match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0')].join('-')
  }

  function todayText() {
    return formatDate(new Date())
  }

  function currentTimeText() {
    var now = new Date()
    return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  }

  function resetScheduleCreateFieldsForDate(date) {
    var form = document.querySelector('.schedule-form-card')
    if (!form) return
    if (form.dataset.editingScheduleId || window.__familyEditingScheduleId) {
      clearScheduleFormEditMode(form)
    }
    setInputValueByLabel(form, '\uC77C\uC815\uBA85', '')
    setInputValueByLabel(form, '\uC2DC\uAC04', currentTimeText())
    setInputValueByLabel(form, '\uBA54\uBAA8', '')
    var inputs = Array.from(form.querySelectorAll('input')).filter(function (input) {
      return input.type !== 'hidden' && input.type !== 'file'
    })
    if (inputs[0]) setNativeInputValue(inputs[0], '')
    var timeInput = form.querySelector('input[type="time"]') || inputs.find(function (input) {
      return /time|\d{2}:\d{2}/i.test(String(input.name || '') + ' ' + String(input.value || ''))
    })
    if (timeInput) setNativeInputValue(timeInput, currentTimeText())
    var memo = form.querySelector('textarea')
    if (memo) setNativeInputValue(memo, '')
    if (date) updateScheduleFormVisibleDate(date)
  }

  function ensureScheduleDefaultTime() {
    var form = document.querySelector('.schedule-form-card')
    if (!form || form.dataset.editingScheduleId) return
    var timeInput = setInputValueByLabel(form, '\uC2DC\uAC04', getInputValueByLabel(form, '\uC2DC\uAC04') || currentTimeText())
    if (!timeInput) {
      timeInput = form.querySelector('input[type="time"]')
    }
    if (timeInput && !String(timeInput.value || '').trim()) {
      setNativeInputValue(timeInput, currentTimeText())
    }
  }

  function getFieldValue(root, selector) {
    var field = root.querySelector(selector)
    return field ? String(field.value || field.textContent || '').trim() : ''
  }

  function getCustomSelectValue(label) {
    var labels = Array.from(document.querySelectorAll('.travel-form label, .schedule-form-card label, .ledger-form label, .diary-form label'))
    var target = labels.find(function (item) {
      return getLabelText(item) === label
    })
    if (!target) return ''
    var trigger = target.querySelector('.custom-select-trigger, button')
    return getCleanText(trigger).replace(/\s+/g, ' ').trim()
  }

  function getDatePickerValue(root, labelText) {
    var fields = Array.from(root.querySelectorAll('.date-picker-field'))
    var target = fields.find(function (field) {
      return getLabelText(field) === labelText
    }) || fields[0]
    return parseApiDate(getCleanText(target)) || todayText()
  }

  function parseAmountValue(value) {
    var digits = String(value || '').replace(/[^\d]/g, '')
    return digits ? Number(digits) : 0
  }

  function normalizeScheduleBasis(value) {
    return String(value || '').indexOf('\uC74C') >= 0 ? 'lunar' : 'solar'
  }

  function normalizeScheduleRepeat(value) {
    var text = String(value || '')
    if (text.indexOf('\uB9E4\uC8FC') >= 0 || text.toLowerCase() === 'weekly') return 'weekly'
    if (text.indexOf('\uB9E4\uC6D4') >= 0 || text.toLowerCase() === 'monthly') return 'monthly'
    if (text.indexOf('\uB9E4\uB144') >= 0 || text.indexOf('1\uB144') >= 0 || text.toLowerCase() === 'yearly') return 'yearly'
    return 'none'
  }

  function getInputValueByLabel(root, labelText) {
    var labels = Array.from(root.querySelectorAll('label'))
    var target = labels.find(function (item) {
      return getLabelText(item) === labelText
    })
    var input = target && target.querySelector('input, textarea')
    return input ? String(input.value || '').trim() : ''
  }

  function setInputValueByLabel(root, labelText, value) {
    var labels = Array.from(root.querySelectorAll('label'))
    var target = labels.find(function (item) {
      return getLabelText(item) === labelText
    })
    var input = target && target.querySelector('input, textarea')
    if (input) setNativeInputValue(input, value == null ? '' : String(value))
    return input
  }

  function setCustomSelectValueByLabel(root, labelText, value) {
    var labels = Array.from(root.querySelectorAll('label'))
    var target = labels.find(function (item) {
      return getLabelText(item) === labelText
    })
    if (!target) return
    var text = target.querySelector('.custom-select-trigger span')
    if (text) text.textContent = value || ''
    var native = target.querySelector('select')
    if (native) {
      native.value = value || ''
      native.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  function setScheduleTextInputAt(form, index, value) {
    var inputs = Array.from(form.querySelectorAll('input')).filter(function (input) {
      return input.type !== 'hidden' && input.type !== 'file'
    })
    var input = inputs[index]
    if (input) setNativeInputValue(input, value == null ? '' : String(value))
    return input
  }

  function getScheduleTextInputAt(form, index) {
    var inputs = Array.from(form.querySelectorAll('input, textarea')).filter(function (input) {
      return input.type !== 'hidden' && input.type !== 'file'
    })
    return inputs[index] ? String(inputs[index].value || '').trim() : ''
  }

  function setScheduleSelectTextAt(form, index, value) {
    var triggers = Array.from(form.querySelectorAll('.custom-select-trigger span'))
    if (triggers[index]) triggers[index].textContent = value || ''
  }

  function getScheduleSelectTextAt(form, index) {
    var triggers = Array.from(form.querySelectorAll('.custom-select-trigger span'))
    return triggers[index] ? String(triggers[index].textContent || '').trim() : ''
  }

  function fillScheduleEditForm(form, item) {
    var titleInput = setInputValueByLabel(form, '\uC77C\uC815\uBA85', item.title || '') || setScheduleTextInputAt(form, 0, item.title || '')
    if (titleInput) setNativeInputValue(titleInput, item.title || '')
    var date = parseDate(item.scheduleDate)
    if (date) {
      updateScheduleFormVisibleDate(date)
      updateJumpInput(date)
    }
    var timeText = item.scheduleTime ? String(item.scheduleTime).slice(0, 5) : ''
    var timeInput = setInputValueByLabel(form, '\uC2DC\uAC04', timeText)
    if (!timeInput) {
      var inputs = Array.from(form.querySelectorAll('input')).filter(function (input) {
        return input !== titleInput && input.type !== 'hidden' && input.type !== 'file'
      })
      timeInput = inputs.find(function (input) {
        return input.type === 'time' || /time|\d{2}:\d{2}/i.test(String(input.name || '') + ' ' + String(input.value || ''))
      }) || inputs[1]
      if (timeInput) setNativeInputValue(timeInput, timeText)
    }
    var memoInput = setInputValueByLabel(form, '\uBA54\uBAA8', item.memo || '') || form.querySelector('textarea')
    if (memoInput) setNativeInputValue(memoInput, item.memo || '')

    var basisText = item.calendarBasis === 'lunar' ? '\uC74C\uB825' : '\uC591\uB825'
    var repeatText = item.repeatRule === 'weekly' ? '\uB9E4\uC8FC' : item.repeatRule === 'monthly' ? '\uB9E4\uC6D4' : item.repeatRule === 'yearly' ? '\uB9E4\uB144' : '\uBC18\uBCF5 \uC5C6\uC74C'
    setCustomSelectValueByLabel(form, '\uAE30\uC900', basisText)
    setCustomSelectValueByLabel(form, '\uAD6C\uBD84', item.category || '\uC77C\uC815')
    setCustomSelectValueByLabel(form, '\uAC00\uC871', item.memberName || '')
    setCustomSelectValueByLabel(form, '\uBC18\uBCF5', repeatText)
    setScheduleSelectTextAt(form, 0, basisText)
    setScheduleSelectTextAt(form, 1, item.category || '\uC77C\uC815')
    setScheduleSelectTextAt(form, 2, item.memberName || '')
    setScheduleSelectTextAt(form, 3, repeatText)

    return titleInput || form.querySelector('input, textarea, .date-picker-trigger, .custom-select-trigger')
  }

  function setScheduleFormEditMode(form, item) {
    var scheduleId = resolveScheduleItemId(item)
    form.dataset.editingScheduleId = scheduleId == null ? '' : String(scheduleId)
    window.__familyEditingScheduleId = form.dataset.editingScheduleId
    form.dataset.editingScheduleDate = item.scheduleDate || ''
    form.dataset.editingScheduleOriginalDate = item.scheduleDate || ''
    var heading = form.querySelector('h2, h3')
    if (heading) heading.textContent = '\uC77C\uC815 \uC218\uC815'
    var submit = form.querySelector('button[type="submit"], .submit-action, .fc-submit')
    if (submit) submit.textContent = '\uC800\uC7A5'
    var cancel = form.querySelector('[data-schedule-edit-cancel]')
    if (!cancel && submit && submit.parentElement) {
      cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'cancel-button'
      cancel.dataset.scheduleEditCancel = 'true'
      cancel.textContent = '\uCDE8\uC18C'
      cancel.addEventListener('click', function () {
        clearScheduleFormEditMode(form)
      })
      submit.parentElement.insertBefore(cancel, submit)
    }
  }

  function clearScheduleFormEditMode(form) {
    if (!form) return
    delete form.dataset.editingScheduleId
    delete form.dataset.editingScheduleDate
    delete form.dataset.editingScheduleOriginalDate
    window.__familyEditingScheduleId = ''
    var heading = form.querySelector('h2, h3')
    if (heading) heading.textContent = '\uC77C\uC815 \uCD94\uAC00'
    var submit = form.querySelector('button[type="submit"], .submit-action, .fc-submit')
    if (submit) submit.textContent = '\uCD94\uAC00'
    var cancel = form.querySelector('[data-schedule-edit-cancel]')
    if (cancel) cancel.remove()
  }

  function closeScheduleEditPopups() {
    document.querySelectorAll('.schedule-detail-patch-backdrop, .schedule-day-patch-backdrop, .schedule-item-patch-backdrop').forEach(function (node) {
      node.remove()
    })
  }

  function focusScheduleEditTarget(target, form) {
    var focusTarget = target && target.focus ? target : form.querySelector('input:not([type="hidden"]):not([type="file"]), textarea')
    if (!focusTarget) return
    function focusNow() {
      focusTarget.focus({ preventScroll: true })
      if (document.activeElement !== focusTarget) focusTarget.focus()
      if (focusTarget.select) focusTarget.select()
    }
    focusNow()
    window.requestAnimationFrame(function () {
      focusNow()
      window.setTimeout(focusNow, 220)
    })
  }

  function startScheduleApiEdit(item) {
    item = resolveFullScheduleItem(item)
    var form = document.querySelector('.schedule-form-card')
    if (!form || !item) return
    closeScheduleEditPopups()
    setScheduleFormEditMode(form, item)
    var focusTarget = fillScheduleEditForm(form, item)
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    focusScheduleEditTarget(focusTarget, form)
  }

  function firstInputValue(root) {
    var input = root.querySelector('input')
    return input ? String(input.value || '').trim() : ''
  }

  function syncScheduleForm(form) {
    var title = getInputValueByLabel(form, '\uC77C\uC815\uBA85') || firstInputValue(form)
    if (!title) return

    var timeValue = getInputValueByLabel(form, '\uC2DC\uAC04')
    if (timeValue && !/^\d{2}:\d{2}$/.test(timeValue)) timeValue = null

    queueApiSync({
      type: 'createSchedule',
      payload: {
        title: title,
        calendarBasis: normalizeScheduleBasis(getCustomSelectValue('\uAE30\uC900')),
        scheduleDate: getScheduleFormDateValue(form),
        scheduleTime: timeValue || currentTimeText(),
        category: getCustomSelectValue('\uAD6C\uBD84') || '\uC77C\uC815',
        memberName: getCustomSelectValue('\uAC00\uC871') || null,
        repeatRule: normalizeScheduleRepeat(getCustomSelectValue('\uBC18\uBCF5')),
        memo: getInputValueByLabel(form, '\uBA54\uBAA8') || ''
      }
    })
    flushApiQueue()
  }

  function buildSchedulePayloadFromForm(form) {
    var title = getInputValueByLabel(form, '\uC77C\uC815\uBA85') || firstInputValue(form)
    if (!title) return null
    var timeValue = getInputValueByLabel(form, '\uC2DC\uAC04') || getScheduleTextInputAt(form, 1)
    if (timeValue && !/^\d{2}:\d{2}$/.test(timeValue)) timeValue = null
    var memoValue = getInputValueByLabel(form, '\uBA54\uBAA8') || (form.querySelector('textarea') ? String(form.querySelector('textarea').value || '').trim() : '')
    return {
      title: title,
      calendarBasis: normalizeScheduleBasis(getCustomSelectValue('\uAE30\uC900') || getScheduleSelectTextAt(form, 0)),
      scheduleDate: getScheduleFormDateValue(form),
      scheduleTime: timeValue || currentTimeText(),
      category: getCustomSelectValue('\uAD6C\uBD84') || getScheduleSelectTextAt(form, 1) || '\uC77C\uC815',
      memberName: getCustomSelectValue('\uAC00\uC871') || getScheduleSelectTextAt(form, 2) || null,
      repeatRule: normalizeScheduleRepeat(getCustomSelectValue('\uBC18\uBCF5') || getScheduleSelectTextAt(form, 3)),
      memo: memoValue
    }
  }

  function submitScheduleFormDirect(form) {
    if (!form || form.dataset.scheduleSubmitting === 'true') return
    var payload = buildSchedulePayloadFromForm(form)
    var titleInput = form.querySelector('input')
    var editingId = form.dataset.editingScheduleId || window.__familyEditingScheduleId || ''
    if (editingId && !findScheduleItemById(editingId)) {
      clearScheduleFormEditMode(form)
      editingId = ''
    }
    if (!payload) {
      if (titleInput) titleInput.focus()
      showPatchToast('\uC77C\uC815\uBA85\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.')
      return
    }
    if (editingId && form.dataset.scheduleEditConfirmed !== 'true') {
      showPatchConfirm('\uC77C\uC815\uC744 \uC800\uC7A5\uD560\uAE4C\uC694?', function () {
        form.dataset.scheduleEditConfirmed = 'true'
        submitScheduleFormDirect(form)
      })
      return
    }
    form.dataset.scheduleSubmitting = 'true'
    var request = editingId
      ? updateScheduleApiItem(editingId, payload)
      : postScheduleWithFreshFamily(payload, false)
    return request.catch(function (error) {
      if (editingId) throw error
      localStorage.removeItem(API_FAMILY_ID_KEY)
      return postScheduleWithFreshFamily(payload, true).catch(function (retryError) {
        retryError.__firstScheduleError = error
        throw retryError
      })
    }).then(function () {
      calendarScheduleCache.key = ''
      calendarScheduleCache.items = []
      calendarScheduleCache.loadedAt = 0
      window.__familyYearScheduleCache = null
      window.__familyYearMonthListState = null
      showPatchToast(editingId ? '\uC77C\uC815\uC774 \uC218\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : '\uC77C\uC815\uC774 \uCD94\uAC00\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
      var date = parseDate(payload.scheduleDate)
      if (date) {
        updateScheduleFormVisibleDate(date)
        updateSelectedDayPanel(date)
        updateJumpInput(date)
      }
      refreshServerDataViews(true)
      renderCalendarApiSchedules(true)
      loadScheduleNotifications(true)
      if (titleInput) {
        titleInput.value = ''
        titleInput.dispatchEvent(new Event('input', { bubbles: true }))
      }
      clearScheduleFormEditMode(form)
    }).catch(function (error) {
      window.__familyLastScheduleSaveError = String(error && error.message ? error.message : error)
      if (window.console && console.warn) console.warn('schedule save failed', error)
      showPatchToast(apiActionErrorMessage(error, editingId ? '\uC77C\uC815 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.' : '\uC77C\uC815 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
    }).finally(function () {
      delete form.dataset.scheduleSubmitting
      delete form.dataset.scheduleEditConfirmed
    })
  }

  function normalizeLedgerType(value) {
    var text = String(value || '')
    return text.indexOf('\uC218\uC785') >= 0 || text.toLowerCase() === 'income' ? 'income' : 'expense'
  }

  function syncLedgerForm(form) {
    window.setTimeout(function () {
      if (!isLedgerEntryForm(form)) return
      submitLedgerCreate(form)
    }, 450)
  }

  function ensureDefaultApiTrip() {
    var cachedId = Number(localStorage.getItem(API_TRIP_ID_KEY) || '')
    if (Number.isFinite(cachedId) && cachedId > 0) return Promise.resolve(cachedId)

    return getReadableFamilyId().then(function (familyId) {
      return postJson('/trips?familyId=' + encodeURIComponent(familyId), {
      title: '\uAE30\uBCF8 \uC5EC\uD589',
      startDate: todayText(),
      endDate: todayText(),
      description: '\uD504\uB860\uD2B8 \uB3D9\uAE30\uD654 \uAE30\uBCF8 \uC5EC\uD589'
      })
    }).then(function (trip) {
      localStorage.setItem(API_TRIP_ID_KEY, String(trip.id))
      return trip.id
    })
  }


  function trySyncTask(task) {
    if (task.type === 'createTrip') {
      return getReadableFamilyId().then(function (familyId) {
        return postJson('/trips?familyId=' + encodeURIComponent(familyId), task.payload)
      }).then(function (trip) {
        if (trip && trip.id) localStorage.setItem(API_TRIP_ID_KEY, String(trip.id))
      })
    }

    if (task.type === 'createTravelRecord') {
      return ensureDefaultApiTrip().then(function (tripId) {
        return postJson('/trips/' + tripId + '/records', task.payload)
      })
    }

    if (task.type === 'createSchedule') {
      return getReadableFamilyId().then(function (familyId) {
        return postJson('/schedules?familyId=' + encodeURIComponent(familyId), task.payload)
      })
    }

    if (task.type === 'createLedgerEntry') {
      return getCurrentFamilyId().then(function (familyId) {
        return postJson('/ledger-entries?familyId=' + encodeURIComponent(familyId), task.payload)
      })
    }

    if (task.type === 'createDiary') {
      return getCurrentFamilyId().then(function (familyId) {
        return postJson('/diaries?familyId=' + encodeURIComponent(familyId), task.payload)
      })
    }

    return Promise.resolve()
  }

  function purgeStaleTravelCreateTripQueueOnce() {
    var cleanupKey = 'family-platform-travel-create-trip-queue-cleaned-20260623-01'
    if (localStorage.getItem(cleanupKey) === 'true') return
    var queue = readSyncQueue()
    var next = queue.filter(function (task) {
      return !task || task.type !== 'createTrip'
    })
    if (next.length !== queue.length) writeSyncQueue(next)
    localStorage.setItem(cleanupKey, 'true')
  }

  function flushApiQueue() {
    purgeStaleTravelCreateTripQueueOnce()
    var queue = readSyncQueue()
    if (!queue.length) return
    var remaining = []

    queue.reduce(function (chain, task) {
      return chain.then(function () {
        return trySyncTask(task).catch(function () {
          remaining.push(task)
        })
      })
    }, Promise.resolve()).then(function () {
      writeSyncQueue(remaining)
      if (remaining.length !== queue.length) {
        calendarScheduleCache.key = ''
        calendarScheduleCache.items = []
        calendarScheduleCache.loadedAt = 0
        refreshServerDataViews(true)
        loadScheduleNotifications(true)
      }
    })
  }

  function syncTripAddRow(row) {
    window.setTimeout(function () {
      submitApiTripRow(row)
    }, 350)
  }

  function syncTravelForm(form) {
    window.setTimeout(function () {
      var title = getFieldValue(form, '[data-field="travel-title"]')
      var location = getFieldValue(form, '[data-field="travel-location"]')
      if (!title) {
        var titleInput = form.querySelector('[data-field="travel-title"]')
        showPatchToast('\uC81C\uBAA9\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
        if (titleInput) titleInput.focus()
        return
      }

      var fileInput = form.querySelector('input[type="file"]')
      var submit = form.querySelector('button[type="submit"], .submit-action')
      if (submit && fileInput && fileInput.files && fileInput.files.length) {
        submit.disabled = true
        if (!submit.dataset.originalText) submit.dataset.originalText = submit.textContent
        submit.textContent = '\uC5C5\uB85C\uB4DC \uC911'
      }

      resolveTravelLocationForSubmit(form, location).then(function (coords) {
        return uploadMediaFiles(fileInput).then(function (files) {
          return { files: files, coords: coords }
        })
      }).then(function (result) {
        var coords = result.coords || { latitude: 0, longitude: 0 }
        queueApiSync({
          type: 'createTravelRecord',
          payload: {
            sortOrder: parseAmountValue(getFieldValue(form, '[data-field="travel-sort-order"]')) || null,
            title: title,
            category: getFieldValue(form, '[data-field="travel-category"]') || getCustomSelectValue('\uBE44\uC6A9 \uAD6C\uBD84') || '\uAE30\uD0C0',
            amount: parseAmountValue(getFieldValue(form, '[data-field="travel-amount"]')),
            note: getFieldValue(form, 'textarea'),
            location: location || '',
            latitude: Number(coords.latitude || 0),
            longitude: Number(coords.longitude || 0),
            recordDate: getDatePickerValue(form, '\uB0A0\uC9DC') || getFieldValue(form, '[data-field="travel-record-date"]') || todayText(),
            recordTime: getFieldValue(form, '[data-field="travel-record-time"]') || currentTimeText(),
            mediaUrls: communityMediaUrls(result.files)
          }
        })
        flushApiQueue()
        if (form.classList.contains('api-travel-record-form')) {
          window.setTimeout(function () {
            renderApiTripRecords(form.closest('.api-trip-detail'), localStorage.getItem(API_TRIP_ID_KEY))
          }, 900)
          window.setTimeout(function () {
            renderApiTripRecords(form.closest('.api-trip-detail'), localStorage.getItem(API_TRIP_ID_KEY))
          }, 1800)
        }
      }).catch(function (error) {
        if (String(error && error.message || '').indexOf('INVALID_MEDIA') < 0) {
          showPatchToast('\uCCA8\uBD80\uD30C\uC77C \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
        }
      }).finally(function () {
        if (submit) {
          submit.disabled = false
          if (submit.dataset.originalText) submit.textContent = submit.dataset.originalText
        }
      })
    }, 450)
  }

  function renderCurrentLegacyTravelApiRecords() {
  }

  document.addEventListener('click', function (event) {
    var tripButton = event.target && event.target.closest && event.target.closest('.trip-add-row .submit-action')
    if (tripButton) {
      event.preventDefault()
      syncTripAddRow(tripButton.closest('.trip-add-row'))
    }
  }, true)

  document.addEventListener('submit', function (event) {
    var tripRow = event.target && event.target.closest && event.target.closest('.trip-add-row')
    if (!tripRow) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    syncTripAddRow(tripRow)
  }, true)

  document.addEventListener('submit', function (event) {
    var travelForm = event.target && event.target.closest && event.target.closest('.travel-form')
    if (travelForm && travelForm.classList.contains('api-travel-record-form')) {
      event.preventDefault()
      event.stopPropagation()
      syncTravelForm(travelForm)
      return
    }
    if (travelForm) syncTravelForm(travelForm)
  }, true)
  function optionalInteger(value) {
    var text = String(value || '').replace(/[^\d-]/g, '')
    return text ? Number(text) : null
  }

  function syncDiaryForm(form) {
    window.setTimeout(function () {
      var title = getFieldValue(form, '[data-field="diary-title"]') || getInputValueByLabel(form, '\uC81C\uBAA9')
      var body = getFieldValue(form, '[data-field="diary-body"]') || getFieldValue(form, 'textarea')
      if (!title || !body) return

      var fileInput = form.querySelector('input[type="file"]')
      var submit = form.querySelector('button[type="submit"], .submit-action')
      if (submit && fileInput && fileInput.files && fileInput.files.length) {
        submit.disabled = true
        if (!submit.dataset.originalText) submit.dataset.originalText = submit.textContent
        submit.textContent = '\uC5C5\uB85C\uB4DC \uC911'
      }

      uploadMediaFiles(fileInput).then(function (files) {
        queueApiSync({
          type: 'createDiary',
          payload: {
            title: title,
            body: body,
            diaryDate: getDatePickerValue(form, '\uB0A0\uC9DC'),
            weather: getCustomSelectValue('\uB0A0\uC528') || null,
            mood: getCustomSelectValue('\uAE30\uBD84') || null,
            minTemperature: optionalInteger(getInputValueByLabel(form, '\uCD5C\uC800 \uC628\uB3C4')),
            maxTemperature: optionalInteger(getInputValueByLabel(form, '\uCD5C\uACE0 \uC628\uB3C4')),
            mediaUrls: communityMediaUrls(files)
          }
        })
        flushApiQueue()
      }).catch(function (error) {
        if (String(error && error.message || '').indexOf('INVALID_MEDIA') < 0) {
          showPatchToast('\uCCA8\uBD80\uD30C\uC77C \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
        }
      }).finally(function () {
        if (submit) {
          submit.disabled = false
          if (submit.dataset.originalText) submit.textContent = submit.dataset.originalText
        }
      })
    }, 450)
  }

  function resetBabyApiRecordForm(form) {
    if (!form) return
    form.reset()
    var date = form.querySelector('[name="recordDate"]')
    var time = form.querySelector('[name="recordTime"]')
    if (date) {
      date.value = todayText()
      var triggerText = form.querySelector('[data-baby-api-record-date-trigger] span')
      if (triggerText) triggerText.textContent = todayText().replace(/-/g, '.')
    }
    if (time) time.value = currentTimeText()
    var type = form.querySelector('[name="recordType"]')
    var typeText = form.querySelector('[data-baby-record-type-trigger] span')
    if (type) type.value = '\uC218\uC720'
    if (typeText) typeText.textContent = '\uC218\uC720'
    var hint = form.querySelector('.baby-api-file-field small')
    if (hint) hint.textContent = mediaLimitText()
  }

  function submitBabyApiRecordForm(form) {
    if (!form || form.dataset.submitting === 'true') return
    var type = getFieldValue(form, '[name="recordType"]')
    var date = getFieldValue(form, '[name="recordDate"]')
    if (!type) {
      var typeField = form.querySelector('[name="recordType"]')
      if (typeField) typeField.focus()
      showPatchToast('\uAE30\uB85D\uC885\uB958\uB294 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
      return
    }
    if (!date) {
      var dateField = form.querySelector('[data-baby-api-record-date-trigger]') || form.querySelector('[name="recordDate"]')
      if (dateField) dateField.focus()
      showPatchToast('\uB0A0\uC9DC\uB294 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
      return
    }

    form.dataset.submitting = 'true'
    setBabyApiRecordBusy(form, true)
    var fileInput = form.querySelector('[name="files"]')
    uploadMediaFiles(fileInput).then(function (files) {
      return ensureApiBabyForDetail().then(function (babyId) {
        return postJson('/babies/' + encodeURIComponent(babyId) + '/records', {
          recordType: type,
          recordDate: date,
          recordTime: formatClockText(getFieldValue(form, '[name="recordTime"]'), '') || null,
          amountMl: optionalInteger(getFieldValue(form, '[name="amountMl"]')),
          heightCm: optionalDecimal(getFieldValue(form, '[name="heightCm"]')),
          weightKg: optionalDecimal(getFieldValue(form, '[name="weightKg"]')),
          memo: getFieldValue(form, '[name="memo"]') || '',
          mediaUrls: communityMediaUrls(files)
        })
      })
    }).then(function () {
      var detail = form.closest('.baby-api-detail')
      var babyId = detail && detail.dataset.apiBabyId
      resetBabyApiRecordForm(form)
      if (detail && babyId) {
        renderBabyApiRecordRows(detail, babyId)
        renderBabyGrowthHistory(detail, babyId)
        var grid = document.querySelector('.baby-list-grid')
        if (grid) delete grid.dataset.apiLoaded
      } else {
        refreshServerDataViews(true)
      }
      showPatchToast('\uC721\uC544 \uAE30\uB85D\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
    }).catch(function (error) {
      if (String(error && error.message || '').indexOf('INVALID_MEDIA') < 0) {
        showPatchToast(apiActionErrorMessage(error, '\uC721\uC544 \uAE30\uB85D \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      }
    }).finally(function () {
      delete form.dataset.submitting
      setBabyApiRecordBusy(form, false)
    })
  }

  document.addEventListener('click', function (event) {
    var tripButton = event.target && event.target.closest && event.target.closest('.trip-add-row .submit-action')
    if (tripButton) {
      event.preventDefault()
      syncTripAddRow(tripButton.closest('.trip-add-row'))
    }
  }, true)

  document.addEventListener('submit', function (event) {
    var tripRow = event.target && event.target.closest && event.target.closest('.trip-add-row')
    if (!tripRow) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    syncTripAddRow(tripRow)
  }, true)

  document.addEventListener('submit', function (event) {
    var travelForm = event.target && event.target.closest && event.target.closest('.travel-form')
    if (travelForm && travelForm.classList.contains('api-travel-record-form')) {
      event.preventDefault()
      event.stopPropagation()
      syncTravelForm(travelForm)
      return
    }
    if (travelForm) syncTravelForm(travelForm)
  }, true)

  document.addEventListener('submit', function (event) {
    var ledgerForm = event.target && event.target.closest && event.target.closest('.ledger-form, .entry-panel')
    if (!ledgerForm) return
    if (!isLedgerEntryForm(ledgerForm)) return
    if (getLedgerEditId(ledgerForm)) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      submitLedgerEdit(ledgerForm)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitLedgerCreate(ledgerForm)
  }, true)

  document.addEventListener('click', function (event) {
    var editButton = event.target && event.target.closest && event.target.closest('[data-ledger-edit-id]')
    var deleteButton = event.target && event.target.closest && event.target.closest('[data-ledger-delete-id]')
    if (!editButton && !deleteButton) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (editButton) {
      resolveLedgerItemForDetail(editButton.dataset.ledgerEditId).then(function (item) {
        if (!fillLedgerFormForEdit(item)) showPatchToast('\uC218\uC815\uD560 \uB300\uC0C1\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      })
      return
    }
    deleteLedgerEntry(deleteButton.dataset.ledgerDeleteId)
  }, true)

  document.addEventListener('click', function (event) {
    var row = event.target && event.target.closest && event.target.closest('.api-ledger-row[data-api-ledger-id]')
    if (!row || event.target.closest('button, a, input, textarea, select, .custom-select')) return
    resolveLedgerItemForDetail(row.dataset.apiLedgerId).then(showLedgerDetail)
  }, true)

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('.ledger-form button[type="submit"], .ledger-form .submit-action, .entry-panel button[type="submit"], .entry-panel .submit-action')
    if (!button) return
    var form = button.closest('.ledger-form, .entry-panel')
    if (!form || !isLedgerEntryForm(form)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (getLedgerEditId(form)) submitLedgerEdit(form)
    else submitLedgerCreate(form)
  }, true)

  document.addEventListener('submit', function (event) {
    var diaryForm = event.target && event.target.closest && event.target.closest('.diary-form')
    if (diaryForm) syncDiaryForm(diaryForm)
  }, true)

  function handleDiaryDirectSubmitEvent(event) {
    var button = event.target && event.target.closest && event.target.closest('form.diary-form button[type="submit"], form.diary-form .submit-action')
    if (!button || getCleanText(button) !== '\uC77C\uAE30 \uCD94\uAC00') return false
    var form = button.closest('form.diary-form')
    var panel = form && (form.closest('aside, section, article, .panel, .entry-panel') || form)
    if (!panel || getCleanText(panel.querySelector('h2')) !== '\uC77C\uAE30 \uCD94\uAC00') return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitExistingDiaryPanel(panel, button)
    return true
  }

  window.__familyDiaryDirectSubmitHandler = handleDiaryDirectSubmitEvent

  document.addEventListener('pointerdown', handleDiaryDirectSubmitEvent, true)
  document.addEventListener('mousedown', handleDiaryDirectSubmitEvent, true)
  document.addEventListener('click', handleDiaryDirectSubmitEvent, true)

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('button')
    if (!button || getCleanText(button) !== '\uC77C\uAE30 \uCD94\uAC00') return
    if (button.closest('.diary-main-action-bar') || button.dataset.diaryOpenComposer === 'true') return
    var panel = button.closest('aside, section, article, .panel, .entry-panel') || button.closest('form')
    if (!panel || getCleanText(panel.querySelector('h2')) !== '\uC77C\uAE30 \uCD94\uAC00') return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitExistingDiaryPanel(panel, button)
  }, true)

  document.addEventListener('submit', function (event) {
    var form = event.target && event.target.closest && event.target.closest('form')
    if (!form) return
    var panel = form.closest('aside, section, article, .panel, .entry-panel') || form
    if (!panel || getCleanText(panel.querySelector('h2')) !== '\uC77C\uAE30 \uCD94\uAC00') return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitExistingDiaryPanel(panel, form.querySelector('button[type="submit"]'))
  }, true)

  document.addEventListener('submit', function (event) {
    var babyForm = event.target && event.target.closest && event.target.closest('.baby-api-record-form')
    if (!babyForm) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitBabyApiRecordForm(babyForm)
  }, true)

  document.addEventListener('submit', function (event) {
    var growthForm = event.target && event.target.closest && event.target.closest('.baby-growth-api-form')
    if (!growthForm) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    var detail = growthForm.closest('.baby-api-detail')
    var babyId = detail && detail.dataset.apiBabyId
    var recordDate = getFieldValue(growthForm, '[name="recordDate"]') || todayText()
    var height = optionalDecimal(getFieldValue(growthForm, '[name="heightCm"]'))
    var weight = optionalDecimal(getFieldValue(growthForm, '[name="weightKg"]'))
    if (!height && !weight) {
      var target = growthForm.querySelector('[name="heightCm"]')
      if (target) target.focus()
      showPatchToast('\uD0A4 \uB610\uB294 \uBAB8\uBB34\uAC8C\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.')
      return
    }
    if (!babyId || growthForm.dataset.submitting === 'true') return
    growthForm.dataset.submitting = 'true'
    setBabyApiRecordBusy(growthForm, true)
    var editId = growthForm.dataset.growthEditId
    var payload = {
      recordType: '\uC131\uC7A5',
      recordDate: recordDate,
      recordTime: currentTimeText(),
      heightCm: height,
      weightKg: weight,
      memo: ''
    }
    var request = editId
      ? apiRequest('/baby-records/' + encodeURIComponent(editId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      : postJson('/babies/' + encodeURIComponent(babyId) + '/records', payload)
    request.then(function () {
      growthForm.reset()
      delete growthForm.dataset.growthEditId
      var dateInput = growthForm.querySelector('[name="recordDate"]')
      var dateText = growthForm.querySelector('[data-baby-growth-date-trigger] span')
      if (dateInput) dateInput.value = todayText()
      if (dateText) dateText.textContent = todayText().replace(/-/g, '.')
      var submit = growthForm.querySelector('button[type="submit"]')
      if (submit) submit.textContent = '\uC800\uC7A5'
      var grid = document.querySelector('.baby-list-grid')
      if (grid) delete grid.dataset.apiLoaded
      renderBabyApiRecordRows(detail, babyId)
      renderBabyGrowthHistory(detail, babyId)
      showPatchToast(editId ? '\uC131\uC7A5 \uAE30\uB85D\uC744 \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.' : '\uC131\uC7A5 \uAE30\uB85D\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
    }).catch(function (error) {
      showPatchToast(apiActionErrorMessage(error, '\uC131\uC7A5 \uAE30\uB85D \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
    }).finally(function () {
      delete growthForm.dataset.submitting
      setBabyApiRecordBusy(growthForm, false)
    })
  }, true)

  document.addEventListener('input', function (event) {
    var input = event.target && event.target.closest && event.target.closest('input[name="heightCm"], input[name="weightKg"], [data-baby-create-height], [data-baby-create-weight]')
    if (!input) return
    var next = sanitizeDecimalText(input.value)
    if (input.value !== next) input.value = next
  }, true)

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('[data-baby-growth-chart-mode]')
    if (!button || button.disabled) return
    var chart = button.closest('.baby-growth-chart')
    var history = button.closest('.baby-growth-api-history')
    var detail = button.closest('.baby-api-detail')
    var babyId = detail && detail.dataset.apiBabyId
    var records = window.__familyBabyGrowthRecordsByBabyId && window.__familyBabyGrowthRecordsByBabyId[String(babyId)]
    if (!chart || !records) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (history) {
      history.innerHTML = buildBabyGrowthChartAndList(records, button.dataset.babyGrowthChartMode)
      return
    }
    chart.outerHTML = buildBabyGrowthChart(records, button.dataset.babyGrowthChartMode)
  }, true)

  document.addEventListener('click', function (event) {
    var deleteButton = event.target && event.target.closest && event.target.closest('[data-api-baby-delete-id]')
    if (deleteButton) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      var babyId = deleteButton.dataset.apiBabyDeleteId
      showPatchConfirm('\uC544\uC774 \uC815\uBCF4\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
        deleteBabyProfile(babyId)
      })
      return
    }
    var card = event.target && event.target.closest && event.target.closest('.baby-card[data-api-baby-id]')
    if (!card) return
    openBabyCardDetail(card, event)
  }, true)

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    var card = event.target && event.target.closest && event.target.closest('.baby-card[data-api-baby-id]')
    if (!card) return
    openBabyCardDetail(card, event)
  }, true)

  document.addEventListener('click', function (event) {
    var clearButton = event.target && event.target.closest && event.target.closest('[data-baby-api-clear]')
    if (!clearButton) return
    var form = clearButton.closest('.baby-api-record-form')
    resetBabyApiRecordForm(form)
  }, true)

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('[data-baby-growth-history]')
    if (!button) return
    var detail = button.closest('.baby-api-detail')
    var babyId = detail && detail.dataset.apiBabyId
    openBabyGrowthHistoryDialog(detail, babyId)
  }, true)

  document.addEventListener('change', function (event) {
    var input = event.target && event.target.closest && event.target.closest('.baby-api-file-field input[type="file"]')
    if (!input) return
    var label = input.closest('.baby-api-file-field')
    var hint = label && label.querySelector('small')
    if (!hint) return
    if (!input.files || !input.files.length) {
      hint.textContent = mediaLimitText()
      return
    }
    hint.textContent = Array.from(input.files).map(function (file) { return file.name }).join(', ')
  }, true)

  window.setInterval(flushApiQueue, 15000)
  window.setTimeout(validateStoredAuthSession, 500)
  window.setInterval(function () {
    loadScheduleNotifications(true)
  }, 60000)
  window.setInterval(function () {
    refreshServerDataViews(true)
  }, 120000)

  document.addEventListener('submit', function (event) {
    var form = event.target && event.target.closest && event.target.closest('.schedule-form-card')
    if (!form) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitScheduleFormDirect(form)
  }, true)

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('.schedule-form-card button[type="submit"]')
    if (!button) return
    var form = button.closest('.schedule-form-card')
    if (!form) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitScheduleFormDirect(form)
  }, true)

  document.addEventListener('submit', function (event) {
    var form = event.target && event.target.closest && event.target.closest('.travel-form')
    if (!form || !pageHeadingIs('\uC5EC\uD589')) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    syncTravelForm(form)
  }, true)

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('.travel-form button[type="submit"], .travel-form .submit-action')
    if (!button || !pageHeadingIs('\uC5EC\uD589')) return
    var form = button.closest('.travel-form')
    if (!form) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    syncTravelForm(form)
  }, true)

  function handleCalendarTitleJumpEvent(event) {
    var titleButton = event.target && event.target.closest && event.target.closest('.family-calendar-panel .calendar-nav .calendar-title-button')
    if (!titleButton && event.target && event.target.closest && event.target.closest('.family-calendar-panel .calendar-toolbar')) {
      var candidate = document.querySelector('.family-calendar-panel .calendar-nav .calendar-title-button')
      if (candidate && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        var rect = candidate.getBoundingClientRect()
        if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
          titleButton = candidate
        }
      }
    }
    if (!titleButton) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    renderJumpDatepicker(getCalendarModeDate(getActiveCalendarMode()) || getFocusedDate())
  }

  document.addEventListener('click', handleCalendarTitleJumpEvent, true)
  document.addEventListener('pointerdown', handleCalendarTitleJumpEvent, true)
  document.addEventListener('pointerup', handleCalendarTitleJumpEvent, true)
  document.addEventListener('touchstart', handleCalendarTitleJumpEvent, true)
  document.addEventListener('touchend', handleCalendarTitleJumpEvent, true)

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest && event.target.closest('.family-calendar-panel .calendar-day-card, .family-calendar-panel .fc-day, .family-calendar-panel .agenda-day-column')
    if (!target) return
    if (target.classList && target.classList.contains('muted')) return

    var titleDate = getFocusedDate()
    var selectedDate = null

    if (target.classList.contains('agenda-day-column')) {
      var title = target.querySelector('strong')
      var numbers = title ? (title.textContent.match(/\d+/g) || []).map(Number) : []
      if (numbers.length >= 2) selectedDate = new Date(titleDate.getFullYear(), numbers[0] - 1, numbers[1])
    } else {
      var numberEl = target.querySelector('.day-number') || target.querySelector('strong')
      var day = Number((numberEl || {}).textContent || titleDate.getDate())
      if (Number.isFinite(day)) selectedDate = new Date(titleDate.getFullYear(), titleDate.getMonth(), day)
    }

    if (!selectedDate) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()

    markCalendarSelection(target, selectedDate)
    setCalendarModeDate(getActiveCalendarMode(), selectedDate)
    updateJumpInput(selectedDate)
    updateScheduleFormVisibleDate(selectedDate)
    updateSelectedDayPanel(selectedDate, target)
    fetchSchedules(formatDate(selectedDate), formatDate(selectedDate)).then(function (items) {
      if (!items || !items.length) resetScheduleCreateFieldsForDate(selectedDate)
      if (!openCalendarApiDayPopup(selectedDate, items)) {
        openCalendarDaySchedulePopup(selectedDate, collectScheduleTextsFromCalendarNode(target))
      }
    })
  }, true)

  document.addEventListener('click', function (event) {
    window.setTimeout(function () {
      if (event.target && event.target.closest && (event.target.closest('.date-picker-field') || event.target.closest('.calendar-popover'))) return
      document.querySelectorAll('.date-picker-field .calendar-popover').forEach(function (popover) {
        popover.classList.add('calendar-popover-hidden')
      })
    }, 0)
  })
})()
