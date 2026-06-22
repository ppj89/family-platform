  function ensureDefaultApiTrip() {
    var cachedId = Number(localStorage.getItem(API_TRIP_ID_KEY) || '')
    if (Number.isFinite(cachedId) && cachedId > 0) return Promise.resolve(cachedId)

    return getReadableFamilyId().then(function (familyId) {
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

  function parseTravelDate(value) {
    var match = String(value || '').match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/)
    if (!match) return ''
    return [match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0')].join('-')
  }

  function parseTravelPeriod(value) {
    var dates = String(value || '').match(/\d{4}[.\-/\s]+\d{1,2}[.\-/\s]+\d{1,2}/g) || []
    var startDate = parseTravelDate(dates[0])
    var endDate = parseTravelDate(dates[1]) || startDate
    return { startDate: startDate, endDate: endDate }
  }

  function getCurrentLegacyTravelContext() {
    if (!pageHeadingIs('\uC5EC\uD589')) return null
    var manager = document.querySelector('.trip-manager')
    if (!manager || manager.classList.contains('list-mode')) return null
    var panel = manager.closest('.panel') || manager.closest('article') || manager
    return { manager: manager, panel: panel }
  }

  function getCurrentLegacyTravelTripSnapshot() {
    var context = getCurrentLegacyTravelContext()
    if (!context) return null
    var headerTitle = context.panel.querySelector('.panel-header h2, .panel-header h3, .panel-header strong')
    var title = getCleanText(headerTitle)
    if (!title || title === '\uC5EC\uD589' || title === '\uC5EC\uD589 \uAE30\uB85D \uCD94\uAC00') return null
    var periodText = getCleanText(context.panel.querySelector('.trip-period-label'))
    var period = parseTravelPeriod(periodText)
    return {
      title: title,
      startDate: period.startDate || todayText(),
      endDate: period.endDate || period.startDate || todayText()
    }
  }

  function sameTravelTrip(trip, snapshot) {
    if (!trip || !snapshot) return false
    if (String(trip.title || '').trim() !== String(snapshot.title || '').trim()) return false
    var startDate = parseTravelDate(trip.startDate) || String(trip.startDate || '')
    var endDate = parseTravelDate(trip.endDate) || String(trip.endDate || startDate)
    return startDate === snapshot.startDate && endDate === snapshot.endDate
  }

  function ensureApiTripForSnapshot(snapshot) {
    if (!snapshot || !snapshot.title) return ensureDefaultApiTrip()
    return fetchTrips().then(function (trips) {
      var found = trips.find(function (trip) {
        return sameTravelTrip(trip, snapshot)
      })
      if (found && found.id) {
        localStorage.setItem(API_TRIP_ID_KEY, String(found.id))
        return found.id
      }
      return getReadableFamilyId().then(function (familyId) {
        return postJson('/trips?familyId=' + encodeURIComponent(familyId), {
          title: snapshot.title,
          startDate: snapshot.startDate || todayText(),
          endDate: snapshot.endDate || snapshot.startDate || todayText(),
          description: snapshot.startDate === snapshot.endDate ? snapshot.startDate : (snapshot.startDate + ' ~ ' + snapshot.endDate)
        })
      }).then(function (trip) {
        if (trip && trip.id) {
          localStorage.setItem(API_TRIP_ID_KEY, String(trip.id))
          return trip.id
        }
        return ensureDefaultApiTrip()
      })
    })
  }

  function resolveTravelTaskTripId(task) {
    var directId = Number(task && task.tripId)
    if (Number.isFinite(directId) && directId > 0) return Promise.resolve(directId)
    if (task && task.tripSnapshot) return ensureApiTripForSnapshot(task.tripSnapshot)
    var current = getCurrentLegacyTravelTripSnapshot()
    return current ? ensureApiTripForSnapshot(current) : ensureDefaultApiTrip()
  }

  function legacyTravelRecordKey(title, date, time) {
    return [String(title || '').trim(), String(date || '').trim(), String(time || '').trim()].join('|')
  }

  function readLegacyTravelRowKey(row) {
    var title = getCleanText(row.querySelector('.travel-record-head strong, .travel-main strong'))
    var timeNode = row.querySelector('.travel-record-head time')
    var dateTimeText = getCleanText(timeNode)
    if (!dateTimeText) {
      var body = getCleanText(row.querySelector('.travel-main p'))
      dateTimeText = body.split(/\s*\u00B7\s*/)[0] || ''
    }
    var parts = String(dateTimeText || '').trim().split(/\s+/)
    return legacyTravelRecordKey(title, parts[0] || '', parts[1] || '')
  }

  function legacyTravelRecordExists(timeline, record) {
    var key = legacyTravelRecordKey(record.title, record.recordDate, record.recordTime)
    return Array.from(timeline.querySelectorAll('.travel-row:not(.api-travel-record-row)')).some(function (row) {
      return readLegacyTravelRowKey(row) === key
    })
  }

  function formatTravelApiAmount(value) {
    var amount = Number(value || 0)
    return amount.toLocaleString('ko-KR') + '\uC6D0'
  }

  function createLegacyApiTravelRow(record, index) {
    var row = document.createElement('div')
    row.className = 'timeline-row travel-row api-travel-record-row'
    row.dataset.apiTravelRecordId = String(record.id || '')
    var order = String(record.sortOrder || index + 1).padStart(2, '0')
    var meta = [record.category || '\uAE30\uD0C0', formatTravelApiAmount(record.amount)].filter(Boolean).join(' \u00B7 ')
    var dateTime = [record.recordDate || '', record.recordTime || ''].filter(Boolean).join(' ')
    var note = String(record.note || '').trim()
    row.innerHTML = '<b>' + escapeHtml(order) + '</b>' +
      '<div class="travel-thumb empty"></div>' +
      '<button type="button" class="travel-main">' +
      '<div class="travel-record-head"><strong>' + escapeHtml(record.title || '\uC5EC\uD589 \uAE30\uB85D') + '</strong>' +
      (dateTime ? '<time>' + escapeHtml(dateTime) + '</time>' : '') + '</div>' +
      '<span class="travel-record-cost">' + escapeHtml(meta) + '</span>' +
      (note ? '<p class="travel-record-note">' + escapeHtml(note) + '</p>' : '') +
      '</button><div class="row-actions"></div>'
    return row
  }

  function renderCurrentLegacyTravelApiRecords(force) {
    var context = getCurrentLegacyTravelContext()
    if (!context || !getStoredAuthToken()) return
    var timeline = context.panel.querySelector('.timeline, .travel-timeline')
    if (!timeline) return
    if (!force && timeline.dataset.apiTravelRecordsLoaded === 'true') return
    var snapshot = getCurrentLegacyTravelTripSnapshot()
    if (!snapshot) return
    timeline.dataset.apiTravelRecordsLoaded = 'true'
    ensureApiTripForSnapshot(snapshot).then(function (tripId) {
      return fetchTripRecords(tripId)
    }).then(function (records) {
      timeline.querySelectorAll('.api-travel-record-row').forEach(function (node) { node.remove() })
      records.forEach(function (record, index) {
        if (legacyTravelRecordExists(timeline, record)) return
        timeline.appendChild(createLegacyApiTravelRow(record, index))
      })
      normalizeTravelRecordRows()
    }).catch(function () {
      timeline.dataset.apiTravelRecordsLoaded = ''
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
      return resolveTravelTaskTripId(task).then(function (tripId) {
        return postJson('/trips/' + tripId + '/records', task.payload)
      }).then(function (record) {
        renderCurrentLegacyTravelApiRecords(true)
        return record
      })
    }

    if (task.type === 'createSchedule') {
      return getReadableFamilyId().then(function (familyId) {
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
    if (!form || form.dataset.travelSubmitting === 'true') return
    form.dataset.travelSubmitting = 'true'
    window.setTimeout(function () {
      var title = getFieldValue(form, '[data-field="travel-title"]')
      var location = getFieldValue(form, '[data-field="travel-location"]')
      var recordDate = getDatePickerValue(form, '\uB0A0\uC9DC') || getFieldValue(form, '[data-field="travel-record-date"]')
      var recordTime = getFieldValue(form, '[data-field="travel-record-time"]')
      if (!title) {
        var titleInput = form.querySelector('[data-field="travel-title"]')
        showPatchToast('\uC81C\uBAA9\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
        if (titleInput) titleInput.focus()
        delete form.dataset.travelSubmitting
        return
      }
      if (!recordDate) {
        var dateInput = form.querySelector('[data-field="travel-record-date"], .date-picker-trigger')
        showPatchToast('\uB0A0\uC9DC\uB294 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
        if (dateInput) dateInput.focus()
        delete form.dataset.travelSubmitting
        return
      }
      if (!recordTime) {
        var timeInput = form.querySelector('[data-field="travel-record-time"]')
        showPatchToast('\uC2DC\uAC04\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
        if (timeInput) timeInput.focus()
        delete form.dataset.travelSubmitting
        return
      }

      var fileInput = form.querySelector('input[type="file"]')
      var submit = form.querySelector('button[type="submit"], .submit-action')
      if (submit && fileInput && fileInput.files && fileInput.files.length) {
        submit.disabled = true
        if (!submit.dataset.originalText) submit.dataset.originalText = submit.textContent
        submit.textContent = '\uC5C5\uB85C\uB4DC \uC911'
      }

      resolveTravelLocationForSubmit(form, location).then(function (coords) {
        return uploadMediaFiles(fileInput).then(function (files) {
          return { files: files, coords: coords }
        })
      }).then(function (result) {
        var coords = result.coords || { latitude: 0, longitude: 0 }
        var tripSnapshot = getCurrentLegacyTravelTripSnapshot()
        var apiDetail = form.closest('.api-trip-detail')
        var apiTripId = apiDetail ? Number(localStorage.getItem(API_TRIP_ID_KEY) || '') : 0
        var task = {
          tripId: Number.isFinite(apiTripId) && apiTripId > 0 ? apiTripId : null,
          tripSnapshot: tripSnapshot,
          payload: {
            sortOrder: parseAmountValue(getFieldValue(form, 'input[inputmode="numeric"]')) || null,
            title: title,
            category: getCustomSelectValue('\uBE44\uC6A9 \uAD6C\uBD84') || '\uAE30\uD0C0',
            amount: parseAmountValue(getFieldValue(form, '[data-field="travel-amount"]')),
            note: getFieldValue(form, 'textarea'),
            location: location || '',
            latitude: Number(coords.latitude || 0),
            longitude: Number(coords.longitude || 0),
            recordDate: recordDate,
            recordTime: recordTime,
            mediaUrls: communityMediaUrls(result.files)
          }
        }
        return resolveTravelTaskTripId(task).then(function (tripId) {
          return postJson('/trips/' + tripId + '/records', task.payload).then(function (record) {
            showPatchToast('\uC5EC\uD589 \uAE30\uB85D\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
            renderCurrentLegacyTravelApiRecords(true)
            if (form.classList.contains('api-travel-record-form')) {
              renderApiTripRecords(form.closest('.api-trip-detail'), tripId)
            }
            form.querySelectorAll('[data-field="travel-title"], [data-field="travel-location"], [data-field="travel-amount"], textarea').forEach(function (field) {
              setNativeInputValue(field, '')
              delete field.dataset.latitude
              delete field.dataset.longitude
              delete field.dataset.placeAddress
            })
            return record
          })
        })
      }).catch(function (error) {
        if (String(error && error.message || '').indexOf('INVALID_MEDIA') < 0) {
          showPatchToast(apiActionErrorMessage(error, '\uC5EC\uD589 \uAE30\uB85D \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
        }
      }).finally(function () {
        delete form.dataset.travelSubmitting
        if (submit) {
          submit.disabled = false
          if (submit.dataset.originalText) submit.textContent = submit.dataset.originalText
        }
      })
    }, 450)
  }

