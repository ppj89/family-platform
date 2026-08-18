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
