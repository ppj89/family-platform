  function fetchDiaries(startDate, endDate) {
    if (!getStoredAuthToken()) return Promise.resolve([])
    return readWithReadableFamily(function (familyId) {
      return '/diaries?familyId=' + encodeURIComponent(familyId) +
        '&startDate=' + encodeURIComponent(startDate) +
        '&endDate=' + encodeURIComponent(endDate)
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchBabies() {
    if (!getStoredAuthToken()) return Promise.resolve([])
    return readWithReadableFamily(function (familyId) {
      return '/babies?familyId=' + encodeURIComponent(familyId)
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchBabyRecords(babyId, startDate, endDate) {
    if (!babyId || !getStoredAuthToken()) return Promise.resolve([])
    return apiRequest('/babies/' + encodeURIComponent(babyId) + '/records' +
      '?startDate=' + encodeURIComponent(startDate) +
      '&endDate=' + encodeURIComponent(endDate)).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function ensureServerTravelPanel() {
    removeDeveloperServerPanels()
    return
    if (!document.querySelector('.travel-form') && !document.querySelector('.trip-list') && !document.querySelector('.travel-summary')) return
    if (document.querySelector('.server-travel-list')) return
    var anchor = document.querySelector('.trip-list') || document.querySelector('.travel-summary') || document.querySelector('.travel-form')
    if (!anchor || !anchor.parentElement) return
    var panel = document.createElement('section')
    panel.className = 'panel server-travel-list server-domain-panel'
    panel.innerHTML = '<header class="panel-header"><h2>DB 여행 기록</h2><button type="button">서버 조회</button></header><div class="server-data-list"></div>'
    anchor.parentElement.insertBefore(panel, anchor.nextSibling)
  }

  function renderTravelServerEntries(force) {
    removeDeveloperServerPanels()
    return
    if (getCleanText(document.querySelector('.topbar h1')) !== '\uC5EC\uD589') return
    ensureServerTravelPanel()
    var panel = document.querySelector('.server-travel-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    if (!force && panel.dataset.loaded === 'true') return
    panel.dataset.loaded = 'true'
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uC5EC\uD589\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchTrips().then(function (trips) {
      if (!trips.length) {
        list.innerHTML = '<p class="server-data-empty">DB \uC5EC\uD589 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      return Promise.all(trips.slice(0, 5).map(function (trip) {
        return fetchTripRecords(trip.id).then(function (records) {
          return { trip: trip, records: records }
        })
      })).then(function (groups) {
        list.innerHTML = groups.map(function (group) {
          var total = group.records.reduce(function (sum, item) { return sum + Number(item.amount || 0) }, 0)
          var first = group.records[0]
          return '<article class="server-domain-row" data-api-trip-id="' + group.trip.id + '">' +
            '<div><strong>' + escapeHtml(group.trip.title) + '</strong><span>' +
            escapeHtml((group.trip.startDate || '') + ' ~ ' + (group.trip.endDate || '')) +
            '</span></div><b>' + escapeHtml(total.toLocaleString('ko-KR') + '\uC6D0') + '</b>' +
            (first ? '<small>' + escapeHtml(first.title + ' · ' + (first.location || '')) + '</small>' : '<small>\uC5EC\uD589 \uAE30\uB85D \uC5C6\uC74C</small>') +
            '</article>'
        }).join('')
      })
    })
  }

  function ensureServerDiaryPanel() {
    removeDeveloperServerPanels()
    return
    if (!document.querySelector('.diary-list') && !document.querySelector('.diary-grid') && !document.querySelector('.diary-form')) return
    if (document.querySelector('.server-diary-list')) return
    var anchor = document.querySelector('.diary-list') || document.querySelector('.diary-grid') || document.querySelector('.diary-form')
    if (!anchor || !anchor.parentElement) return
    var panel = document.createElement('section')
    panel.className = 'panel server-diary-list server-domain-panel'
    panel.innerHTML = '<header class="panel-header"><h2>DB 일기</h2><button type="button">서버 조회</button></header><div class="server-data-list"></div>'
    anchor.parentElement.insertBefore(panel, anchor.nextSibling)
  }

  function renderDiaryServerEntries(force) {
    removeDeveloperServerPanels()
    return
    if (getCleanText(document.querySelector('.topbar h1')) !== '\uC77C\uAE30') return
    ensureServerDiaryPanel()
    var panel = document.querySelector('.server-diary-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    var range = monthRangeFor(todayText())
    var key = range.start + ':' + range.end
    if (!force && panel.dataset.rangeKey === key) return
    panel.dataset.rangeKey = key
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uC77C\uAE30\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchDiaries(range.start, range.end).then(function (items) {
      if (!items.length) {
        list.innerHTML = '<p class="server-data-empty">\uC774\uBC88 \uB2EC DB \uC77C\uAE30\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      list.innerHTML = items.slice(0, 12).map(function (item) {
        var temp = item.minTemperature || item.maxTemperature
          ? (item.minTemperature || '-') + '/' + (item.maxTemperature || '-') + '\uB3C4'
          : '\uC628\uB3C4 \uBBF8\uC785\uB825'
        return '<article class="server-domain-row" data-api-diary-id="' + item.id + '">' +
          '<div><strong>' + escapeHtml(item.title) + '</strong><span>' +
          escapeHtml((item.diaryDate || '').replace(/-/g, '.') + ' · ' + (item.weather || '\uB0A0\uC528 \uBBF8\uC785\uB825') + ' · ' + temp) +
          '</span></div><small>' + escapeHtml(item.body || '') + '</small></article>'
      }).join('')
    })
  }

