  function refreshServerDataViews(force) {
    purgeStaleLedgerSyncQueueOnce()
    removeDeveloperServerPanels()
    cleanupPatchRootsForCurrentMenu()
    normalizeMenuCaptions()
    normalizeLedgerEntryForm()
    removeLedgerManageButton()
    normalizeTravelEntryForm()
    ensureTravelHeaderActions()
    normalizeDiaryEntryForm()
    normalizeBabyEntryForms()
    normalizeTimeInputs()
    removeFeaturePlaceholders()
    removeHardcodedDemoData()
    renderCurrentLegacyTravelApiRecords(force)
    renderHomeMetricsFromApi(force)
    renderLedgerPageFromApi(force)
    renderDiaryPageFromApi(force)
    renderBabyApiCards(force)
    renderRestaurantPageFromApi()
    if (!getStoredAuthToken()) return
    renderHomeSchedulesFromApi(force)
    renderHomeLedgerFromApi(force)
    removeFeaturePlaceholders()
    window.setTimeout(removeHardcodedDemoData, 50)
  }

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!nav) return
    schedulePlaceholderSweep()
    window.setTimeout(function () {
      refreshServerDataViews(true)
    }, 700)
  }, true)

  function getCurrentFamilyId(forceRefresh) {
    var cachedId = Number(localStorage.getItem(API_FAMILY_ID_KEY) || '')
    if (!forceRefresh && Number.isFinite(cachedId) && cachedId > 0) return Promise.resolve(cachedId)

    return apiRequest('/families').then(function (families) {
      var family = Array.isArray(families) ? families[0] : null
      if (!family || !family.id) {
        localStorage.removeItem(API_FAMILY_ID_KEY)
        throw new Error('No family group available')
      }
      localStorage.setItem(API_FAMILY_ID_KEY, String(family.id))
      return family.id
    })
  }

  function getReadableFamilyId(forceRefresh) {
    return getCurrentFamilyId(forceRefresh).catch(function () {
      return 0
    })
  }

  function readWithReadableFamily(pathFactory) {
    return getReadableFamilyId(true).then(function (familyId) {
      return apiRequest(pathFactory(familyId)).catch(function (error) {
        if (familyId > 0 && error && (error.status === 403 || error.status === 404)) {
          localStorage.removeItem(API_FAMILY_ID_KEY)
          return apiRequest(pathFactory(0))
        }
        throw error
      })
    })
  }

  function postScheduleWithFreshFamily(payload, forceRefresh) {
    return getReadableFamilyId(forceRefresh).then(function (familyId) {
      return postJson('/schedules?familyId=' + encodeURIComponent(familyId), payload)
    })
  }

  function putJson(path, body) {
    return apiRequest(path, {
      method: 'PUT',
      body: JSON.stringify(body)
    })
  }

  function updateScheduleApiItem(id, payload) {
    return putJson('/schedules/' + encodeURIComponent(id), payload)
  }

  function resolveScheduleItemId(item) {
    if (!item) return ''
    var direct = item.id != null ? item.id : (item.scheduleId != null ? item.scheduleId : item.serverId)
    if (direct != null && String(direct)) return String(direct)
    var map = window.__familyYearScheduleItemsById || {}
    var foundKey = Object.keys(map).find(function (key) {
      var candidate = map[key] || {}
      return String(candidate.title || '') === String(item.title || '') &&
        String(candidate.scheduleDate || '') === String(item.scheduleDate || '')
    })
    return foundKey || ''
  }

  function resolveFullScheduleItem(item) {
    if (!item) return item
    var map = window.__familyYearScheduleItemsById || {}
    var itemId = resolveScheduleItemId(item)
    if (itemId && map[itemId]) return map[itemId]
    var foundKey = Object.keys(map).find(function (key) {
      var candidate = map[key] || {}
      return String(candidate.title || '') === String(item.title || '') &&
        (!item.scheduleDate || String(candidate.scheduleDate || '') === String(item.scheduleDate || ''))
    })
    return foundKey ? map[foundKey] : item
  }

  function deleteScheduleApiItem(item, afterDelete) {
    item = resolveFullScheduleItem(item)
    var itemId = resolveScheduleItemId(item)
    if (!itemId) return
    showPatchConfirm('\uC77C\uC815\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
      apiRequest('/schedules/' + encodeURIComponent(itemId), { method: 'DELETE' }).then(function () {
        calendarScheduleCache.key = ''
        calendarScheduleCache.items = []
        calendarScheduleCache.loadedAt = 0
        window.__familyYearScheduleCache = null
        window.__familyYearMonthListState = null
        showPatchToast('\uC77C\uC815\uC774 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
        refreshServerDataViews(true)
        renderCalendarApiSchedules(true)
        loadScheduleNotifications(true)
        if (afterDelete) afterDelete()
      }).catch(function (error) {
        showPatchToast(apiActionErrorMessage(error, '\uC77C\uC815 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      })
    })
  }

