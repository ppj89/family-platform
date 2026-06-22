  function renderTravelPageFromApi(force) {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    var panel = document.querySelector('.trip-manager')
    var headerAction = document.querySelector('.panel-header .passive-header-chip, .panel.wide.full-span .panel-header button')
    if (!panel && !headerAction) return
    if (!force && panel && panel.dataset.apiBacked === 'true') return
    if (panel) panel.dataset.apiBacked = 'true'
    normalizeTravelListWorkspace()
    fetchTrips().then(function (trips) {
      if (headerAction) headerAction.textContent = Number(trips.length || 0).toLocaleString('ko-KR') + '\uAC1C'
      if (panel) renderApiTripList(panel, trips)
      normalizeTravelListWorkspace()
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
      return '<article class="trip-list-card api-trip-card" data-api-trip-id="' + escapeHtml(trip.id) + '" data-api-trip-title="' + escapeHtml(trip.title || '\uC5EC\uD589') + '" data-api-trip-start="' + escapeHtml(trip.startDate || '') + '" data-api-trip-end="' + escapeHtml(trip.endDate || trip.startDate || '') + '">' +
        '<button type="button" class="trip-card-main" data-api-trip-open="' + escapeHtml(trip.id) + '">' +
        '<div><strong>' + escapeHtml(trip.title || '\uC5EC\uD589') + '</strong>' +
        '<span>' + escapeHtml(tripPeriodText(trip)) + '</span></div>' +
        '<small>\uAE30\uB85D \uCD94\uAC00</small>' +
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
        renderTravelPageFromApi(true)
      }).catch(function (error) {
        showPatchToast(apiActionErrorMessage(error, '\uC5EC\uD589 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
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

