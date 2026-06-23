  function renderTravelPageFromApi(force) {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    var panel = document.querySelector('.trip-manager')
    var headerAction = document.querySelector('.panel-header .passive-header-chip, .panel.wide.full-span .panel-header button')
    if (!panel && !headerAction) return
    var hasApiDetail = panel && !!panel.querySelector('.api-trip-detail')
    var shouldForceList = !!window.__familyTravelForceListMode || !hasApiDetail
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
      '<header class="api-trip-detail-header"><div><h3>' + escapeHtml(trip.title || '\uC5EC\uD589') + '</h3><span>' + escapeHtml(tripPeriodText(trip)) + '</span></div><button type="button" data-api-trip-back>\uBAA9\uB85D</button></header>',
      '<div class="api-trip-detail-shell">',
      '<section class="api-trip-detail-main">',
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
    var delta = 0.01
    var bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].map(function (value) { return value.toFixed(6) }).join('%2C')
    var marker = latitude.toFixed(6) + '%2C' + longitude.toFixed(6)
    map.innerHTML = '<iframe title="' + escapeHtml(label || '\uC704\uCE58') + '" src="https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&layer=mapnik&marker=' + marker + '" loading="lazy" referrerpolicy="no-referrer"></iframe>'
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
    window.__familyTravelForceListMode = true
    localStorage.removeItem(API_TRIP_ID_KEY)
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
  }

