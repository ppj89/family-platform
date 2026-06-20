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

  function openApiTripCard(card) {
    if (!card || !pageHeadingIs('\uC5EC\uD589')) return
    var panel = card.closest('.trip-manager') || document.querySelector('.trip-manager')
    if (!panel) return
    var trip = {
      id: card.dataset.apiTripId || '',
      title: getCleanText(card.querySelector('strong')) || '\uC5EC\uD589',
      startDate: '',
      endDate: ''
    }
    var period = getCleanText(card.querySelector('span'))
    if (period.indexOf('~') >= 0) {
      var parts = period.split('~')
      trip.startDate = String(parts[0] || '').trim()
      trip.endDate = String(parts[1] || '').trim()
    } else {
      trip.startDate = period
      trip.endDate = period
    }
    if (trip.id) openApiTripDetail(panel, trip)
  }

  document.addEventListener('click', function (event) {
    var card = event.target && event.target.closest && event.target.closest('.api-trip-card')
    if (!card || !pageHeadingIs('\uC5EC\uD589')) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    openApiTripCard(card)
  }, true)

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

