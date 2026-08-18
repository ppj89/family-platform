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

