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
      submitApiTripRow(row)
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

      resolveTravelLocationForSubmit(form, location).then(function (coords) {
        return uploadMediaFiles(fileInput).then(function (files) {
          return { files: files, coords: coords }
        })
      }).then(function (result) {
        var coords = result.coords || { latitude: 0, longitude: 0 }
        queueApiSync({
          type: 'createTravelRecord',
          payload: {
            sortOrder: parseAmountValue(getFieldValue(form, 'input[inputmode="numeric"]')) || null,
            title: title,
            category: getCustomSelectValue('\uBE44\uC6A9 \uAD6C\uBD84') || '\uAE30\uD0C0',
            amount: parseAmountValue(getFieldValue(form, '[data-field="travel-amount"]')),
            note: getFieldValue(form, 'textarea'),
            location: location || '',
            latitude: Number(coords.latitude || 0),
            longitude: Number(coords.longitude || 0),
            recordDate: getDatePickerValue(form, '\uB0A0\uC9DC') || getFieldValue(form, '[data-field="travel-record-date"]') || todayText(),
            recordTime: getFieldValue(form, '[data-field="travel-record-time"]') || currentTimeText(),
            mediaUrls: communityMediaUrls(result.files)
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

  function renderCurrentLegacyTravelApiRecords() {
  }

  document.addEventListener('click', function (event) {
    var tripButton = event.target && event.target.closest && event.target.closest('.trip-add-row .submit-action')
    if (tripButton) {
      event.preventDefault()
      syncTripAddRow(tripButton.closest('.trip-add-row'))
    }
  }, true)

  document.addEventListener('submit', function (event) {
    var tripRow = event.target && event.target.closest && event.target.closest('.trip-add-row')
    if (!tripRow) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    syncTripAddRow(tripRow)
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
