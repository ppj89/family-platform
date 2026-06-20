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

