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
    installed: false
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
    document.body.classList.toggle('api-loading-blocked', apiLoadingState.count > 0)
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
    var url = typeof input === 'string' ? input : (input && input.url) || ''
    if (!url) return { tracked: false, blocking: false }
    try {
      var parsed = new URL(url, window.location.origin)
      if (parsed.pathname.indexOf('/api/notifications') === 0) return { tracked: false, blocking: false }
      if (parsed.pathname.indexOf('/api/') !== 0) return { tracked: false, blocking: false }
      return { tracked: true, blocking: true }
    } catch (error) {
      var tracked = String(url).indexOf('/api/') >= 0
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
        if (!document.body.classList.contains('api-loading-blocked')) return
        if (event.target && event.target.closest && event.target.closest('.global-api-loading')) return
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      }, true)
    })
  }

  installApiLoadingInterceptor()

