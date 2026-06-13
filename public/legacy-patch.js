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
  var protectedAuthUntil = 0
  var protectedAuthSnapshot = null

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
    '2026-01-01': true,
    '2026-02-16': true,
    '2026-02-17': true,
    '2026-02-18': true,
    '2026-03-01': true,
    '2026-03-02': true,
    '2026-05-05': true,
    '2026-05-24': true,
    '2026-05-25': true,
    '2026-06-03': true,
    '2026-06-06': true,
    '2026-08-15': true,
    '2026-08-17': true,
    '2026-09-24': true,
    '2026-09-25': true,
    '2026-09-26': true,
    '2026-10-03': true,
    '2026-10-05': true,
    '2026-10-09': true,
    '2026-12-25': true
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

  function apiRequestMethod(input, init) {
    return String((init && init.method) || (input && input.method) || 'GET').toUpperCase()
  }

  function shouldTrackApiRequest(input, init) {
    var method = apiRequestMethod(input, init)
    if (['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) < 0) return false
    var url = typeof input === 'string' ? input : (input && input.url) || ''
    if (!url) return false
    try {
      var parsed = new URL(url, window.location.origin)
      return parsed.pathname.indexOf('/api/') === 0
    } catch (error) {
      return String(url).indexOf('/api/') >= 0
    }
  }

  function installApiLoadingInterceptor() {
    if (apiLoadingState.installed || !window.fetch) return
    apiLoadingState.installed = true
    var originalFetch = window.fetch.bind(window)
    window.fetch = function (input, init) {
      var tracked = shouldTrackApiRequest(input, init)
      if (tracked) beginApiLoading()
      return originalFetch(input, init).finally(function () {
        if (tracked) endApiLoading()
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
    return (error && error.status === 409) || text.indexOf('Active session exists') >= 0
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
    apiJson(mode === 'register' ? '/auth/register' : '/auth/login', getAuthRequestBody(mode, payload, forceLogin))
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
          showPatchConfirm('\uD604\uC7AC \uB85C\uADF8\uC778\uC774 \uB418\uC5B4\uC788\uC2B5\uB2C8\uB2E4. \uB85C\uADF8\uC778\uC744 \uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?', function () {
            submitAuthRequest(mode, payload, submit, true)
          })
          return
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

    var copy = visual.querySelector('.auth-copy')
    if (copy) copy.remove()

    var preview = visual.querySelector('.auth-preview')
    if (preview) preview.remove()
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
      emailInput.placeholder = '이메일 또는 관리자 아이디'
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

  function ensurePasswordChangeAction() {
    if (document.querySelector('.auth-card')) return
    var actions = document.querySelector('.top-actions')
    if (!actions || actions.querySelector('[data-account-password-change]')) return
    var logout = Array.from(actions.querySelectorAll('button')).find(function (button) {
      return getCleanText(button).replace(/\s+/g, '') === '\uB85C\uADF8\uC544\uC6C3'
    })
    if (!logout) return
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'secondary-action account-password-change'
    button.dataset.accountPasswordChange = 'true'
    button.textContent = '\uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD'
    button.addEventListener('click', openPasswordChangeDialog)
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
      card.classList.toggle('holiday', !!HOLIDAY_DATES[dateKey] || date.getDay() === 0)
      card.classList.toggle('saturday', date.getDay() === 6)
    })
    document.querySelectorAll('.fc-day, .agenda-day-column').forEach(function (card) {
      var title = card.querySelector('strong')
      var nums = title ? (title.textContent.match(/\d+/g) || []).map(Number) : []
      if (!nums.length) return
      var focused = getFocusedDate()
      var date = nums.length >= 2 ? new Date(focused.getFullYear(), nums[0] - 1, nums[1]) : new Date(focused.getFullYear(), focused.getMonth(), nums[0])
      var dateKey = formatDate(date)
      card.classList.toggle('holiday', !!HOLIDAY_DATES[dateKey] || date.getDay() === 0)
      card.classList.toggle('saturday', date.getDay() === 6)
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
      'html.home-clean-header .topbar .eyebrow,html.home-clean-header .topbar h1{display:none!important}',
      'html.home-clean-header .topbar>div:first-child{display:none!important}',
      'html.home-clean-header .top-actions>.custom-select,html.home-clean-header .top-actions>.user-chip{display:none!important}',
      '@media(max-width:760px){.family-group-summary{grid-template-columns:1fr}.family-group-list article{align-items:flex-start;flex-direction:column}.passive-header-chip{min-height:30px;padding:0 11px;font-size:12px}}'
    ].join('\n')
    document.head.appendChild(style)
  }

  function syncHomeCleanHeader() {
    var title = getCleanText(document.querySelector('.topbar h1'))
    var isCustomPatchPage = document.documentElement.dataset.patchPage === 'community' || document.documentElement.dataset.patchPage === 'family-group'
    document.documentElement.classList.toggle('home-clean-header', title === '\uD648' && !isCustomPatchPage)
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
    }, 0)
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
      return apiRequest('/families/' + encodeURIComponent(family.id) + '/members').then(function (members) {
        renderFamilyManagePage(root, family, Array.isArray(members) ? members : [], invitations)
      }).catch(function () {
        renderFamilyManagePage(root, family, [], invitations)
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
  }

  function renderFamilyManagePage(root, family, members, invitations) {
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
      '<label><span>초대할 사용자</span><input data-invite-user placeholder="이메일 또는 닉네임" /></label>',
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
      '<label><span>가족명</span><input data-family-name maxlength="40" placeholder="예: 우리 가족" /></label>',
      '<button class="submit-action" type="submit">가족그룹 생성</button>',
      '</form>',
      '<div class="api-empty-row"><strong>연결된 가족그룹이 없습니다.</strong></div>',
      '</section>'
    ].join('')
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

  function ensureAdminBatchSaveButton() {
    var title = getCleanText(document.querySelector('.topbar h1'))
    if (title.indexOf('관리자') < 0) return
    var panels = Array.from(document.querySelectorAll('.panel, .entry-panel')).filter(function (panel) {
      var text = getCleanText(panel)
      return text.indexOf('총괄관리자') >= 0 && text.indexOf('가족관리자') >= 0 && text.indexOf('가족구성원') >= 0
    })
    panels.forEach(function (panel) {
      if (panel.querySelector('.batch-role-save-button')) return
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'save-button batch-role-save-button'
      button.textContent = '전체 저장'
      button.addEventListener('click', function () {
        var saveButtons = Array.from(panel.querySelectorAll('button.save-button')).filter(function (item) {
          return item !== button && !item.disabled
        })
        if (!saveButtons.length) {
          showPatchToast('저장할 수정 항목이 없습니다.')
          return
        }
        showPatchConfirm('수정 중인 권한을 한 번에 저장할까요?', function () {
          saveButtons.forEach(function (item) { item.click() })
          showPatchToast('권한 변경을 저장했습니다.')
        })
      })
      var header = panel.querySelector('.panel-header')
      if (header) header.appendChild(button)
      else panel.insertBefore(button, panel.firstChild)
    })
  }

  function refreshCalendarPatch() {
    if (document.documentElement.dataset.patchPage === 'community') {
      return
    }
    if (document.documentElement.dataset.patchPage === 'family-group') {
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

  var observer = new MutationObserver(schedulePatchRefresh)
  observer.observe(document.documentElement, { childList: true, subtree: true })
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
    document.querySelectorAll('.calendar-popover:not(.jump-datepicker-popover)').forEach(function (popover) {
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

  function hidePatchElement(element) {
    if (!element) return
    element.style.display = 'none'
    element.setAttribute('aria-hidden', 'true')
    element.dataset.patchHidden = 'true'
  }

  function refreshLabelCleanup() {
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

      if (title === '\uAC00\uC871 \uC77C\uAE30') {
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
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'baby-card-edit-button'
      button.textContent = '\uC218\uC815'
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        openBabyProfileEditor(card)
      }, true)
      card.appendChild(button)
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
      '<label><span>\uC131\uBCC4 <em class="required-mark">*</em></span><input data-baby-create-gender type="hidden" /><div class="custom-select baby-create-gender-select" data-baby-create-gender-select><button type="button" class="custom-select-trigger" data-baby-create-gender-trigger>\uC120\uD0DD</button><div class="custom-select-list" hidden><button type="button" data-baby-create-gender-value="\uB0A8">\uB0A8</button><button type="button" data-baby-create-gender-value="\uC5EC">\uC5EC</button></div></div><small class="field-error" data-baby-create-error="gender" hidden></small></label>',
      '<label class="baby-create-date-field"><span>\uC0DD\uC77C</span><input data-baby-create-birth type="hidden" value="' + todayText() + '" /><button type="button" class="date-picker-trigger baby-create-date-button" data-baby-create-birth-trigger><span>' + todayText().replace(/-/g, '.') + '</span><b>\uD83D\uDCC5</b></button></label>',
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
      save.disabled = true
      save.textContent = '\uC800\uC7A5 \uC911'
      getCurrentFamilyId().then(function (familyId) {
        return postJson('/babies?familyId=' + encodeURIComponent(familyId), {
          name: name,
          gender: gender,
          birthDate: getFieldValue(dialog, '[data-baby-create-birth]') || todayText(),
          memo: getFieldValue(dialog, '[data-baby-create-memo]') || '',
          photoUrl: null,
          latestHeightCm: optionalDecimal(getFieldValue(dialog, '[data-baby-create-height]')),
          latestWeightKg: optionalDecimal(getFieldValue(dialog, '[data-baby-create-weight]'))
        })
      }).then(function () {
        closeDialog()
        showPatchToast('\uC544\uC774\uB97C \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.')
        renderBabyApiCards(true)
        refreshServerDataViews(true)
        goMenu('\uC721\uC544')
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
    })
    list.querySelectorAll('[data-baby-create-gender-value]').forEach(function (button) {
      button.addEventListener('click', function () {
        input.value = button.dataset.babyCreateGenderValue || ''
        trigger.textContent = input.value || '\uC120\uD0DD'
        list.hidden = true
        wrap.classList.remove('open')
        hideBabyCreateError(dialog, 'gender')
      })
    })
  }

  function bindBabyCreateBirthDate(dialog) {
    var input = dialog && dialog.querySelector('[data-baby-create-birth]')
    var trigger = dialog && dialog.querySelector('[data-baby-create-birth-trigger]')
    if (!input || !trigger) return
    trigger.addEventListener('click', function () {
      openCommonBirthDatePopover(input, trigger)
    })
  }

  function openCommonBirthDatePopover(input, trigger) {
    var old = document.querySelector('.baby-create-dialog .calendar-popover')
    if (old) old.remove()
    var selected = parseApiDate(input.value) || todayText()
    var view = new Date(selected + 'T00:00:00')
    var popover = document.createElement('div')
    popover.className = 'calendar-popover'

    function draw() {
      var year = view.getFullYear()
      var month = view.getMonth()
      var first = new Date(year, month, 1)
      var last = new Date(year, month + 1, 0).getDate()
      var html = '<header class="calendar-header"><button type="button" data-baby-date-prev>&lt;</button><strong>' + year + '\uB144 ' + (month + 1) + '\uC6D4</strong><button type="button" data-baby-date-next>&gt;</button></header>'
      html += '<div class="calendar-today-row"><button type="button" data-baby-date-today>\uC624\uB298</button></div>'
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
      popover.innerHTML = html + '</div>'
    }

    draw()
    trigger.insertAdjacentElement('afterend', popover)
    popover.addEventListener('click', function (event) {
      var target = event.target
      if (!target || !target.closest) return
      if (target.closest('[data-baby-date-prev]')) {
        view.setMonth(view.getMonth() - 1)
        draw()
        return
      }
      if (target.closest('[data-baby-date-next]')) {
        view.setMonth(view.getMonth() + 1)
        draw()
        return
      }
      if (target.closest('[data-baby-date-today]')) {
        selected = todayText()
      }
      var dayButton = target.closest('[data-baby-date]')
      if (dayButton) selected = dayButton.dataset.babyDate
      if (target.closest('[data-baby-date-today]') || dayButton) {
        setInputValue(input, selected)
        var label = trigger.querySelector('span')
        if (label) label.textContent = selected.replace(/-/g, '.')
        popover.remove()
      }
    })
  }

  document.addEventListener('pointerdown', function (event) {
    var dialog = document.querySelector('.baby-create-dialog')
    if (!dialog) return
    var gender = dialog.querySelector('[data-baby-create-gender-select]')
    if (gender && event.target && !event.target.closest('[data-baby-create-gender-select]')) {
      var list = gender.querySelector('.custom-select-list')
      if (list) list.hidden = true
      gender.classList.remove('open')
    }
    var popover = dialog.querySelector('.calendar-popover')
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
      return getCleanText(item.querySelector('h2')).indexOf('\uC77C\uAE30') >= 0
    })
    if (!header || header.querySelector('.diary-main-action-bar')) return
    var actions = document.createElement('div')
    actions.className = 'diary-main-action-bar'
    var createButton = document.createElement('button')
    createButton.type = 'button'
    createButton.textContent = '\uC77C\uAE30 \uCD94\uAC00'
    createButton.addEventListener('click', function () {
      var form = document.querySelector('.diary-form') || ensureDiaryApiComposer()
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
      '<label><span>\uB0A0\uC9DC</span><input data-diary-create-date type="date" value="' + todayText() + '" /></label>',
      '<div class="form-row">',
      '<label><span>\uB0A0\uC528</span><input data-diary-create-weather maxlength="30" /></label>',
      '<label><span>\uAE30\uBD84</span><input data-diary-create-mood maxlength="30" /></label>',
      '</div>',
      '<label><span>\uB0B4\uC6A9</span><textarea data-diary-create-content rows="5"></textarea></label>',
      '<button class="submit-action" type="submit">\uC800\uC7A5</button>',
      '</form>'
    ].join('')
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
      getCurrentFamilyId().then(function (familyId) {
        return postJson('/diaries?familyId=' + encodeURIComponent(familyId), {
          title: title,
          body: content,
          diaryDate: getFieldValue(panel, '[data-diary-create-date]') || todayText(),
          weather: getFieldValue(panel, '[data-diary-create-weather]') || null,
          mood: getFieldValue(panel, '[data-diary-create-mood]') || null,
          photoUrls: [],
          videoUrls: []
        })
      }).then(function () {
        showPatchToast('\uC77C\uAE30\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
        panel.querySelector('form').reset()
        panel.querySelector('[data-diary-create-date]').value = todayText()
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
    var title = getInputValueByLabel(panel, '\uC81C\uBAA9')
    var body = getInputValueByLabel(panel, '\uB0B4\uC6A9') || getFieldValue(panel, 'textarea')
    if (!title) {
      showPatchToast('\uC81C\uBAA9\uC740 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
      var titleField = panel.querySelector('label input, input')
      if (titleField) titleField.focus()
      return
    }
    panel.dataset.diaryPanelSubmitting = 'true'
    if (submitButton) submitButton.disabled = true
    getCurrentFamilyId().then(function (familyId) {
      return postJson('/diaries?familyId=' + encodeURIComponent(familyId), {
        title: title,
        body: body,
        diaryDate: getDatePickerValue(panel, '\uB0A0\uC9DC') || todayText(),
        weather: getControlValueByLabel(panel, '\uB0A0\uC528') || null,
        mood: getControlValueByLabel(panel, '\uAE30\uBD84') || null,
        minTemperature: optionalInteger(getInputValueByLabel(panel, '\uCD5C\uC800 \uC628\uB3C4')),
        maxTemperature: optionalInteger(getInputValueByLabel(panel, '\uCD5C\uACE0 \uC628\uB3C4')),
        photoUrls: [],
        videoUrls: []
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
    if (button) button.click()
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
      clearCustomPatchPageNow()
      clearCustomPatchPageAfterReact(wasCommunity, wasFamilyGroup)
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
    document.documentElement.dataset.patchPage = 'community'
    document.querySelectorAll('.nav-item.active').forEach(function (item) {
      item.classList.remove('active')
    })
    var nav = findNavButtonContains('\uCEE4\uBBA4\uB2C8\uD2F0')
    if (!nav) nav = document.querySelector('.community-nav-item')
    if (nav) nav.classList.add('active')
    renderCommunityPage(force)
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
      '<input name="title" placeholder="\uC81C\uBAA9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694" />',
      '<textarea name="body" rows="3" placeholder="\uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"></textarea>',
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
      '<input name="title" value="' + escapeHtml(post ? post.title : '') + '" placeholder="\uC81C\uBAA9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694" />',
      '<textarea name="body" rows="5" placeholder="\uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694">' + escapeHtml(post ? post.body : '') + '</textarea>',
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
      '<input name="comment" placeholder="\uB313\uAE00\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694" />',
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
      '<input name="title" value="' + escapeHtml(post ? post.title : '') + '" placeholder="\uC81C\uBAA9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694" />',
      '<textarea name="body" rows="5" placeholder="\uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694">' + escapeHtml(post ? post.body : '') + '</textarea>',
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
    var providers = [
      { key: 'naver', label: '\uB124\uC774\uBC84' },
      { key: 'google', label: '\uAD6C\uAE00' },
      { key: 'kakao', label: '\uCE74\uCE74\uC624' }
    ]

    function updateProviderButtons() {
      providers.forEach(function (provider) {
        var button = block.querySelector('[data-sso-provider="' + provider.key + '"]')
        if (!button) return
        var item = providerStatus[provider.key]
        var configured = item && item.configured
        button.classList.toggle('is-disabled', statusLoaded && !configured)
        button.title = configured ? provider.label + ' \uB85C\uADF8\uC778' : '\uB3C4\uBA54\uC778\uACFC OAuth Client ID \uC124\uC815 \uD6C4 \uC5F0\uACB0\uB429\uB2C8\uB2E4.'
      })
    }

    apiGetJson('/auth/oauth/providers').then(function (items) {
      providerStatus = {}
      ;(items || []).forEach(function (item) {
        providerStatus[item.provider] = item
      })
      statusLoaded = true
      updateProviderButtons()
    }).catch(function () {
      statusLoaded = true
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
        if (!item || !item.configured) {
          showPatchToast(provider.label + ' SSO\uB294 \uB3C4\uBA54\uC778\uACFC OAuth Client ID \uC124\uC815 \uD6C4 \uC5F0\uACB0\uB429\uB2C8\uB2E4.')
          return
        }
        window.location.href = item.startUrl || (API_BASE_URL + '/auth/oauth/' + provider.key + '/start')
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
        if (nav) nav.click()
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
    var text = String(value || '').replace(/[^\d.-]/g, '')
    return text ? Number(text) : null
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

    var anchor = detail.querySelector('.record-filter-bar') || detail.querySelector('.baby-record-list') || detail.lastElementChild
    var card = document.createElement('section')
    card.className = 'baby-api-record-card'
    card.innerHTML = [
      '<header><div><span>\uC721\uC544 \uAE30\uB85D</span><strong>\uC0C8 \uAE30\uB85D \uCD94\uAC00</strong></div><small>\uC800\uC7A5 \uD6C4 \uAE30\uB85D\uC5D0 \uBC18\uC601\uB429\uB2C8\uB2E4.</small></header>',
      '<form class="baby-api-record-form">',
      '<div class="baby-api-form-grid">',
      '<label><span>\uAE30\uB85D\uC885\uB958</span><select name="recordType" required><option value="\uC218\uC720">\uC218\uC720</option><option value="\uB300\uBCC0">\uB300\uBCC0</option><option value="\uC18C\uBCC0">\uC18C\uBCC0</option><option value="\uC218\uBA74">\uC218\uBA74</option><option value="\uC131\uC7A5">\uC131\uC7A5</option><option value="\uBCD1\uC6D0">\uBCD1\uC6D0</option><option value="\uBA54\uBAA8">\uBA54\uBAA8</option></select></label>',
      '<label><span>\uB0A0\uC9DC</span><input name="recordDate" type="date" required value="' + todayText() + '" /></label>',
      '<label><span>\uC2DC\uAC04</span><input name="recordTime" type="time" value="' + String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0') + '" /></label>',
      '<label><span>\uC218\uC720\uB7C9(ml)</span><input name="amountMl" type="text" inputmode="numeric" placeholder="예: 120" /></label>',
      '<label><span>\uD0A4(cm)</span><input name="heightCm" type="text" inputmode="decimal" placeholder="예: 89.5" /></label>',
      '<label><span>\uBAB8\uBB34\uAC8C(kg)</span><input name="weightKg" type="text" inputmode="decimal" placeholder="예: 12.8" /></label>',
      '</div>',
      '<label class="baby-api-memo"><span>\uBA54\uBAA8</span><textarea name="memo" rows="3" placeholder="\uAE30\uB85D\uD560 \uB0B4\uC6A9\uC744 \uC801\uC5B4\uC8FC\uC138\uC694."></textarea></label>',
      '<label class="community-file-field baby-api-file-field"><span>\uC0AC\uC9C4/\uC601\uC0C1 \uCCA8\uBD80</span><b>\uD30C\uC77C \uC120\uD0DD</b><input name="files" type="file" accept="image/*,video/*" multiple /><small>' + mediaLimitText() + '</small></label>',
      '<div class="baby-api-record-actions"><button type="button" class="cancel-button" data-baby-api-clear>\uCD08\uAE30\uD654</button><button type="submit" class="save-button">\uC800\uC7A5</button></div>',
      '</form>'
    ].join('')

    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(card, anchor)
    } else {
      detail.appendChild(card)
    }
  }

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

  function ensureNotificationBell() {
    if (!getStoredAuthToken()) return null
    var existing = document.querySelector('.schedule-notification-bell')
    if (existing) return existing

    var mount = getNotificationMount()
    if (!mount) return null

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
      mount.appendChild(wrap)
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
        if (item.dataset.type === 'family-invitation') {
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
        if (inviteItems.length && !sessionStorage.getItem('family-platform-invitation-notification-seen')) {
          sessionStorage.setItem('family-platform-invitation-notification-seen', 'true')
          showPatchToast('\uAC00\uC871\uADF8\uB8F9 \uCD08\uB300\uAC00 \uC788\uC2B5\uB2C8\uB2E4.')
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

  function scheduleTimeText(item) {
    return item.scheduleTime ? String(item.scheduleTime).slice(0, 5) : '\uC2DC\uAC04 \uBBF8\uC815'
  }

  var calendarScheduleCache = {
    key: '',
    items: [],
    loadedAt: 0
  }

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
    resetHomeMetrics(metrics)
    if (!getStoredAuthToken()) {
      resetHomeMetrics(metrics)
      return
    }
    document.documentElement.dataset.homeMetricsApiBacked = 'true'
    var range = monthRangeFor(todayText())
    fetchLedgerSummary(range.start, range.end).then(function (summary) {
      setMetricValue(metrics[0], Number(summary.expense || 0).toLocaleString('ko-KR') + '\uC6D0')
    })
    fetchTrips().then(calculateTripTotal).then(function (total) {
      setMetricValue(metrics[1], Number(total || 0).toLocaleString('ko-KR') + '\uC6D0')
    })
    fetchBabies().then(function (babies) {
      setMetricValue(metrics[2], '0\uAC1C')
      return countBabyRecords(babies)
    }).then(function (count) {
      setMetricValue(metrics[2], Number(count || 0).toLocaleString('ko-KR') + '\uAC1C')
    })
    fetchFamilyMembers().then(function (members) {
      setMetricValue(metrics[3], Number(members.length || 0).toLocaleString('ko-KR') + '\uBA85')
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
    table.innerHTML = emptyRow('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.', '')

    var range = monthRangeFor(todayText())
    fetchLedgerEntries(range.start, range.end).then(function (items) {
      table.dataset.apiLoading = 'false'
      table.dataset.apiBacked = 'true'
      if (!items.length) {
        table.innerHTML = emptyRow('\uCD5C\uADFC \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
        return
      }
      table.innerHTML = items.slice(0, 5).map(function (item) {
        return '<div class="ledger-row api-ledger-row" data-api-ledger-id="' + item.id + '">' +
          '<div><strong>' + escapeHtml(item.title) + '</strong><span>' +
          escapeHtml((item.transactionDate || '').replace(/-/g, '.') + ' · ' + (item.category || '-') + ' · ' + (item.memberName || '-')) +
          '</span></div><span>' + escapeHtml(item.paymentMethod || '-') + '</span><b class="' + escapeHtml(item.entryType || 'expense') + '">' +
          escapeHtml(moneyText(item.amount, item.entryType)) + '</b></div>'
      }).join('')
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
    if (!force && daily && daily.dataset.apiRangeKey === key && (!summary || summary.dataset.apiRangeKey === key)) return
    if (daily) daily.dataset.apiRangeKey = key
    if (summary) summary.dataset.apiRangeKey = key

    fetchLedgerSummary(range.start, range.end).then(function (values) {
      var cards = summary ? Array.from(summary.querySelectorAll('.metric strong')) : []
      setMetricValue(cards[0] && cards[0].closest('.metric'), Number(values.expense || 0).toLocaleString('ko-KR') + '\uC6D0')
      setMetricValue(cards[1] && cards[1].closest('.metric'), Number(values.income || 0).toLocaleString('ko-KR') + '\uC6D0')
      setMetricValue(cards[2] && cards[2].closest('.metric'), Number(values.total || 0).toLocaleString('ko-KR') + '\uC6D0')
    })

    if (!daily) return
    daily.innerHTML = emptyRow('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.', '')
    fetchLedgerEntries(range.start, range.end).then(function (items) {
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
        var expense = rows.filter(function (item) { return item.entryType !== 'income' }).reduce(function (sum, item) { return sum + Number(item.amount || 0) }, 0)
        var income = rows.filter(function (item) { return item.entryType === 'income' }).reduce(function (sum, item) { return sum + Number(item.amount || 0) }, 0)
        rows.forEach(function (item) {
          window.__familyLedgerItemsById = window.__familyLedgerItemsById || {}
          window.__familyLedgerItemsById[String(item.id)] = item
        })
        return '<section class="api-ledger-day">' +
          '<header><strong>' + escapeHtml(formatLedgerDateLabel(date)) + '</strong><span>\uC9C0\uCD9C ' + expense.toLocaleString('ko-KR') + '\uC6D0 \u00B7 \uC218\uC785 ' + income.toLocaleString('ko-KR') + '\uC6D0</span></header>' +
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
    })
  }

  function setLedgerDateValue(form, value) {
    var date = parseApiDate(value) || todayText()
    Array.from(form.querySelectorAll('.date-picker-field, label')).forEach(function (field) {
      if (getCleanText(field).indexOf('\uAC70\uB798\uC77C') < 0) return
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
      return text.indexOf('\uAC70\uB798\uC77C') >= 0 && text.indexOf('\uAE08\uC561') >= 0
    })
  }

  function fillLedgerFormForEdit(item) {
    var form = findLedgerForm()
    if (!form || !item) return false
    form.dataset.apiLedgerEditId = String(item.id || '')
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

  function ledgerPayloadFromForm(form) {
    return {
      title: getInputValueByLabel(form, '\uB0B4\uC5ED') || getInputValueByLabel(form, '\uC81C\uBAA9') || getInputValueByLabel(form, '\uAC00\uB9F9\uC810/\uB0B4\uC6A9') || firstInputValue(form),
      entryType: normalizeLedgerType(getCustomSelectValue('\uAD6C\uBD84')),
      category: getCustomSelectValue('\uCE74\uD14C\uACE0\uB9AC') || null,
      paymentMethod: getCustomSelectValue('\uACB0\uC81C\uC218\uB2E8') || null,
      memberName: getCustomSelectValue('\uC0AC\uC6A9\uC790') || getCustomSelectValue('\uAC00\uC871') || null,
      amount: parseAmountValue(getInputValueByLabel(form, '\uAE08\uC561') || getFieldValue(form, '[data-field="ledger-amount"]') || getFieldValue(form, 'input[inputmode="numeric"]')),
      transactionDate: getDatePickerValue(form, '\uAC70\uB798\uC77C'),
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

  function submitLedgerEdit(form) {
    var entryId = form && form.dataset.apiLedgerEditId
    if (!entryId || form.dataset.ledgerEditSubmitting === 'true') return
    var payload = ledgerPayloadFromForm(form)
    if (!payload.title || !payload.amount) {
      showPatchToast('\uB0B4\uC5ED\uACFC \uAE08\uC561\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.')
      return
    }
    showPatchConfirm('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uC218\uC815\uD560\uAE4C\uC694?', function () {
      form.dataset.ledgerEditSubmitting = 'true'
      getCurrentFamilyId().then(function (familyId) {
        return apiRequest('/ledger-entries/' + encodeURIComponent(entryId) + '?familyId=' + encodeURIComponent(familyId), {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
      }).then(function () {
        delete form.dataset.apiLedgerEditId
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

  function renderRestaurantPageFromApi() {
    if (!pageHeadingIs('\uB9DB\uC9D1')) return
    clearCustomPatchPageNow()
    removeHardcodedDemoData()
    removeFeaturePlaceholders()
    var hero = document.querySelector('.restaurant-hero')
    if (hero) hero.remove()
    var grid = document.querySelector('.restaurant-grid')
    var badge = grid && grid.closest('.panel') && grid.closest('.panel').querySelector('.passive-header-chip')
    if (badge) badge.textContent = '0\uACF3'
    normalizeRestaurantVisitDate()
    window.setTimeout(normalizeRestaurantVisitDate, 200)
    window.setTimeout(normalizeRestaurantVisitDate, 800)
    syncRestaurantMenuState()
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
      if (!input.value || input.value === '00:00' || input.value === '14:00') setInputValue(input, now)
    })
  }

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

  function ensureRequiredMarkForInput(input) {
    if (!input) return
    var label = input.closest('label')
    var title = label && label.querySelector('span, strong, b')
    if (!title || title.querySelector('.required-mark')) return
    var mark = document.createElement('em')
    mark.className = 'required-mark'
    mark.textContent = '*'
    title.appendChild(document.createTextNode(' '))
    title.appendChild(mark)
  }

  function normalizeLedgerEntryForm() {
    if (!pageHeadingIs('\uAC00\uACC4\uBD80')) return
    var forms = document.querySelectorAll('.ledger-form, .entry-panel, form')
    forms.forEach(function (form) {
      var text = getCleanText(form)
      if (text.indexOf('\uAC00\uACC4\uBD80') < 0 && text.indexOf('\uAC70\uB798\uC77C') < 0 && text.indexOf('\uAE08\uC561') < 0) return
      removePlaceholdersIn(form, ['\uAC00\uB9F9\uC810', '\uB0B4\uC6A9', '\uAE08\uC561'])
      setDateFieldToToday(form, ['\uAC70\uB798\uC77C'])
    })
    removeFeaturePlaceholders()
  }

  function normalizeTravelEntryForm() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    document.querySelectorAll('.travel-form, .trip-manager, .entry-panel, form').forEach(function (form) {
      var text = getCleanText(form)
      if (text.indexOf('\uC2DC\uC791') < 0 && text.indexOf('\uC885\uB8CC') < 0) return
      setDateFieldToToday(form, ['\uC2DC\uC791\uC77C', '\uC885\uB8CC\uC77C'])
      clearSampleFieldValues(form)
      normalizeTimeInputs(form)
      ensureRequiredMarkForInput(form.querySelector('[data-field="travel-title"]'))
      form.querySelectorAll('[data-field="travel-location"], [data-field="travel-amount"], [data-field="travel-title"]').forEach(function (field) {
        field.removeAttribute('placeholder')
      })
      form.querySelectorAll('button, span, b, strong, small').forEach(function (node) {
        if (getCleanText(node) === '\uC5EC\uD589' && !node.closest('label')) node.remove()
      })
    })
    removeFeaturePlaceholders()
  }

  function ensureTravelHeaderActions() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    var panel = document.querySelector('.trip-manager')
    if (!panel) return
    var header = panel.querySelector('.panel-header') || panel.closest('.panel') && panel.closest('.panel').querySelector('.panel-header')
    if (!header) return
    var actions = header.querySelector('.travel-header-actions')
    if (!actions) {
      actions = document.createElement('div')
      actions.className = 'travel-header-actions'
      header.appendChild(actions)
    }
    var newButton = actions.querySelector('[data-travel-new-entry]')
    if (!newButton) {
      newButton = document.createElement('button')
      newButton.type = 'button'
      newButton.className = 'save-button travel-new-entry-button'
      newButton.dataset.travelNewEntry = 'true'
      newButton.textContent = '\uC2E0\uADDC\uC785\uB825'
      actions.appendChild(newButton)
      newButton.addEventListener('click', function () {
        panel.classList.add('list-mode')
        var first = panel.querySelector('.trip-add-row input, .travel-form input, .travel-form textarea')
        if (first) {
          first.scrollIntoView({ behavior: 'smooth', block: 'center' })
          window.setTimeout(function () { first.focus() }, 180)
        }
      })
    }
    var listButton = actions.querySelector('[data-travel-list-back]')
    var originalList = Array.from(panel.querySelectorAll('button')).find(function (button) {
      return getCleanText(button) === '\uBAA9\uB85D' && !button.dataset.travelListBack
    })
    if (!listButton && originalList) {
      listButton = document.createElement('button')
      listButton.type = 'button'
      listButton.className = originalList.className || 'cancel-button'
      listButton.dataset.travelListBack = 'true'
      listButton.textContent = '\uBAA9\uB85D'
      actions.appendChild(listButton)
      listButton.addEventListener('click', function () { originalList.click() })
      originalList.style.display = 'none'
    }
  }

  function normalizeDiaryEntryForm() {
    if (!pageHeadingIs('\uC77C\uAE30')) return
    document.querySelectorAll('.diary-form, .entry-panel, form').forEach(function (form) {
      var text = getCleanText(form)
      if (text.indexOf('\uC81C\uBAA9') < 0 && text.indexOf('\uB0B4\uC6A9') < 0) return
      removePlaceholdersIn(form, ['\uC81C\uBAA9', '\uCD5C\uC800 \uC628\uB3C4', '\uCD5C\uACE0 \uC628\uB3C4', '\uB0B4\uC6A9'])
      setDateFieldToToday(form, ['\uB0A0\uC9DC'])
    })
    removeFeaturePlaceholders()
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
          '<button class="diary-open-button" type="button"><div><strong>' + escapeHtml(item.title || '') + '</strong>' +
          '<span>' + escapeHtml([date, item.weather || '\uB0A0\uC528 \uBBF8\uC785\uB825', temp, item.mood || ''].filter(Boolean).join(' \u00B7 ')) + '</span>' +
          '<p>' + escapeHtml(item.body || '') + '</p></div></button></div>'
      }).join('')
    }).catch(function (error) {
      list.innerHTML = emptyRow(apiActionErrorMessage(error, '\uC77C\uAE30\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.'), '')
    })
  }

  function renderTravelPageFromApi(force) {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    var panel = document.querySelector('.trip-manager')
    var headerAction = document.querySelector('.panel-header .passive-header-chip, .panel.wide.full-span .panel-header button')
    if (!panel && !headerAction) return
    if (!force && panel && panel.dataset.apiBacked === 'true') return
    if (panel) panel.dataset.apiBacked = 'true'
    fetchTrips().then(function (trips) {
      if (headerAction) headerAction.textContent = Number(trips.length || 0).toLocaleString('ko-KR') + '\uAC1C'
      if (panel) renderApiTripList(panel, trips)
      removeHardcodedDemoData()
    })
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
      return '<button type="button" class="trip-list-card api-trip-card" data-api-trip-id="' + escapeHtml(trip.id) + '">' +
        '<div><strong>' + escapeHtml(trip.title || '\uC5EC\uD589') + '</strong>' +
        '<span>' + escapeHtml((trip.startDate || '') + (trip.endDate && trip.endDate !== trip.startDate ? ' ~ ' + trip.endDate : '')) + '</span></div>' +
        '<small>\uAE30\uB85D \uCD94\uAC00</small>' +
        '</button>'
    }).join('')
    list.querySelectorAll('.api-trip-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var trip = trips.find(function (item) { return String(item.id) === String(card.dataset.apiTripId) })
        if (trip) openApiTripDetail(panel, trip)
      })
    })
  }

  function openApiTripDetail(panel, trip) {
    if (!panel || !trip) return
    localStorage.setItem(API_TRIP_ID_KEY, String(trip.id))
    var detail = panel.querySelector('.api-trip-detail')
    if (!detail) {
      detail = document.createElement('section')
      detail.className = 'api-trip-detail'
      panel.appendChild(detail)
    }
    detail.innerHTML = [
      '<header class="api-trip-detail-header"><div><h3>' + escapeHtml(trip.title || '\uC5EC\uD589') + '</h3><span>' + escapeHtml((trip.startDate || '') + (trip.endDate && trip.endDate !== trip.startDate ? ' ~ ' + trip.endDate : '')) + '</span></div><button type="button" data-api-trip-back>\uBAA9\uB85D</button></header>',
      '<form class="travel-form api-travel-record-form">',
      '<label><span>\uC81C\uBAA9 <em class="required-mark">*</em></span><input data-field="travel-title" /></label>',
      '<label><span>\uC704\uCE58</span><input data-field="travel-location" /></label>',
      '<label><span>\uC0AC\uC6A9\uAE08\uC561</span><input data-field="travel-amount" inputmode="numeric" /></label>',
      '<label><span>\uB0A0\uC9DC</span><input data-field="travel-record-date" type="date" value="' + todayText() + '" /></label>',
      '<label><span>\uC2DC\uAC04</span><input data-field="travel-record-time" type="time" value="' + currentTimeText() + '" /></label>',
      '<label class="travel-note-field"><span>\uBA54\uBAA8</span><textarea rows="4"></textarea></label>',
      '<div class="travel-form-actions"><button type="submit" class="submit-action">\uAE30\uB85D \uCD94\uAC00</button></div>',
      '</form>',
      '<div class="api-trip-record-list"></div>'
    ].join('')
    var back = detail.querySelector('[data-api-trip-back]')
    if (back) back.addEventListener('click', function () { detail.remove() })
    normalizeTravelEntryForm()
    renderApiTripRecords(detail, trip.id)
    var first = detail.querySelector('[data-field="travel-title"]')
    if (first) window.setTimeout(function () { first.focus() }, 120)
  }

  function renderApiTripRecords(detail, tripId) {
    var list = detail && detail.querySelector('.api-trip-record-list')
    if (!list) return
    list.innerHTML = '<p class="empty-note">\uC5EC\uD589 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchTripRecords(tripId).then(function (records) {
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
    return apiRequest('/trips/' + encodeURIComponent(tripId) + '/records').then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
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
    panel.innerHTML = '<header class="panel-header"><h2>DB 가족일기</h2><button type="button">서버 조회</button></header><div class="server-data-list"></div>'
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
    if (document.querySelector('.baby-detail')) return
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
    if (!force && grid.dataset.apiLoaded === 'true') return
    grid.dataset.apiLoaded = 'true'
    fetchBabies().then(function (babies) {
      if (!babies.length) {
        grid.innerHTML = '<div class="api-empty-row baby-api-empty"><strong>\uB4F1\uB85D\uB41C \uC544\uC774\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</strong></div>'
        return
      }
      grid.innerHTML = babies.map(function (baby) {
        var growth = [baby.latestHeightCm ? baby.latestHeightCm + 'cm' : '', baby.latestWeightKg ? baby.latestWeightKg + 'kg' : ''].filter(Boolean).join(' \u00B7 ')
        return [
          '<button type="button" class="baby-card" data-api-baby-id="' + escapeHtml(baby.id) + '">',
          '<div><span class="baby-card-avatar">\uC544\uC774</span></div>',
          '<div><strong>' + escapeHtml(baby.name || '-') + '</strong>',
          '<span>' + escapeHtml([baby.gender || '', baby.birthDate || ''].filter(Boolean).join(' \u00B7 ')) + '</span>',
          '<p>' + escapeHtml(baby.memo || '') + '</p>',
          '<small>' + escapeHtml(growth || '\uC131\uC7A5 \uAE30\uB85D \uC5C6\uC74C') + '</small>',
          '</div></button>'
        ].join('')
      }).join('')
      grid.querySelectorAll('.baby-card[data-api-baby-id]').forEach(function (card) {
        card.addEventListener('click', function (event) {
          if (event.target && event.target.closest && event.target.closest('.baby-card-edit-button')) return
          openBabyApiDetailById(card.dataset.apiBabyId)
        })
      })
    }).catch(function (error) {
      grid.innerHTML = '<div class="api-empty-row baby-api-empty"><strong>' + escapeHtml(apiActionErrorMessage(error, '\uC544\uC774 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')) + '</strong></div>'
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
      if (!records.length) {
        list.innerHTML = '<div class="api-empty-row">\uB4F1\uB85D\uB41C \uC721\uC544 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>'
        return
      }
      list.innerHTML = records.map(function (record) {
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
    fetchBabies().then(function (babies) {
      var baby = babies.find(function (item) { return String(item.id) === String(babyId) })
      if (baby) openBabyApiDetail(baby)
    })
  }

  function openBabyApiDetail(baby) {
    var grid = document.querySelector('.baby-list-grid')
    if (!grid) return
    var old = document.querySelector('.baby-api-detail')
    if (old) old.remove()
    grid.hidden = true
    var detail = document.createElement('section')
    detail.className = 'baby-detail baby-api-detail'
    detail.dataset.apiBabyId = baby.id
    detail.innerHTML = [
      '<header class="baby-api-detail-header"><h2>' + escapeHtml(baby.name || '\uC544\uC774') + '</h2><button type="button" class="back-button">\uBAA9\uB85D</button></header>',
      '<article class="baby-profile-band">',
      '<span class="baby-avatar large">\uC544\uC774</span>',
      '<div><strong>' + escapeHtml(baby.name || '-') + '</strong><span>' + escapeHtml(babyMetaText(baby)) + '</span><p>' + escapeHtml(baby.memo || '') + '</p><small>' + escapeHtml(babyGrowthText(baby)) + '</small></div>',
      '</article>',
      '<section class="baby-record-list"></section>'
    ].join('')
    grid.insertAdjacentElement('afterend', detail)
    var back = detail.querySelector('.back-button')
    if (back) {
      back.addEventListener('click', function () {
        detail.remove()
        grid.hidden = false
      })
    }
    ensureBabyApiRecordForm()
    normalizeTimeInputs(detail)
    renderBabyApiRecordRows(detail, baby.id)
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
    removeDeveloperServerPanels()
    cleanupPatchRootsForCurrentMenu()
    normalizeMenuCaptions()
    normalizeLedgerEntryForm()
    normalizeTravelEntryForm()
    ensureTravelHeaderActions()
    normalizeDiaryEntryForm()
    normalizeBabyEntryForms()
    normalizeTimeInputs()
    removeFeaturePlaceholders()
    removeHardcodedDemoData()
    renderHomeMetricsFromApi(force)
    renderLedgerPageFromApi(force)
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
    return getReadableFamilyId().then(function (familyId) {
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
    return getCurrentFamilyId(forceRefresh).then(function (familyId) {
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
      return getCleanText(item.querySelector('span')) === label
    })
    if (!target) return ''
    var trigger = target.querySelector('.custom-select-trigger, button')
    return getCleanText(trigger).replace(/\s+/g, ' ').trim()
  }

  function getDatePickerValue(root, labelText) {
    var fields = Array.from(root.querySelectorAll('.date-picker-field'))
    var target = fields.find(function (field) {
      return getCleanText(field.querySelector('span')) === labelText
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
      return getCleanText(item.querySelector('span')) === labelText
    })
    var input = target && target.querySelector('input, textarea')
    return input ? String(input.value || '').trim() : ''
  }

  function setInputValueByLabel(root, labelText, value) {
    var labels = Array.from(root.querySelectorAll('label'))
    var target = labels.find(function (item) {
      return getCleanText(item.querySelector('span')) === labelText
    })
    var input = target && target.querySelector('input, textarea')
    if (input) setNativeInputValue(input, value == null ? '' : String(value))
    return input
  }

  function setCustomSelectValueByLabel(root, labelText, value) {
    var labels = Array.from(root.querySelectorAll('label'))
    var target = labels.find(function (item) {
      return getCleanText(item.querySelector('span')) === labelText
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
      var title = getInputValueByLabel(form, '\uB0B4\uC5ED') ||
        getInputValueByLabel(form, '\uC81C\uBAA9') ||
        getFieldValue(form, '[data-field="ledger-title"]') ||
        firstInputValue(form)
      var amount = parseAmountValue(
        getInputValueByLabel(form, '\uAE08\uC561') ||
        getFieldValue(form, '[data-field="ledger-amount"]') ||
        getFieldValue(form, 'input[inputmode="numeric"]')
      )

      if (!title || !amount) return

      queueApiSync({
        type: 'createLedgerEntry',
        payload: {
          title: title,
          entryType: normalizeLedgerType(getCustomSelectValue('\uAD6C\uBD84')),
          category: getCustomSelectValue('\uCE74\uD14C\uACE0\uB9AC') || null,
          paymentMethod: getCustomSelectValue('\uACB0\uC81C\uC218\uB2E8') || null,
          memberName: getCustomSelectValue('\uC0AC\uC6A9\uC790') || getCustomSelectValue('\uAC00\uC871') || null,
          amount: amount,
          transactionDate: getDatePickerValue(form, '\uAC70\uB798\uC77C'),
          memo: getInputValueByLabel(form, '\uBA54\uBAA8') || ''
        }
      })
      flushApiQueue()
    }, 450)
  }

  function ensureDefaultApiTrip() {
    var cachedId = Number(localStorage.getItem(API_TRIP_ID_KEY) || '')
    if (Number.isFinite(cachedId) && cachedId > 0) return Promise.resolve(cachedId)

    return getCurrentFamilyId().then(function (familyId) {
      return postJson('/trips?familyId=' + encodeURIComponent(familyId), {
      title: '기본 여행',
      startDate: todayText(),
      endDate: todayText(),
      description: '프론트 동기화 기본 여행'
      })
    }).then(function (trip) {
      localStorage.setItem(API_TRIP_ID_KEY, String(trip.id))
      return trip.id
    })
  }

  function trySyncTask(task) {
    if (task.type === 'createTrip') {
      return getCurrentFamilyId().then(function (familyId) {
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
      return getCurrentFamilyId().then(function (familyId) {
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

  function flushApiQueue() {
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
      var title = getFieldValue(row, '[data-field="trip-title"]') || getFieldValue(row, 'input')
      if (!title) return
      var dateFields = row.querySelectorAll('.date-picker-field')
      var startDate = parseApiDate(getCleanText(dateFields[0])) || todayText()
      var endDate = parseApiDate(getCleanText(dateFields[1])) || startDate

      queueApiSync({
        type: 'createTrip',
        payload: {
          title: title,
          startDate: startDate,
          endDate: endDate,
          description: startDate === endDate ? startDate : (startDate + ' ~ ' + endDate)
        }
      })
      flushApiQueue()
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

      uploadMediaFiles(fileInput).then(function (files) {
        queueApiSync({
          type: 'createTravelRecord',
          payload: {
            sortOrder: parseAmountValue(getFieldValue(form, 'input[inputmode="numeric"]')) || null,
            title: title,
            category: getCustomSelectValue('\uBE44\uC6A9 \uAD6C\uBD84') || '\uAE30\uD0C0',
            amount: parseAmountValue(getFieldValue(form, '[data-field="travel-amount"]')),
            note: getFieldValue(form, 'textarea'),
            location: location || '',
            latitude: 0,
            longitude: 0,
            recordDate: getDatePickerValue(form, '\uB0A0\uC9DC') || getFieldValue(form, '[data-field="travel-record-date"]') || todayText(),
            recordTime: getFieldValue(form, '[data-field="travel-record-time"]') || currentTimeText(),
            mediaUrls: communityMediaUrls(files)
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
    if (date) date.value = todayText()
    if (time) {
      var now = new Date()
      time.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
    }
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
      var dateField = form.querySelector('[name="recordDate"]')
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
          recordTime: getFieldValue(form, '[name="recordTime"]') || null,
          amountMl: optionalInteger(getFieldValue(form, '[name="amountMl"]')),
          heightCm: optionalDecimal(getFieldValue(form, '[name="heightCm"]')),
          weightKg: optionalDecimal(getFieldValue(form, '[name="weightKg"]')),
          memo: getFieldValue(form, '[name="memo"]') || '',
          mediaUrls: communityMediaUrls(files)
        })
      })
    }).then(function () {
      resetBabyApiRecordForm(form)
      refreshServerDataViews(true)
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
    if (tripButton) syncTripAddRow(tripButton.closest('.trip-add-row'))
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
    var ledgerForm = event.target && event.target.closest && event.target.closest('.ledger-form')
    if (!ledgerForm) return
    if (ledgerForm.dataset.apiLedgerEditId) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      submitLedgerEdit(ledgerForm)
      return
    }
    syncLedgerForm(ledgerForm)
  }, true)

  document.addEventListener('click', function (event) {
    var editButton = event.target && event.target.closest && event.target.closest('[data-ledger-edit-id]')
    var deleteButton = event.target && event.target.closest && event.target.closest('[data-ledger-delete-id]')
    if (!editButton && !deleteButton) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (editButton) {
      var item = window.__familyLedgerItemsById && window.__familyLedgerItemsById[String(editButton.dataset.ledgerEditId)]
      if (!fillLedgerFormForEdit(item)) showPatchToast('\uC218\uC815\uD560 \uB300\uC0C1\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      return
    }
    deleteLedgerEntry(deleteButton.dataset.ledgerDeleteId)
  }, true)

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('.ledger-form button[type="submit"], .ledger-form .submit-action')
    if (!button) return
    var form = button.closest('.ledger-form')
    if (!form || !form.dataset.apiLedgerEditId) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitLedgerEdit(form)
  }, true)

  document.addEventListener('submit', function (event) {
    var diaryForm = event.target && event.target.closest && event.target.closest('.diary-form')
    if (diaryForm) syncDiaryForm(diaryForm)
  }, true)

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('button')
    if (!button || getCleanText(button) !== '\uC77C\uAE30 \uCD94\uAC00') return
    var panel = button.closest('form, aside, section, article, .panel, .entry-panel')
    if (!panel || getCleanText(panel.querySelector('h2')) !== '\uC77C\uAE30 \uCD94\uAC00') return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitExistingDiaryPanel(panel, button)
  }, true)

  document.addEventListener('submit', function (event) {
    var babyForm = event.target && event.target.closest && event.target.closest('.baby-api-record-form')
    if (!babyForm) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitBabyApiRecordForm(babyForm)
  }, true)

  document.addEventListener('click', function (event) {
    var clearButton = event.target && event.target.closest && event.target.closest('[data-baby-api-clear]')
    if (!clearButton) return
    var form = clearButton.closest('.baby-api-record-form')
    resetBabyApiRecordForm(form)
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
    ensureAdminBatchSaveButton()
  }, 120000)
  window.setInterval(ensureAdminBatchSaveButton, 1000)

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
