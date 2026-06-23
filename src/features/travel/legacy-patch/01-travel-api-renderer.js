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
    var panel = document.querySelector('.trip-manager')
    if (panel && panel.querySelector('.api-trip-detail') && Date.now() - Number(window.__familyTravelDetailOpenedAt || 0) < 2500) return
    window.__familyTravelForceListMode = true
    try { localStorage.removeItem(API_TRIP_ID_KEY) } catch {}
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
    list.innerHTML = renderTravelTripListCards(trips)
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
    var recordMapButton = event.target.closest('[data-api-travel-record-map]')
    var recordEditButton = event.target.closest('[data-api-travel-record-edit]')
    var recordDeleteButton = event.target.closest('[data-api-travel-record-delete]')
    if (recordMapButton || recordEditButton || recordDeleteButton) return
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

  document.addEventListener('click', function (event) {
    if (!event.target || !event.target.closest || !pageHeadingIs('\uC5EC\uD589')) return
    var button = event.target.closest('[data-api-travel-record-map], [data-api-travel-record-edit], [data-api-travel-record-delete]')
    if (!button) return
    var detail = button.closest('.api-trip-detail')
    if (!detail) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    fetchTripRecords(localStorage.getItem(API_TRIP_ID_KEY)).then(function (records) {
      var recordId = button.dataset.apiTravelRecordMap || button.dataset.apiTravelRecordEdit || button.dataset.apiTravelRecordDelete
      var record = records.find(function (item) { return String(item.id) === String(recordId) })
      if (button.dataset.apiTravelRecordMap && record) {
        var map = detail.querySelector('[data-trip-route-map]')
        if (map && hasTravelRecordCoordinates(record)) {
          renderApiLeafletMap(map, [record], { zoom: 15 })
          renderApiTripRouteOverlay(map, sortedTravelRecords(records).filter(function (item) {
            return hasTravelRecordCoordinates(item) || String(item.location || '').trim()
          }))
        }
        return
      }
      if (button.dataset.apiTravelRecordEdit && record) {
        fillApiTravelRecordForm(detail, record)
        return
      }
      if (button.dataset.apiTravelRecordDelete && recordId) {
        deleteApiTravelRecord(detail, recordId)
      }
    })
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
    window.__familyTravelDetailOpenedAt = Date.now()
    localStorage.setItem(API_TRIP_ID_KEY, String(trip.id))
    setTripDetailMode(panel, true)
    var detail = panel.querySelector('.api-trip-detail')
    if (!detail) {
      detail = document.createElement('section')
      detail.className = 'api-trip-detail'
      panel.appendChild(detail)
    }
    detail.innerHTML = renderTravelTripDetailShell(trip)
    var back = detail.querySelector('[data-api-trip-back]')
    if (back) back.addEventListener('click', function () {
      localStorage.removeItem(API_TRIP_ID_KEY)
      detail.remove()
      setTripDetailMode(panel, false)
    })
    normalizeTravelEntryForm()
    initApiTravelRecordControls(detail)
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
    renderApiLocationDefault(map)
    input.addEventListener('family-platform-location-selected', function (event) {
      var data = event.detail || {}
      renderApiLocationPreview(map, data.latitude, data.longitude, data.label || input.value)
    })
  }

  function initApiTravelRecordControls(detail) {
    var form = detail && detail.querySelector('.api-travel-record-form')
    if (!form) return
    bindApiTravelCategorySelect(form)
    bindApiTravelRecordDatePicker(form)
    bindApiTravelTimeInput(form)
  }

  function resetApiTravelRecordForm(form, nextOrder) {
    if (!form) return
    delete form.dataset.apiTravelRecordEditId
    var title = form.querySelector('[data-field="travel-title"]')
    var location = form.querySelector('[data-field="travel-location"]')
    var amount = form.querySelector('[data-field="travel-amount"]')
    var note = form.querySelector('textarea')
    var order = form.querySelector('[data-field="travel-sort-order"]')
    var submit = form.querySelector('.submit-action')
    if (title) setInputValue(title, '')
    if (location) setInputValue(location, '')
    if (amount) setInputValue(amount, '')
    if (note) {
      note.value = ''
      note.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (order) setInputValue(order, String(nextOrder || 1))
    if (submit) submit.textContent = '\uAE30\uB85D \uCD94\uAC00'
    var map = form.querySelector('[data-travel-location-map]')
    if (map) renderApiLocationDefault(map)
  }

  function fillApiTravelRecordForm(detail, record) {
    var form = detail && detail.querySelector('.api-travel-record-form')
    if (!form || !record) return
    form.dataset.apiTravelRecordEditId = String(record.id || '')
    setInputValue(form.querySelector('[data-field="travel-sort-order"]'), String(record.sortOrder || record.order || record.sequence || ''))
    setInputValue(form.querySelector('[data-field="travel-title"]'), record.title || '')
    setInputValue(form.querySelector('[data-field="travel-location"]'), record.location || '')
    setInputValue(form.querySelector('[data-field="travel-amount"]'), record.amount ? Number(record.amount).toLocaleString('ko-KR') : '')
    var note = form.querySelector('textarea')
    if (note) {
      note.value = record.note || ''
      note.dispatchEvent(new Event('input', { bubbles: true }))
    }
    setInputValue(form.querySelector('[data-field="travel-record-date"]'), record.recordDate || todayText())
    setInputValue(form.querySelector('[data-field="travel-record-time"]'), formatTravelRecordTime(record.recordTime) || currentTimeText())
    var dateText = form.querySelector('[data-api-travel-record-date-trigger] span')
    if (dateText) dateText.textContent = travelDateDisplay(record.recordDate || todayText())
    var categoryHidden = form.querySelector('[data-field="travel-category"]')
    var categoryText = form.querySelector('[data-api-travel-category-trigger] span')
    if (categoryHidden) setInputValue(categoryHidden, record.category || '\uAD50\uD1B5')
    if (categoryText) categoryText.textContent = record.category || '\uAD50\uD1B5'
    var submit = form.querySelector('.submit-action')
    if (submit) submit.textContent = '\uC218\uC815'
    var map = form.querySelector('[data-travel-location-map]')
    if (map && hasTravelRecordCoordinates(record)) renderApiLocationPreview(map, record.latitude, record.longitude, record.title || record.location)
    var first = form.querySelector('[data-field="travel-title"]')
    if (first) first.focus()
  }

  function bindApiTravelCategorySelect(form) {
    var select = form && form.querySelector('[data-api-travel-category-select]')
    if (!select || select.dataset.ready === 'true') return
    select.dataset.ready = 'true'
    var hidden = form.querySelector('[data-field="travel-category"]')
    var trigger = select.querySelector('[data-api-travel-category-trigger]')
    var label = trigger && trigger.querySelector('span')
    var list = select.querySelector('.custom-select-list')
    function close() {
      select.classList.remove('open')
      if (trigger) trigger.classList.remove('open')
      if (list) list.hidden = true
    }
    function open() {
      document.querySelectorAll('.custom-select.open').forEach(function (item) {
        if (item !== select) {
          item.classList.remove('open')
          var itemTrigger = item.querySelector('.custom-select-trigger')
          var itemList = item.querySelector('.custom-select-list')
          if (itemTrigger) itemTrigger.classList.remove('open')
          if (itemList) itemList.hidden = true
        }
      })
      select.classList.add('open')
      if (trigger) trigger.classList.add('open')
      if (list) list.hidden = false
    }
    if (trigger) {
      trigger.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (select.classList.contains('open')) close()
        else open()
      })
    }
    select.querySelectorAll('[data-api-travel-category-value]').forEach(function (button) {
      button.addEventListener('pointerdown', function (event) {
        event.preventDefault()
        event.stopPropagation()
      })
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        var value = button.dataset.apiTravelCategoryValue || ''
        if (hidden) setInputValue(hidden, value)
        if (label) label.textContent = value
        select.querySelectorAll('[data-api-travel-category-value]').forEach(function (item) {
          item.classList.toggle('selected', item === button)
        })
        close()
      })
    })
    document.addEventListener('pointerdown', function (event) {
      if (!select.contains(event.target)) close()
    })
  }

  function bindApiTravelRecordDatePicker(form) {
    var field = form && form.querySelector('.travel-record-date-field')
    var input = field && field.querySelector('[data-field="travel-record-date"]')
    var trigger = field && field.querySelector('[data-api-travel-record-date-trigger]')
    if (!field || !input || !trigger || trigger.dataset.ready === 'true') return
    trigger.dataset.ready = 'true'
    trigger.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      toggleApiTravelDatePopover(field, input, trigger)
    })
    document.addEventListener('pointerdown', function (event) {
      if (field.contains(event.target)) return
      closeApiTravelDatePopover(field)
    })
  }

  function closeApiTravelDatePopover(field) {
    if (!field) return
    field.querySelectorAll('.travel-record-date-popover').forEach(function (popover) {
      popover.remove()
    })
  }

  function toggleApiTravelDatePopover(field, input, trigger) {
    var old = field.querySelector('.travel-record-date-popover')
    if (old) {
      old.remove()
      return
    }
    openApiTravelDatePopover(field, input, trigger)
  }

  function travelDateFromValue(value) {
    var parsed = parseApiDate(value) || todayText()
    var parts = parsed.split('-').map(Number)
    return new Date(parts[0], parts[1] - 1, parts[2])
  }

  function travelDateValue(date) {
    var year = date.getFullYear()
    var month = String(date.getMonth() + 1).padStart(2, '0')
    var day = String(date.getDate()).padStart(2, '0')
    return year + '-' + month + '-' + day
  }

  function travelDateDisplay(value) {
    return String(value || todayText()).replace(/-/g, '.')
  }

  function openApiTravelDatePopover(field, input, trigger) {
    closeApiTravelDatePopover(field)
    var selectedValue = parseApiDate(input.value) || todayText()
    var viewDate = travelDateFromValue(selectedValue)
    var mode = 'day'
    var popover = document.createElement('div')
    popover.className = 'calendar-popover travel-record-date-popover'
    field.appendChild(popover)

    function setDateValue(value) {
      setInputValue(input, value)
      var text = trigger.querySelector('span')
      if (text) text.textContent = travelDateDisplay(value)
      closeApiTravelDatePopover(field)
    }

    function render() {
      var selectedDate = travelDateFromValue(selectedValue)
      var year = viewDate.getFullYear()
      var month = viewDate.getMonth()
      var title = mode === 'day' ? year + '\uB144 ' + (month + 1) + '\uC6D4' : mode === 'month' ? year + '\uB144' : (Math.floor(year / 12) * 12) + ' - ' + (Math.floor(year / 12) * 12 + 11)
      popover.innerHTML = '<div class="calendar-header">' +
        '<button type="button" data-travel-date-prev aria-label="\uC774\uC804">&lt;</button>' +
        '<button type="button" class="calendar-title-button" data-travel-date-title><strong>' + escapeHtml(title) + '</strong></button>' +
        '<button type="button" data-travel-date-next aria-label="\uB2E4\uC74C">&gt;</button>' +
        '</div><div data-travel-date-body></div><div class="calendar-today-row"><button type="button" data-travel-date-today>\uC624\uB298</button></div>'
      var body = popover.querySelector('[data-travel-date-body]')
      if (mode === 'day') renderDayBody(body, selectedDate, year, month)
      else if (mode === 'month') renderMonthBody(body, selectedDate, year)
      else renderYearBody(body, selectedDate, year)
    }

    function renderDayBody(body, selectedDate, year, month) {
      var weekdays = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0']
      var first = new Date(year, month, 1)
      var lastDay = new Date(year, month + 1, 0).getDate()
      var html = '<div class="calendar-weekdays">' + weekdays.map(function (day) { return '<span>' + day + '</span>' }).join('') + '</div><div class="calendar-day-grid">'
      for (var i = 0; i < first.getDay(); i++) html += '<span class="calendar-empty"></span>'
      for (var day = 1; day <= lastDay; day++) {
        var date = new Date(year, month, day)
        var value = travelDateValue(date)
        var classes = []
        if (value === travelDateValue(selectedDate)) classes.push('selected')
        if (date.getDay() === 0) classes.push('holiday')
        if (date.getDay() === 6) classes.push('saturday')
        html += '<button type="button" class="' + classes.join(' ') + '" data-travel-date-value="' + value + '">' + day + '</button>'
      }
      html += '</div>'
      body.innerHTML = html
    }

    function renderMonthBody(body, selectedDate, year) {
      var html = '<div class="calendar-month-grid">'
      for (var month = 0; month < 12; month++) {
        var classes = selectedDate.getFullYear() === year && selectedDate.getMonth() === month ? 'selected' : ''
        html += '<button type="button" class="' + classes + '" data-travel-date-month="' + month + '">' + (month + 1) + '\uC6D4</button>'
      }
      body.innerHTML = html + '</div>'
    }

    function renderYearBody(body, selectedDate, year) {
      var start = Math.floor(year / 12) * 12
      var html = '<div class="calendar-year-grid">'
      for (var i = 0; i < 12; i++) {
        var itemYear = start + i
        var classes = selectedDate.getFullYear() === itemYear ? 'selected' : ''
        html += '<button type="button" class="' + classes + '" data-travel-date-year="' + itemYear + '">' + itemYear + '</button>'
      }
      body.innerHTML = html + '</div>'
    }

    popover.addEventListener('click', function (event) {
      event.stopPropagation()
      var prev = event.target.closest('[data-travel-date-prev]')
      var next = event.target.closest('[data-travel-date-next]')
      var title = event.target.closest('[data-travel-date-title]')
      var day = event.target.closest('[data-travel-date-value]')
      var month = event.target.closest('[data-travel-date-month]')
      var year = event.target.closest('[data-travel-date-year]')
      var today = event.target.closest('[data-travel-date-today]')
      if (prev) {
        if (mode === 'day') viewDate.setMonth(viewDate.getMonth() - 1)
        else if (mode === 'month') viewDate.setFullYear(viewDate.getFullYear() - 1)
        else viewDate.setFullYear(viewDate.getFullYear() - 12)
        render()
      } else if (next) {
        if (mode === 'day') viewDate.setMonth(viewDate.getMonth() + 1)
        else if (mode === 'month') viewDate.setFullYear(viewDate.getFullYear() + 1)
        else viewDate.setFullYear(viewDate.getFullYear() + 12)
        render()
      } else if (title) {
        mode = mode === 'day' ? 'month' : mode === 'month' ? 'year' : 'day'
        render()
      } else if (day) {
        selectedValue = day.dataset.travelDateValue
        setDateValue(selectedValue)
      } else if (month) {
        viewDate.setMonth(Number(month.dataset.travelDateMonth))
        mode = 'day'
        render()
      } else if (year) {
        viewDate.setFullYear(Number(year.dataset.travelDateYear))
        mode = 'month'
        render()
      } else if (today) {
        setDateValue(todayText())
      }
    })
    render()
  }

  function bindApiTravelTimeInput(form) {
    var input = form && form.querySelector('[data-field="travel-record-time"]')
    if (!input || input.dataset.ready === 'true') return
    input.dataset.ready = 'true'
    input.addEventListener('input', function () {
      var digits = String(input.value || '').replace(/\D/g, '').slice(0, 4)
      if (digits.length >= 2) {
        var hour = Math.min(Number(digits.slice(0, 2)) || 0, 23)
        var minuteText = digits.slice(2)
        if (minuteText.length >= 2) minuteText = String(Math.min(Number(minuteText) || 0, 59)).padStart(2, '0')
        input.value = String(hour).padStart(2, '0') + (minuteText ? ':' + minuteText : '')
      } else {
        input.value = digits
      }
    })
    input.addEventListener('blur', function () {
      var match = String(input.value || '').match(/^(\d{1,2})(?::?(\d{1,2}))?$/)
      if (!match) {
        input.value = currentTimeText()
        return
      }
      var hour = Math.min(Number(match[1]) || 0, 23)
      var minute = Math.min(Number(match[2] || 0) || 0, 59)
      input.value = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0')
    })
  }

  function renderApiGoogleMap(map, label, query, zoom) {
    if (!map) return
    var coords = parseTravelMapQuery(query)
    if (coords) {
      renderApiLeafletMap(map, [{ latitude: coords.latitude, longitude: coords.longitude, title: label || '\uC704\uCE58' }], { zoom: zoom || 12 })
      return
    }
    renderApiLeafletMap(map, [], { zoom: zoom || 7 })
  }

  function parseTravelMapQuery(query) {
    var match = String(query || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
    if (!match) return null
    var latitude = Number(match[1])
    var longitude = Number(match[2])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return { latitude: latitude, longitude: longitude }
  }

  function renderApiLeafletMap(mapNode, records, options) {
    options = options || {}
    if (!mapNode) return
    mapNode.innerHTML = ''
    try { delete mapNode._leaflet_id } catch {}
    if (!window.L || typeof window.L.map !== 'function') {
      mapNode.innerHTML = '<span>\uC9C0\uB3C4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</span>'
      return
    }
    var points = (Array.isArray(records) ? records : []).filter(hasTravelRecordCoordinates)
    var map = window.L.map(mapNode, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)
    if (!points.length) {
      map.setView([36.5, 127.8], options.zoom || 7)
      window.setTimeout(function () { map.invalidateSize() }, 120)
      return
    }
    var latLngs = points.map(function (record, index) {
      var latLng = [Number(record.latitude), Number(record.longitude)]
      var marker = window.L.marker(latLng, {
        title: record.title || record.location || '\uC5EC\uD589 \uAE30\uB85D',
        icon: window.L.divIcon({
          className: 'travel-route-number-marker',
          html: '<span>' + escapeHtml(travelRouteNumber(record, index)) + '</span>',
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        })
      }).addTo(map)
      marker.bindPopup('<strong>' + escapeHtml(record.title || '\uC5EC\uD589 \uAE30\uB85D') + '</strong>' + (record.location ? '<br />' + escapeHtml(record.location) : ''))
      return latLng
    })
    if (latLngs.length > 1) {
      window.L.polyline(latLngs, { color: '#3182f6', weight: 4, opacity: 0.82 }).addTo(map)
      map.fitBounds(window.L.latLngBounds(latLngs), { padding: [28, 28] })
    } else {
      map.setView(latLngs[0], options.zoom || 15)
    }
    window.setTimeout(function () { map.invalidateSize() }, 120)
  }

  function renderApiLocationDefault(map) {
    renderApiGoogleMap(map, '\uC704\uCE58 \uC9C0\uB3C4', '\uB300\uD55C\uBBFC\uAD6D', 7)
  }

  function renderApiLocationPreview(map, latitude, longitude, label) {
    latitude = Number(latitude)
    longitude = Number(longitude)
    if (!map || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === 0 || longitude === 0) return
    renderApiGoogleMap(map, label || '\uC704\uCE58', latitude + ',' + longitude, 15)
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
      list.innerHTML = renderTravelRecordCards(records)
      bindApiTravelRecordRows(detail, records)
    })
  }

  function bindApiTravelRecordRows(detail, records) {
    var list = detail && detail.querySelector('.api-trip-record-list')
    if (!list) return
    list.querySelectorAll('[data-api-travel-record-map]').forEach(function (button) {
      button.addEventListener('click', function () {
        var record = records.find(function (item) { return String(item.id) === String(button.dataset.apiTravelRecordMap) })
        var map = detail.querySelector('[data-trip-route-map]')
        if (record && map && hasTravelRecordCoordinates(record)) {
          renderApiLeafletMap(map, [record], { zoom: 15 })
          renderApiTripRouteOverlay(map, sortedTravelRecords(records).filter(function (item) {
            return hasTravelRecordCoordinates(item) || String(item.location || '').trim()
          }))
        }
      })
    })
    list.querySelectorAll('[data-api-travel-record-edit]').forEach(function (button) {
      button.addEventListener('click', function () {
        var record = records.find(function (item) { return String(item.id) === String(button.dataset.apiTravelRecordEdit) })
        if (record) fillApiTravelRecordForm(detail, record)
      })
    })
    list.querySelectorAll('[data-api-travel-record-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        var recordId = button.dataset.apiTravelRecordDelete
        deleteApiTravelRecord(detail, recordId)
      })
    })
  }

  function deleteApiTravelRecord(detail, recordId) {
    if (!recordId) return
    showPatchConfirm('\uC5EC\uD589 \uAE30\uB85D\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
      apiRequest('/travel-records/' + encodeURIComponent(recordId), { method: 'DELETE' }).then(function () {
        showPatchToast('\uC5EC\uD589 \uAE30\uB85D\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
        renderApiTripRecords(detail, localStorage.getItem(API_TRIP_ID_KEY))
      }).catch(function (error) {
        showPatchToast(apiActionErrorMessage(error, '\uC5EC\uD589 \uAE30\uB85D \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      })
    })
  }

  function sortedTravelRecords(records) {
    return (Array.isArray(records) ? records.slice() : []).sort(function (a, b) {
      var ao = Number(a && (a.sortOrder || a.order || a.sequence))
      var bo = Number(b && (b.sortOrder || b.order || b.sequence))
      if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo
      if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1
      if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1
      return String(a && a.recordDate || '').localeCompare(String(b && b.recordDate || '')) ||
        String(a && a.recordTime || '').localeCompare(String(b && b.recordTime || ''))
    })
  }

  function travelRecordOrder(record, index) {
    var value = Number(record && (record.sortOrder || record.order || record.sequence))
    if (!Number.isFinite(value) || value <= 0) value = index + 1
    return String(value).padStart(2, '0')
  }

  function travelRouteNumber(record, index) {
    var value = Number(record && (record.sortOrder || record.order || record.sequence))
    if (!Number.isFinite(value) || value <= 0) value = index + 1
    return String(value)
  }

  function formatTravelRecordTime(value) {
    var text = String(value || '').trim()
    if (!text) return ''
    var match = text.match(/(\d{1,2}):(\d{2})/)
    if (!match) return text
    return String(Math.min(Number(match[1]) || 0, 23)).padStart(2, '0') + ':' + match[2]
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
    var candidates = sortedTravelRecords(records).filter(function (record) {
      return hasTravelRecordCoordinates(record) || String(record.location || '').trim()
    })
    if (!candidates.length) {
      renderApiGoogleMap(map, '\uC5EC\uD589 \uACBD\uB85C \uC9C0\uB3C4', '\uB300\uD55C\uBBFC\uAD6D', 7)
      if (empty) empty.hidden = false
      return
    }
    var withCoordinates = candidates.filter(hasTravelRecordCoordinates)
    if (withCoordinates.length) renderApiLeafletMap(map, withCoordinates, { zoom: 13 })
    else renderApiGoogleMap(map, '\uC5EC\uD589 \uACBD\uB85C \uC9C0\uB3C4', '\uB300\uD55C\uBBFC\uAD6D', 7)
    renderApiTripRouteOverlay(map, candidates)
    if (empty) empty.hidden = true
  }

  function renderApiTripRouteOverlay(map, records) {
    if (!map) return
    var sequence = renderTravelRouteSequence(records)
    if (sequence) map.insertAdjacentHTML('beforeend', sequence)
  }

  function hasTravelRecordCoordinates(record) {
    var latitude = Number(record && record.latitude)
    var longitude = Number(record && record.longitude)
    return Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)
  }
