(function () {
  var DAY_MS = 86400000
  var WEEK_MS = DAY_MS * 7
  var modes = ['day', 'week', 'month', 'year']
  var AUTH_TOKEN_STORAGE_KEY = 'family-platform-access-token'
  var AUTH_USER_STORAGE_KEY = 'family-platform-user'
  var AUTH_FAMILY_STORAGE_KEY = 'family-platform-current-family-id'
  var AUTH_TRIP_STORAGE_KEY = 'family-platform-api-default-trip-id'
  var MEDIA_MAX_FILES = 6
  var MEDIA_MAX_IMAGE_BYTES = 8 * 1024 * 1024
  var MEDIA_MAX_VIDEO_BYTES = 30 * 1024 * 1024
  var MEDIA_MAX_TOTAL_BYTES = 40 * 1024 * 1024

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

  function parseAuthError(error) {
    var text = String(error && error.message ? error.message : error || '')
    if (text.indexOf('locked') >= 0 || text.indexOf('423') >= 0) {
      var seconds = Number((text.match(/(\d+)\s*seconds/i) || [])[1] || 0)
      var minutes = seconds ? Math.ceil(seconds / 60) : 5
      return '\uBE44\uBC00\uBC88\uD638 5\uD68C \uC2E4\uD328\uB85C \uACC4\uC815\uC774 \uC7A0\uAE40\uCC98\uB9AC\uB410\uC2B5\uB2C8\uB2E4. ' + minutes + '\uBD84 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.'
    }
    if (text.indexOf('already registered') >= 0) return '이미 가입된 이메일입니다. 로그인으로 진행해주세요.'
    if (text.indexOf('Invalid email or password') >= 0) return '이메일 또는 비밀번호를 확인해주세요.'
    if (text.indexOf('invalid') >= 0 || text.indexOf('400') >= 0) return '이메일, 비밀번호 형식을 확인해주세요. 비밀번호는 10자 이상입니다.'
    return '로그인 처리 중 오류가 발생했습니다.'
  }

  function getAuthMode(card) {
    var active = card.querySelector('.auth-tabs button.active')
    var text = getCleanText(active)
    return text.indexOf('가입') >= 0 || text.toLowerCase().indexOf('register') >= 0 ? 'register' : 'login'
  }

  function getAuthPayload(card) {
    var inputs = Array.from(card.querySelectorAll('input'))
    var emailInput = inputs.find(function (input) {
      return input.type === 'email' || /@/.test(input.value || '') || /email|mail|이메일/i.test(input.placeholder || '')
    }) || inputs[0]
    var passwordInput = inputs.find(function (input) {
      return input.type === 'password' || /비밀번호|password/i.test(input.placeholder || '')
    }) || inputs[1]
    var nicknameInput = inputs.find(function (input) {
      if (input === emailInput || input === passwordInput) return false
      return input.type !== 'password'
    })

    return {
      email: emailInput ? String(emailInput.value || '').trim() : '',
      password: passwordInput ? String(passwordInput.value || '') : '',
      nickname: nicknameInput ? String(nicknameInput.value || '').trim() : ''
    }
  }

  function focusEmptyAuthField(card, payload, mode) {
    var inputs = Array.from(card.querySelectorAll('input'))
    var target = null
    if (!payload.email) target = inputs[0]
    else if (!payload.password || payload.password.length < 10) target = inputs.find(function (input) { return input.type === 'password' }) || inputs[1]
    else if (mode === 'register' && !payload.nickname) target = inputs.find(function (input) { return input.type !== 'email' && input.type !== 'password' })
    if (target) {
      target.focus()
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function completeAuth(button, response) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.accessToken)
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify({
      id: response.userId,
      email: response.email,
      nickname: response.nickname,
      platformAdmin: response.platformAdmin
    }))
    button.dataset.authBypass = 'true'
    submitLegacyAuthForm(button)
    window.setTimeout(function () {
      delete button.dataset.authBypass
      flushApiQueue()
      loadScheduleNotifications()
    }, 100)
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
    if (mode === 'register') return payload
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
        showPatchToast(mode === 'register' ? '\uD68C\uC6D0\uAC00\uC785\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : '\uB85C\uADF8\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
        completeAuth(submit, response)
      }).catch(function (error) {
        if (mode === 'login' && isActiveSessionError(error) && !forceLogin) {
          showPatchConfirm('\uD604\uC7AC \uB85C\uADF8\uC778\uC774 \uB418\uC5B4\uC788\uC2B5\uB2C8\uB2E4. \uB85C\uADF8\uC778\uC744 \uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?', function () {
            submitAuthRequest(mode, payload, submit, true)
          })
          return
        }
        showPatchToast(parseAuthError(error))
      }).finally(function () {
        setAuthSubmitBusy(submit, mode, false)
      })
  }

  function submitLegacyAuthForm(button) {
    if (!button) return
    var form = button.closest && button.closest('.auth-card')
    var wasDisabled = button.disabled
    button.disabled = false
    if (form && form.requestSubmit) {
      form.requestSubmit(button)
    } else if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    } else {
      button.click()
    }
    button.disabled = wasDisabled
  }

  function setNativeInputValue(input, value) {
    if (!input) return
    var descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    if (descriptor && descriptor.set) descriptor.set.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function readStoredAuthUser() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_USER_STORAGE_KEY) || 'null')
    } catch (error) {
      return null
    }
  }

  function apiBaseUrlForAuth() {
    return window.FAMILY_PLATFORM_API_BASE_URL || localStorage.getItem('family-platform-api-base-url') || 'http://localhost:8080/api'
  }

  function clearStoredAuth() {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(AUTH_USER_STORAGE_KEY)
    localStorage.removeItem(AUTH_FAMILY_STORAGE_KEY)
    localStorage.removeItem(AUTH_TRIP_STORAGE_KEY)
  }

  function restoreAuthSession() {
    var card = document.querySelector('.auth-card')
    if (!card || card.dataset.sessionRestoreReady === 'true') return
    var token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    var storedUser = readStoredAuthUser()
    if (!token || !storedUser || !storedUser.email) return

    card.dataset.sessionRestoreReady = 'true'
    fetch(apiBaseUrlForAuth() + '/auth/me', {
      headers: { Authorization: 'Bearer ' + token }
    }).then(function (response) {
      if (!response.ok) throw new Error('Invalid session')
      return response.json()
    }).then(function (response) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.accessToken)
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify({
        id: response.userId,
        email: response.email,
        nickname: response.nickname,
        platformAdmin: response.platformAdmin
      }))
      var emailInput = card.querySelector('[data-field="login-email"]') || card.querySelector('input')
      var passwordInput = card.querySelector('[data-field="login-password"]') || card.querySelector('input[type="password"]')
      setNativeInputValue(emailInput, response.email || storedUser.email)
      if (passwordInput && !passwordInput.value) setNativeInputValue(passwordInput, 'family1234')
      var submit = card.querySelector('.auth-submit')
      if (submit) {
        submit.dataset.authBypass = 'true'
        submitLegacyAuthForm(submit)
        window.setTimeout(function () {
          delete submit.dataset.authBypass
          flushApiQueue()
          loadScheduleNotifications()
        }, 100)
      }
    }).catch(function () {
      clearStoredAuth()
      delete card.dataset.sessionRestoreReady
    })
  }

  function enhanceAuthApi() {
    var card = document.querySelector('.auth-card')
    if (!card || card.dataset.authApiReady) return
    card.dataset.authApiReady = 'true'

    var submit = card.querySelector('.auth-submit')
    if (!submit) return

    submit.addEventListener('click', function (event) {
      if (submit.dataset.authBypass === 'true') return
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()

      var mode = getAuthMode(card)
      var payload = getAuthPayload(card)
      if (!payload.email || !payload.password || payload.password.length < 10 || (mode === 'register' && !payload.nickname)) {
        focusEmptyAuthField(card, payload, mode)
        showPatchToast(mode === 'register' ? '\uC774\uBA54\uC77C, \uB2C9\uB124\uC784, 10\uC790 \uC774\uC0C1 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.' : '\uC774\uBA54\uC77C\uACFC 10\uC790 \uC774\uC0C1 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.')
        return
      }

      submitAuthRequest(mode, payload, submit, false)
    }, true)
  }

  function submitAuthViaApi(card, submit) {
    if (!card || !submit || submit.dataset.authBypass === 'true' || submit.dataset.authBusy === 'true') return

    var activeTab = card.querySelector('.auth-tabs button.active')
    var activeText = getCleanText(activeTab)
    var mode = activeText.indexOf('\uAC00\uC871') >= 0 || activeText.toLowerCase().indexOf('register') >= 0 ? 'register' : 'login'
    var payload = getAuthPayload(card)
    if (!payload.email || !payload.password || payload.password.length < 10 || (mode === 'register' && !payload.nickname)) {
      focusEmptyAuthField(card, payload, mode)
      showPatchToast(mode === 'register' ? '\uC774\uBA54\uC77C, \uB2C9\uB124\uC784, 10\uC790 \uC774\uC0C1 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.' : '\uC774\uBA54\uC77C\uACFC 10\uC790 \uC774\uC0C1 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.')
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

  function updateScheduleFormVisibleDate(date) {
    var trigger = document.querySelector('.schedule-form-card .date-picker-trigger')
    var triggerText = trigger && trigger.querySelector('span')
    if (!triggerText) return
    if (trigger) trigger.dataset.solarDate = formatDate(date)
    triggerText.textContent = isScheduleBasisLunar() ? getLunarText(date) : formatDisplayDate(date)
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
    var card = document.querySelector('.selected-day-card')
    if (!card) return

    var titleButton = card.querySelector('.panel-header button')
    if (titleButton) titleButton.textContent = formatKoreanShortDate(date)

    var list = card.querySelector('.schedule-list')
    if (!list) return

    if (agendaSource) {
      var items = Array.from(agendaSource.querySelectorAll('span')).map(function (item) {
        return item.textContent.trim()
      }).filter(Boolean)

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

  function openSelectedDayDetail(target) {
    var text = target ? target.textContent.trim() : ''
    if (!text) return
    var firstLine = text.split('\n').map(function (line) { return line.trim() }).filter(Boolean)[0] || text
    var titleText = firstLine.replace(/^\d{1,2}:\d{2}\s*/, '') || '\uC77C\uC815 \uC0C1\uC138'
    var linkedRow = findScheduleRowByTitle(titleText)
    var linkedContent = linkedRow && linkedRow.children && linkedRow.children.length > 1 ? linkedRow.children[1] : linkedRow
    var linkedMeta = linkedContent && linkedContent.querySelector('p')
    var linkedMemo = linkedContent && linkedContent.querySelector('small')
    var old = document.querySelector('.schedule-detail-patch-backdrop')
    if (old) old.remove()

    var backdrop = document.createElement('div')
    backdrop.className = 'schedule-detail-patch-backdrop'
    var dialog = document.createElement('section')
    dialog.className = 'schedule-detail-patch-dialog'
    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'schedule-detail-patch-close'
    close.textContent = 'x'
    close.addEventListener('click', function () { backdrop.remove() })

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
      if (event.target === backdrop) backdrop.remove()
    })
    document.body.appendChild(backdrop)
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
    var count = card.querySelector('.panel-header button')
    if (title && label) title.textContent = label
    if (count && countText) count.textContent = countText
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
    for (var index = 0; index < count; index += 1) {
      clickNavButton(direction)
      await new Promise(function (resolve) { window.setTimeout(resolve, 6) })
    }

    window.setTimeout(function () {
      if (getActiveCalendarMode() === 'year') {
        clickVisibleMonth(target)
        updateScheduleFormVisibleDate(new Date(target.getFullYear(), target.getMonth(), 1))
      } else {
        clickVisibleDay(target)
        updateScheduleFormVisibleDate(target)
      }
      updateJumpInput(target)
    }, 120)
  }

  function ensureCalendarJumpControl() {
    document.querySelectorAll('.calendar-jump-control').forEach(function (control) {
      control.remove()
    })
  }

  function renderJumpDatepicker(baseDate) {
    var old = document.querySelector('.jump-datepicker-popover')
    if (old) old.remove()

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
      html += '<div class="calendar-today-row"><button type="button" data-jump-today>\uC624\uB298</button></div>'

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
        moveCalendarTo(today)
        updateJumpInput(today)
        updateScheduleFormVisibleDate(today)
        popover.remove()
        return
      }
      var monthButton = target.closest('[data-jump-month]')
      if (monthButton) {
        var pickedMonth = new Date(view.getFullYear(), Number(monthButton.dataset.jumpMonth), 1)
        view = pickedMonth
        selected = pickedMonth
        if (mode === 'month') {
          moveCalendarTo(pickedMonth)
          updateJumpInput(pickedMonth)
          updateScheduleFormVisibleDate(pickedMonth)
          popover.remove()
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
          moveCalendarTo(pickedYear)
          updateJumpInput(pickedYear)
          updateScheduleFormVisibleDate(pickedYear)
          popover.remove()
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
        moveCalendarTo(picked)
        updateJumpInput(picked)
        updateScheduleFormVisibleDate(picked)
        popover.remove()
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
      var focused = getFocusedDate()
      var selected = getScheduleFormVisibleDate() || focused
      if (mode === 'year') {
        var monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1)
        clickVisibleMonth(monthStart)
        updateJumpInput(monthStart)
        updateScheduleFormVisibleDate(monthStart)
      } else {
        clickVisibleDay(selected)
        updateJumpInput(selected)
        updateScheduleFormVisibleDate(selected)
        updateSelectedDayPanel(selected)
      }
    }, 140)
  }

  function wireCalendarInteractions() {
    document.querySelectorAll('.family-calendar-panel .calendar-view-tabs button').forEach(function (button) {
      if (button.dataset.patchWired) return
      button.dataset.patchWired = 'true'
      button.addEventListener('click', normalizeSelectedDateAfterViewChange)
    })

    document.querySelectorAll('.family-calendar-panel .calendar-day-card').forEach(function (card) {
      if (card.dataset.patchWired) return
      card.dataset.patchWired = 'true'
      card.addEventListener('click', function () {
      var titleDate = getFocusedDate()
      var day = Number((card.querySelector('.day-number') || {}).textContent || titleDate.getDate())
      if (Number.isFinite(day)) {
        var selectedDate = new Date(titleDate.getFullYear(), titleDate.getMonth(), day)
        updateJumpInput(selectedDate)
        updateScheduleFormVisibleDate(selectedDate)
        updateSelectedDayPanel(selectedDate)
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
          updateJumpInput(selectedDate)
          updateScheduleFormVisibleDate(selectedDate)
          updateSelectedDayPanel(selectedDate, column)
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
      var titleDate = getFocusedDate()
      var strong = card.querySelector('strong')
      var month = Number(((strong && strong.textContent.match(/\d+/g)) || [])[0])
      if (Number.isFinite(month)) {
        var selectedMonth = new Date(titleDate.getFullYear(), month - 1, 1)
        updateJumpInput(selectedMonth)
        updateScheduleFormVisibleDate(selectedMonth)
        document.querySelectorAll('.year-month-card.active').forEach(function (item) {
          item.classList.remove('active')
        })
        card.classList.add('active')
        setScheduleListContext(month + '\uC6D4 \uC77C\uC815\uD45C', (card.querySelector('span') || {}).textContent)
      }
    })
  })
  }

  function setYearMode(mode) {
    document.documentElement.dataset.yearScheduleMode = mode
    document.querySelectorAll('.year-mode-tabs button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.yearMode === mode)
    })
    decorateYearCalendar()
  }

  function buildMiniMonth(year, month, eventDays) {
    var first = new Date(year, month - 1, 1)
    var lastDate = new Date(year, month, 0).getDate()
    var html = '<div class="year-mini-weekdays"><span>\uC77C</span><span>\uC6D4</span><span>\uD654</span><span>\uC218</span><span>\uBAA9</span><span>\uAE08</span><span>\uD1A0</span></div><div class="year-mini-days">'
    for (var blank = 0; blank < first.getDay(); blank += 1) html += '<span></span>'
    for (var day = 1; day <= lastDate; day += 1) {
      var hasEvent = eventDays.indexOf(day) >= 0
      html += '<span class="' + (hasEvent ? 'has-event' : '') + '">' + day + '</span>'
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
    if (month !== 6) return []
    return Array.from(document.querySelectorAll('.schedule-row .schedule-date-badge strong')).map(function (item) {
      return Number(item.textContent.trim())
    }).filter(function (day) {
      return Number.isFinite(day)
    })
  }

  function decorateYearCalendar() {
    if (getActiveCalendarMode() !== 'year') return
    var mode = document.documentElement.dataset.yearScheduleMode || 'list'
    var year = getCurrentYearNumber()
    document.querySelectorAll('.year-month-card').forEach(function (card) {
      var strong = card.querySelector('strong')
      var month = Number(((strong && strong.textContent.match(/\d+/g)) || [])[0])
      if (!Number.isFinite(month)) return
      var mini = card.querySelector('.year-mini-calendar')
      if (mode === 'calendar') {
        var key = year + '-' + month + '-' + collectMonthEventDays(month).join(',')
        if (!mini) {
          mini = document.createElement('div')
          mini.className = 'year-mini-calendar'
          card.appendChild(mini)
        }
        if (mini.dataset.key !== key) {
          mini.dataset.key = key
          mini.innerHTML = buildMiniMonth(year, month, collectMonthEventDays(month))
        }
      } else if (mini) {
        mini.remove()
      }
    })
  }

  function ensureYearModeTabs() {
    var grid = document.querySelector('.family-calendar-panel .year-schedule-grid')
    if (getActiveCalendarMode() !== 'year' || !grid) {
      var stale = document.querySelector('.family-calendar-panel .year-mode-tabs')
      if (stale) stale.remove()
      delete document.documentElement.dataset.yearScheduleMode
      return
    }
    var existing = document.querySelector('.family-calendar-panel .year-mode-tabs')
    if (existing) {
      decorateYearCalendar()
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
    setYearMode(document.documentElement.dataset.yearScheduleMode || 'list')
  }

  function wireScheduleDetailRows() {
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
      '@media(max-width:760px){.family-group-summary{grid-template-columns:1fr}.family-group-list article{align-items:flex-start;flex-direction:column}.passive-header-chip{min-height:30px;padding:0 11px;font-size:12px}}'
    ].join('\n')
    document.head.appendChild(style)
  }

  function cleanupPassiveButtons() {
    ensureUiCleanupStyles()
    document.querySelectorAll('.topbar .primary-action, .top-actions .primary-action, .hero-actions .primary-action').forEach(function (button) {
      if (getCleanText(button) === '\uC0C8 \uAE30\uB85D') button.remove()
    })

    document.querySelectorAll('.panel-header button, .server-domain-panel header button').forEach(function (button) {
      var text = getCleanText(button)
      if (!text) return
      if (text === '\uC11C\uBC84 \uC870\uD68C' || /^\d+\uAC1C$/.test(text) || /^\d+\uAC74$/.test(text) || /^\d+\uACF3$/.test(text) || /^\d{1,2}\uC6D4\s+\d{1,2}\uC77C/.test(text)) {
        replaceButtonWithBadge(button, 'passive-header-chip')
      }
    })
  }

  function cleanupCalendarChrome() {
    var titleButton = document.querySelector('.family-calendar-panel .calendar-title-button')
    if (titleButton) {
      titleButton.setAttribute('aria-label', '\uB0A0\uC9DC \uC774\uB3D9')
      titleButton.querySelectorAll('span').forEach(function (span) {
        if (getCleanText(span).indexOf('\uC624\uB298') >= 0) span.remove()
      })
    }

    var iconButtons = Array.from(document.querySelectorAll('.top-actions .icon-button, .summary-actions .icon-button'))
    iconButtons.forEach(function (button, index) {
      if (button.getAttribute('aria-label')) return
      var label = index === 0 ? '\uD14C\uB9C8 \uBCC0\uACBD' : '\uCE98\uB9B0\uB354'
      button.setAttribute('aria-label', label)
      button.setAttribute('title', label)
    })
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
    root.innerHTML = [
      '<section class="panel wide family-group-panel">',
      '<div class="community-hero family-group-hero">',
      '<div><span>Family Group</span><h2>\uAC00\uC871\uBCC4 \uAD8C\uD55C\uACFC \uCD08\uB300\uB97C \uAD00\uB9AC\uD569\uB2C8\uB2E4</h2><p>\uCD1D\uAD04\uAD00\uB9AC\uC790\uB294 \uC804\uCCB4 \uD655\uC778, \uAC00\uC871\uAD00\uB9AC\uC790\uB294 \uAD6C\uC131\uC6D0 \uCD08\uB300\uC640 CRUD \uAD8C\uD55C\uC744 \uAD00\uB9AC\uD558\uB294 \uD654\uBA74\uC785\uB2C8\uB2E4.</p></div>',
      '<strong>\uC6B4\uC601 \uC900\uBE44<br><b>\uAD8C\uD55C \uC5F0\uACB0</b></strong>',
      '</div>',
      '<div class="family-group-summary">',
      '<article><span>\uD604\uC7AC \uAC00\uC871</span><strong>\uAE30\uBCF8 \uAC00\uC871</strong><small>\uAC00\uC871 ID 1</small></article>',
      '<article><span>\uB0B4 \uC5ED\uD560</span><strong>\uAC00\uC871\uAD00\uB9AC\uC790</strong><small>\uC77D\uAE30/\uC791\uC131/\uC218\uC815/\uC0AD\uC81C</small></article>',
      '<article><span>\uB2E4\uC74C \uC791\uC5C5</span><strong>\uCD08\uB300\uCF54\uB4DC</strong><small>\uAD8C\uD55C \uBCC4 \uC811\uADFC \uC5F0\uACB0</small></article>',
      '</div>',
      '<div class="family-group-list">',
      '<article><div><strong>\uCD1D\uAD04\uAD00\uB9AC\uC790</strong><span>admin@family.test</span></div><b>\uC804\uCCB4 \uD655\uC778</b></article>',
      '<article><div><strong>\uC5C4\uB9C8</strong><span>\uC77D\uAE30/\uC791\uC131/\uC218\uC815</span></div><b>\uAC00\uC871\uAD00\uB9AC\uC790</b></article>',
      '<article><div><strong>\uC544\uBE60</strong><span>\uC77D\uAE30/\uC791\uC131</span></div><b>\uAD6C\uC131\uC6D0</b></article>',
      '</div>',
      '</section>'
    ].join('')
    resumePatchObserver()
  }

  function refreshCalendarPatch() {
    if (document.documentElement.dataset.patchPage === 'community') {
      ensureCommunityMenu()
      wireCommunityPage()
      enhanceMediaUploadLimits()
      cleanupPassiveButtons()
      return
    }
    if (document.documentElement.dataset.patchPage === 'family-group') {
      cleanupPassiveButtons()
      return
    }
    cleanupStaleServerPanels()
    ensureCalendarJumpControl()
    ensureCommunityMenu()
    wireCalendarInteractions()
    cleanupCalendarChrome()
    ensureYearModeTabs()
    wireScheduleDetailRows()
    normalizeLunarLabels()
    enhanceDatepickers()
    syncScheduleBasisLayout()
    refreshLabelCleanup()
    enhanceAuthApi()
    restoreAuthSession()
    enhanceBabyGrowthTabs()
    enhanceAuthSso()
    enhanceHomeDashboard()
    renderNotificationBell()
    loadScheduleNotifications()
    refreshServerDataViews()
    hideBabyEmptySelectionPanel()
    enhanceBabyRecordMedia()
    cleanupBabyDetailButtons()
    ensureBabyApiRecordForm()
    enhanceBabyEditMediaHelper()
    enhanceBabyProfileEdit()
    enhanceMediaUploadLimits()
    cleanupPassiveButtons()
  }

  function safeRefreshCalendarPatch() {
    try {
      refreshCalendarPatch()
    } catch (error) {
      window.__familyPatchLastError = String(error && error.message ? error.message : error)
    }
  }

  var observer = new MutationObserver(safeRefreshCalendarPatch)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.setInterval(safeRefreshCalendarPatch, 1000)
  safeRefreshCalendarPatch()

  function handleAuthSubmitEvent(event) {
    var submit = event.target && event.target.closest && event.target.closest('.auth-submit')
    if (!submit || submit.dataset.authBypass === 'true') return false
    var card = submit.closest('.auth-card')
    if (!card) return false
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
    var submit = card.querySelector('.auth-submit')
    if (!submit || submit.dataset.authBypass === 'true') return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitAuthViaApi(card, submit)
    return true
  }

  window.addEventListener('submit', handleAuthFormSubmitEvent, true)
  document.addEventListener('submit', handleAuthFormSubmitEvent, true)
  window.__familyAuthPatchReady = true

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('button')
    if (!button) return
    var text = getCleanText(button)
    if (text.indexOf('\uB85C\uADF8\uC544\uC6C3') >= 0 || text.toLowerCase().indexOf('logout') >= 0) {
      clearStoredAuth()
    }
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
    if (jump) jump.remove()
  }, true)

  function getCleanText(element) {
    return element ? element.textContent.replace(/\s+/g, ' ').trim() : ''
  }

  function refreshLabelCleanup() {
    document.querySelectorAll('.panel-header').forEach(function (header) {
      var title = getCleanText(header.querySelector('h2'))
      var actionButton = header.querySelector(':scope > button')

      if (title === '\uAC00\uACC4\uBD80 \uC785\uB825' && actionButton && getCleanText(actionButton) === '\uD3B8\uC9D1') {
        actionButton.remove()
      }

      if (title === '\uC77C\uC815 \uCD94\uAC00' && actionButton && getCleanText(actionButton) === '\uC0C8 \uC77C\uC815') {
        actionButton.remove()
      }

      if (title === '\uC721\uC544 \uAE30\uB85D') {
        var babyNameButton = actionButton && getCleanText(actionButton) !== '\uBAA9\uB85D' ? actionButton : null
        if (babyNameButton) babyNameButton.remove()

        var detail = document.querySelector('.baby-detail')
        var backButton = detail && detail.querySelector('.back-button')
        if (!backButton) {
          if (!detail) {
            header.querySelectorAll('.baby-header-back-button').forEach(function (button) {
              button.remove()
            })
            if (actionButton && getCleanText(actionButton) === '\uBAA9\uB85D') actionButton.remove()
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
        if (detailButton) detailButton.remove()

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
    notice: [
      {
        id: 'notice-1',
        title: '\uAC00\uC871 \uD50C\uB7AB\uD3FC \uCEE4\uBBA4\uB2C8\uD2F0 \uC624\uD508',
        body: '\uACF5\uC9C0\uC0AC\uD56D\uC740 \uAD00\uB9AC\uC790\uB9CC \uB4F1\uB85D\uD560 \uC218 \uC788\uACE0, \uC790\uC720\uAC8C\uC2DC\uD310\uC740 \uC804\uCCB4 \uC0AC\uC6A9\uC790\uAC00 \uD568\uAED8 \uC0AC\uC6A9\uD569\uB2C8\uB2E4.',
        author: '\uCD1D\uAD04\uAD00\uB9AC\uC790',
        date: '2026.06.05',
        time: '09:00',
        files: [{ name: '\uACF5\uC9C0-\uC548\uB0B4.png', size: '840KB' }],
        comments: []
      }
    ],
    free: [
      {
        id: 'free-1',
        title: '\uC8FC\uB9D0\uC5D0 \uC544\uC774\uB791 \uAC00\uAE30 \uC88B\uC740 \uACF3 \uCD94\uCC9C\uD574\uC694',
        body: '\uAC00\uC871\uB2E8\uC704\uB97C \uB118\uC5B4\uC11C \uB2E4\uB978 \uC0AC\uC6A9\uC790\uB4E4\uACFC \uACF5\uC720\uD558\uB294 \uC790\uC720\uAC8C\uC2DC\uD310 \uC0D8\uD50C\uC785\uB2C8\uB2E4.',
        author: '\uC5C4\uB9C8',
        date: '2026.06.05',
        time: '10:20',
        files: [{ name: '\uC8FC\uB9D0-\uB098\uB4E4\uC774.jpg', size: '1.8MB' }],
        comments: [
          { id: 'comment-1', author: '\uC544\uBE60', time: '2026.06.05 10:42', text: '\uC9C0\uB3C4\uC640 \uC5F0\uACB0\uD558\uBA74 \uC88B\uACA0\uC5B4\uC694.' }
        ]
      },
      {
        id: 'free-2',
        title: '\uC721\uC544 \uD328\uD134 \uAE30\uB85D \uD301 \uACF5\uC720',
        body: '\uC218\uC720, \uC218\uBA74, \uBC30\uBCC0 \uAE30\uB85D\uC744 \uC624\uC804/\uC624\uD6C4\uB85C \uB098\uB220\uBCF4\uBA74 \uD328\uD134\uC774 \uB354 \uC798 \uBCF4\uC785\uB2C8\uB2E4.',
        author: '\uAC00\uC871\uAD00\uB9AC\uC790',
        date: '2026.06.04',
        time: '21:05',
        files: [],
        comments: []
      }
    ],
    inquiry: [
      {
        id: 'inquiry-1',
        title: '\uC54C\uB9BC \uC5F0\uB3D9 \uC694\uCCAD',
        body: '\uCD08\uB300\uB41C \uAD6C\uC131\uC6D0\uC5D0\uAC8C \uD478\uC2DC \uC54C\uB9BC\uC774 \uAC00\uB294 \uAD6C\uC870\uB97C \uBC31\uC5D4\uB4DC \uC5F0\uACB0 \uB2E8\uACC4\uC5D0\uC11C \uC815\uB9AC\uD560 \uC608\uC815\uC785\uB2C8\uB2E4.',
        author: '\uAD00\uB9AC\uC790',
        date: '2026.06.05',
        time: '11:30',
        files: [],
        comments: []
      }
    ]
  }

  function isAdminRole() {
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
    if (wasCommunity || wasFamilyGroup) clearCustomPatchPageAfterReact(wasCommunity, wasFamilyGroup)
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
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!isFamilyGroupNavItem(nav)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    openFamilyGroupPage()
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
    window.setTimeout(function () { renderCommunityPage(true) }, 0)
    window.setTimeout(function () { renderCommunityPage(true) }, 160)
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
    if (!localStorage.getItem(API_AUTH_TOKEN_KEY)) return Promise.resolve([])
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
      return next
    }).catch(function () {
      return post
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
    var token = localStorage.getItem(API_AUTH_TOKEN_KEY || AUTH_TOKEN_STORAGE_KEY)
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
    var needsServerLoad = !communityState.loadedTabs[tab] && !communityState.loadingTabs[tab]
    if (needsServerLoad) loadCommunityList(tab, false).then(function () {
      if (document.documentElement.dataset.patchPage === 'community' && communityState.activeTab === tab) {
        renderCommunityPage(true)
      }
    })
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
      '<div><strong>\uC790\uC720\uAC8C\uC2DC\uD310</strong><span>\uC81C\uBAA9\uC744 \uB204\uB974\uBA74 \uC0C1\uC138\uC640 \uB313\uAE00\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.</span></div>',
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

  function renderCommunityBoard(tab, admin) {
    if (tab !== 'free' && !admin) return '<div class="community-locked">\uAD00\uB9AC\uC790\uB9CC \uC791\uC131\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</div>'
    if (communityState.view === 'detail' && communityState.selectedPostId) return renderCommunityDetail(tab)
    return [
      '<div class="community-board-toolbar">',
      '<div><strong>' + communityTabLabel(tab) + '</strong><span>\uC81C\uBAA9\uC744 \uB204\uB974\uBA74 \uC0C1\uC138\uC640 \uB313\uAE00\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.</span></div>',
      '<button type="button" data-community-compose-toggle>' + (communityState.composing ? '\uC791\uC131 \uB2EB\uAE30' : '\uAE00\uC4F0\uAE30') + '</button>',
      '</div>',
      communityState.composing ? renderCommunityEditor(tab, null) : '',
      '<div class="community-free-list">',
      communityItems(tab).map(function (post) {
        return [
          '<button type="button" class="community-free-row" data-community-open-post="' + escapeHtml(post.id) + '">',
          renderCommunityThumb(post),
          '<div><strong>' + escapeHtml(post.title) + '</strong>',
          '<span>' + escapeHtml(post.author) + ' / ' + escapeHtml(post.date || '') + ' ' + escapeHtml(post.time || '') + ' / \uB313\uAE00 ' + ((post.comments || []).length) + '</span></div>',
          '</button>'
        ].join('')
      }).join(''),
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
        '<span>' + escapeHtml(post.author) + ' / ' + escapeHtml(post.date || '') + ' ' + escapeHtml(post.time || '') + '</span>',
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
          apiRequest('/community/posts/' + encodeURIComponent(post.serverId), { method: 'DELETE' }).then(removeLocal).catch(function () {
            showPatchToast('\uAE00 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
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
            showPatchToast('\uAC8C\uC2DC\uAE00 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
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
        }).then(applyComment).catch(function () {
          showPatchToast('\uB313\uAE00 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
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
          apiRequest('/community/comments/' + encodeURIComponent(comment.serverId), { method: 'DELETE' }).then(removeComment).catch(function () {
            showPatchToast('\uB313\uAE00 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
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
    divider.textContent = 'SSO 로그인'
    block.appendChild(divider)

    var providers = [
      { key: 'naver', label: '\uB124\uC774\uBC84' },
      { key: 'google', label: '\uAD6C\uAE00' },
      { key: 'kakao', label: '\uCE74\uCE74\uC624' }
    ]

    providers.forEach(function (provider) {
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'auth-sso-button ' + provider.key
      button.textContent = provider.label + ' \uB85C\uADF8\uC778'
      button.addEventListener('click', function () {
        showPatchToast(provider.label + ' SSO \uC5F0\uB3D9 \uD750\uB984\uC73C\uB85C \uC9C4\uC785\uD569\uB2C8\uB2E4.')
        submit.click()
      })
      block.appendChild(button)
    })

    submit.insertAdjacentElement('afterend', block)
  }

  function enhanceHomeDashboard() {
    var content = document.querySelector('.content-grid')
    if (!content) return

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
        list.innerHTML = [
          '<li><span></span><strong>09:00 \uC5C4\uB9C8 \uC0DD\uC77C</strong><small>\uC0DD\uC77C · \uAC00\uC871</small></li>',
          '<li><span></span><strong>14:30 \uC18C\uC544\uACFC \uC815\uAE30\uAC80\uC9C4</strong><small>\uBCD1\uC6D0 · \uCCAB\uC9F8</small></li>',
          '<li><span></span><strong>19:00 \uAC00\uC871 \uC800\uB141</strong><small>\uC77C\uBC18 · \uC678\uC2DD</small></li>'
        ].join('')
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
        panel.remove()
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
      inlineBack.remove()
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
      '<header><div><span>\uC721\uC544 \uAE30\uB85D</span><strong>\uC0C8 \uAE30\uB85D \uCD94\uAC00</strong></div><small>DB\uC5D0 \uBC14\uB85C \uC800\uC7A5\uB429\uB2C8\uB2E4.</small></header>',
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

  var API_BASE_URL = window.FAMILY_PLATFORM_API_BASE_URL || localStorage.getItem('family-platform-api-base-url') || 'http://localhost:8080/api'
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
    var token = localStorage.getItem(API_AUTH_TOKEN_KEY)
    var headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = 'Bearer ' + token
    return fetch(API_BASE_URL + path, Object.assign({
      headers: headers
    }, options || {})).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (message) {
          throw new Error(message || ('API ' + response.status))
        })
      }
      if (response.status === 204) return null
      return response.json()
    })
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
    if (!localStorage.getItem(API_AUTH_TOKEN_KEY)) return null
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
        return '<button type="button" class="schedule-notification-item" data-id="' + item.id + '">' +
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

  function loadScheduleNotifications(force) {
    if (!localStorage.getItem(API_AUTH_TOKEN_KEY)) return Promise.resolve([])
    if (!force && Date.now() - notificationState.loadedAt < 30000) {
      renderNotificationBell()
      return Promise.resolve(notificationState.items)
    }
    return apiRequest('/notifications?unreadOnly=true').then(function (items) {
      notificationState.items = Array.isArray(items) ? items : []
      notificationState.loadedAt = Date.now()
      renderNotificationBell()
      if (notificationState.items.length && !sessionStorage.getItem('family-platform-schedule-notification-seen')) {
        sessionStorage.setItem('family-platform-schedule-notification-seen', 'true')
        showPatchToast('\uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC788\uC2B5\uB2C8\uB2E4.')
      }
      return notificationState.items
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
    if (!localStorage.getItem(API_AUTH_TOKEN_KEY)) return Promise.resolve([])
    return getCurrentFamilyId().then(function (familyId) {
      return apiRequest('/schedules?familyId=' + encodeURIComponent(familyId) +
        '&startDate=' + encodeURIComponent(startDate) +
        '&endDate=' + encodeURIComponent(endDate))
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchLedgerEntries(startDate, endDate) {
    if (!localStorage.getItem(API_AUTH_TOKEN_KEY)) return Promise.resolve([])
    return getCurrentFamilyId().then(function (familyId) {
      return apiRequest('/ledger-entries?familyId=' + encodeURIComponent(familyId) +
        '&startDate=' + encodeURIComponent(startDate) +
        '&endDate=' + encodeURIComponent(endDate))
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function moneyText(value, type) {
    var amount = Number(value || 0).toLocaleString('ko-KR')
    return (type === 'income' ? '+' : '-') + amount + '\uC6D0'
  }

  function scheduleTimeText(item) {
    return item.scheduleTime ? String(item.scheduleTime).slice(0, 5) : '\uC2DC\uAC04 \uBBF8\uC815'
  }

  function renderHomeSchedulesFromApi() {
    var todayPanel = document.querySelector('.home-today-schedule')
    var list = todayPanel && todayPanel.querySelector('.task-list')
    if (!list || todayPanel.dataset.apiLoading === 'true') return
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

  function renderHomeLedgerFromApi() {
    var table = document.querySelector('.content-grid .panel.wide .ledger-table')
    if (!table || table.dataset.apiLoading === 'true') return
    table.dataset.apiLoading = 'true'

    var range = monthRangeFor(todayText())
    fetchLedgerEntries(range.start, range.end).then(function (items) {
      table.dataset.apiLoading = 'false'
      table.dataset.apiBacked = 'true'
      if (!items.length) return
      table.innerHTML = items.slice(0, 5).map(function (item) {
        return '<div class="ledger-row api-ledger-row" data-api-ledger-id="' + item.id + '">' +
          '<div><strong>' + escapeHtml(item.title) + '</strong><span>' +
          escapeHtml((item.transactionDate || '').replace(/-/g, '.') + ' · ' + (item.category || '-') + ' · ' + (item.memberName || '-')) +
          '</span></div><span>' + escapeHtml(item.paymentMethod || '-') + '</span><b class="' + escapeHtml(item.entryType || 'expense') + '">' +
          escapeHtml(moneyText(item.amount, item.entryType)) + '</b></div>'
      }).join('')
    })
  }

  function ensureServerSchedulePanel() {
    var card = document.querySelector('.schedule-list-card')
    if (!card || card.querySelector('.server-schedule-list')) return
    var list = document.createElement('div')
    list.className = 'server-schedule-list'
    list.innerHTML = '<div class="server-data-heading"><strong>DB 일정</strong><span>서버 저장 데이터</span></div><div class="server-data-list"></div>'
    card.appendChild(list)
  }

  function renderCalendarServerSchedules(force) {
    if (!document.querySelector('.family-calendar-panel')) return
    ensureServerSchedulePanel()
    var panel = document.querySelector('.server-schedule-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    var focused = apiDate(getFocusedDate ? getFocusedDate() : todayText())
    var mode = getActiveCalendarMode ? getActiveCalendarMode() : 'month'
    var range = mode === 'year'
      ? { start: focused.slice(0, 4) + '-01-01', end: focused.slice(0, 4) + '-12-31' }
      : (mode === 'day' ? { start: focused, end: focused } : monthRangeFor(focused))
    var key = range.start + ':' + range.end
    if (!force && panel.dataset.rangeKey === key) return
    panel.dataset.rangeKey = key
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uC77C\uC815\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchSchedules(range.start, range.end).then(function (items) {
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
    if (!localStorage.getItem(API_AUTH_TOKEN_KEY)) return Promise.resolve([])
    return getCurrentFamilyId().then(function (familyId) {
      return apiRequest('/trips?familyId=' + encodeURIComponent(familyId))
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchTripRecords(tripId) {
    if (!tripId || !localStorage.getItem(API_AUTH_TOKEN_KEY)) return Promise.resolve([])
    return apiRequest('/trips/' + encodeURIComponent(tripId) + '/records').then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchDiaries(startDate, endDate) {
    if (!localStorage.getItem(API_AUTH_TOKEN_KEY)) return Promise.resolve([])
    return getCurrentFamilyId().then(function (familyId) {
      return apiRequest('/diaries?familyId=' + encodeURIComponent(familyId) +
        '&startDate=' + encodeURIComponent(startDate) +
        '&endDate=' + encodeURIComponent(endDate))
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchBabies() {
    if (!localStorage.getItem(API_AUTH_TOKEN_KEY)) return Promise.resolve([])
    return getCurrentFamilyId().then(function (familyId) {
      return apiRequest('/babies?familyId=' + encodeURIComponent(familyId))
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchBabyRecords(babyId, startDate, endDate) {
    if (!babyId || !localStorage.getItem(API_AUTH_TOKEN_KEY)) return Promise.resolve([])
    return apiRequest('/babies/' + encodeURIComponent(babyId) + '/records' +
      '?startDate=' + encodeURIComponent(startDate) +
      '&endDate=' + encodeURIComponent(endDate)).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function ensureServerTravelPanel() {
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
    if (!document.querySelector('.baby-card') && !document.querySelector('.baby-record-list') && !document.querySelector('.baby-record-row')) return
    if (document.querySelector('.server-baby-list')) return
    var anchor = document.querySelector('.baby-record-list') || document.querySelector('.baby-card')
    if (!anchor || !anchor.parentElement) return
    var panel = document.createElement('section')
    panel.className = 'panel server-baby-list server-domain-panel'
    panel.innerHTML = '<header class="panel-header"><h2>DB 육아 기록</h2><button type="button">서버 조회</button></header><div class="server-data-list"></div>'
    anchor.parentElement.insertBefore(panel, anchor.nextSibling)
  }

  function renderBabyServerEntries(force) {
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

  function refreshServerDataViews(force) {
    if (!localStorage.getItem(API_AUTH_TOKEN_KEY)) return
    renderHomeSchedulesFromApi()
    renderHomeLedgerFromApi()
    renderCalendarServerSchedules(force)
    renderLedgerServerEntries(force)
    renderTravelServerEntries(force)
    renderDiaryServerEntries(force)
    renderBabyServerEntries(force)
  }

  function getCurrentFamilyId() {
    var cachedId = Number(localStorage.getItem(API_FAMILY_ID_KEY) || '')
    if (Number.isFinite(cachedId) && cachedId > 0) return Promise.resolve(cachedId)

    return apiRequest('/families').then(function (families) {
      var family = Array.isArray(families) ? families[0] : null
      if (!family || !family.id) throw new Error('No family group available')
      localStorage.setItem(API_FAMILY_ID_KEY, String(family.id))
      return family.id
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

  function firstInputValue(root) {
    var input = root.querySelector('input')
    return input ? String(input.value || '').trim() : ''
  }

  function syncScheduleForm(form) {
    window.setTimeout(function () {
      var title = getInputValueByLabel(form, '\uC77C\uC815\uBA85') || firstInputValue(form)
      if (!title) return

      var timeValue = getInputValueByLabel(form, '\uC2DC\uAC04')
      if (timeValue && !/^\d{2}:\d{2}$/.test(timeValue)) timeValue = null

      queueApiSync({
        type: 'createSchedule',
        payload: {
          title: title,
          calendarBasis: normalizeScheduleBasis(getCustomSelectValue('\uAE30\uC900')),
          scheduleDate: getDatePickerValue(form, '\uB0A0\uC9DC'),
          scheduleTime: timeValue || null,
          category: getCustomSelectValue('\uAD6C\uBD84') || '\uC77C\uC815',
          memberName: getCustomSelectValue('\uAC00\uC871') || null,
          repeatRule: normalizeScheduleRepeat(getCustomSelectValue('\uBC18\uBCF5')),
          memo: getInputValueByLabel(form, '\uBA54\uBAA8') || ''
        }
      })
      flushApiQueue()
    }, 450)
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
      if (remaining.length !== queue.length) refreshServerDataViews(true)
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
      if (!title || !location) return

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
            category: getCustomSelectValue('비용 구분') || '기타',
            amount: parseAmountValue(getFieldValue(form, '[data-field="travel-amount"]')),
            note: getFieldValue(form, 'textarea'),
            location: location,
            latitude: 0,
            longitude: 0,
            recordDate: getDatePickerValue(form, '날짜'),
            recordTime: getFieldValue(form, '[data-field="travel-record-time"]') || null,
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
        showPatchToast('\uC721\uC544 \uAE30\uB85D \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
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
    if (travelForm) syncTravelForm(travelForm)
  }, true)

  document.addEventListener('submit', function (event) {
    var ledgerForm = event.target && event.target.closest && event.target.closest('.ledger-form')
    if (ledgerForm) syncLedgerForm(ledgerForm)
  }, true)

  document.addEventListener('submit', function (event) {
    var diaryForm = event.target && event.target.closest && event.target.closest('.diary-form')
    if (diaryForm) syncDiaryForm(diaryForm)
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
  window.setInterval(function () {
    loadScheduleNotifications(true)
  }, 60000)
  window.setInterval(function () {
    refreshServerDataViews(true)
  }, 120000)

  document.addEventListener('submit', function (event) {
    var form = event.target && event.target.closest && event.target.closest('.schedule-form-card')
    if (!form) return
    syncScheduleForm(form)
    var beforeRows = document.querySelectorAll('.schedule-row').length
    window.setTimeout(function () {
      var afterRows = document.querySelectorAll('.schedule-row').length
      var titleInput = form.querySelector('input')
      if (afterRows > beforeRows) {
        showPatchToast('\uC77C\uC815\uC774 \uCD94\uAC00\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
        var date = getScheduleFormVisibleDate() || getFocusedDate()
        if (date) {
          updateSelectedDayPanel(date)
          updateJumpInput(date)
        }
      } else if (titleInput && !titleInput.value.trim()) {
        titleInput.focus()
      }
    }, 220)
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
