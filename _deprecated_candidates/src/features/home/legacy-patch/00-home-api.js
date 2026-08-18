  function renderHomeSchedulesFromApi(force) {
    var todayPanel = document.querySelector('.home-today-schedule')
    var list = todayPanel && todayPanel.querySelector('.task-list')
    if (!list || todayPanel.dataset.apiLoading === 'true') return
    if (!force && todayPanel.dataset.apiBacked === 'true') return
    todayPanel.dataset.apiLoading = 'true'

    var today = todayText()
    fetchSchedules(today, today).then(function (items) {
      todayPanel.dataset.apiLoading = 'false'
      todayPanel.dataset.apiBacked = 'true'
      if (!items.length) {
        list.innerHTML = '<li class="api-empty-row"><span></span><strong>\uC624\uB298 \uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</strong><small>\uCE98\uB9B0\uB354\uC5D0\uC11C \uC77C\uC815\uC744 \uCD94\uAC00\uD574\uBCF4\uC138\uC694.</small></li>'
        return
      }
      list.innerHTML = items.slice(0, 5).map(function (item) {
        return '<li data-api-schedule-id="' + item.id + '"><span></span><strong>' +
          escapeHtml(scheduleTimeText(item) + ' ' + item.title) +
          '</strong><small>' + escapeHtml((item.category || '\uC77C\uC815') + (item.memberName ? ' · ' + item.memberName : '')) +
          '</small></li>'
      }).join('')
    })
  }

  function emptyRow(message, detail) {
    return '<div class="api-empty-row"><strong>' + escapeHtml(message) + '</strong>' +
      (detail ? '<small>' + escapeHtml(detail) + '</small>' : '') + '</div>'
  }

  function setMetricValue(metric, value) {
    if (!metric) return
    var strong = metric.querySelector('strong')
    if (strong) strong.textContent = value
  }

  function resetHomeMetrics(metrics) {
    setMetricValue(metrics[0], '0\uC6D0')
    setMetricValue(metrics[1], '0\uC6D0')
    setMetricValue(metrics[2], '0\uAC1C')
    setMetricValue(metrics[3], '0\uBA85')
  }

  function fetchFamilyMembers() {
    if (!getStoredAuthToken()) return Promise.resolve([])
    return getCurrentFamilyId().then(function (familyId) {
      return apiRequest('/families/' + encodeURIComponent(familyId) + '/members')
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function calculateTripTotal(trips) {
    return Promise.all((trips || []).slice(0, 30).map(function (trip) {
      return fetchTripRecords(trip.id).then(function (records) {
        return records.reduce(function (sum, item) {
          return sum + Number(item.amount || 0)
        }, 0)
      })
    })).then(function (totals) {
      return totals.reduce(function (sum, value) { return sum + value }, 0)
    })
  }

  function countBabyRecords(babies) {
    var range = monthRangeFor(todayText())
    return Promise.all((babies || []).slice(0, 20).map(function (baby) {
      return fetchBabyRecords(baby.id, range.start, range.end).then(function (records) {
        return records.length
      })
    })).then(function (counts) {
      return counts.reduce(function (sum, value) { return sum + value }, 0)
    })
  }

  function renderHomeMetricsFromApi(force) {
    var metrics = Array.from(document.querySelectorAll('.metric-grid .metric'))
    if (!metrics.length || (!force && document.documentElement.dataset.homeMetricsApiBacked === 'true')) return
    if (!getStoredAuthToken()) {
      resetHomeMetrics(metrics)
      return
    }
    var requestSeq = ++homeMetricsRequestSeq
    var firstLoad = document.documentElement.dataset.homeMetricsApiBacked !== 'true'
    document.documentElement.dataset.homeMetricsApiBacked = 'true'
    var range = monthRangeFor(todayText())
    Promise.all([
      fetchLedgerSummary(range.start, range.end),
      fetchTrips().then(calculateTripTotal),
      fetchBabies().then(countBabyRecords),
      fetchFamilyMembers()
    ]).then(function (results) {
      if (requestSeq !== homeMetricsRequestSeq) return
      setMetricValue(metrics[0], Number((results[0] && results[0].expense) || 0).toLocaleString('ko-KR') + '\uC6D0')
      setMetricValue(metrics[1], Number(results[1] || 0).toLocaleString('ko-KR') + '\uC6D0')
      setMetricValue(metrics[2], Number(results[2] || 0).toLocaleString('ko-KR') + '\uAC1C')
      setMetricValue(metrics[3], Number((results[3] && results[3].length) || 0).toLocaleString('ko-KR') + '\uBA85')
    }).catch(function () {
      if (firstLoad && requestSeq === homeMetricsRequestSeq) resetHomeMetrics(metrics)
    })
  }

  function renderHomeLedgerFromApi(force) {
    var table = document.querySelector('.content-grid .panel.wide .ledger-table')
    if (!table) return
    if (table.dataset.apiHomeLedgerInitialized !== 'true') {
      table.dataset.apiHomeLedgerInitialized = 'true'
      table.innerHTML = emptyRow('\uCD5C\uADFC \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
    }
    if (!getStoredAuthToken()) {
      table.dataset.apiBacked = 'true'
      table.dataset.apiLoading = 'false'
      table.innerHTML = emptyRow('\uCD5C\uADFC \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
      return
    }
    if (table.dataset.apiLoading === 'true') return
    if (!force && table.dataset.apiBacked === 'true') return
    table.dataset.apiLoading = 'true'
    var requestSeq = ++homeLedgerRequestSeq
    if (table.dataset.apiBacked !== 'true') {
      table.innerHTML = emptyRow('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.', '')
    }

    var range = monthRangeFor(todayText())
    fetchLedgerEntries(range.start, range.end).then(function (items) {
      if (requestSeq !== homeLedgerRequestSeq) return
      table.dataset.apiLoading = 'false'
      table.dataset.apiBacked = 'true'
      if (!items.length) {
        table.innerHTML = emptyRow('\uCD5C\uADFC \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
        return
      }
      items.forEach(storeLedgerItemForDetail)
      table.innerHTML = items.slice(0, 5).map(function (item) {
        return '<div class="ledger-row api-ledger-row" data-api-ledger-id="' + item.id + '">' +
          '<div><strong>' + escapeHtml(item.title) + '</strong><span>' +
          escapeHtml((item.transactionDate || '').replace(/-/g, '.') + ' · ' + (item.category || '-') + ' · ' + (item.memberName || '-')) +
          '</span></div><span>' + escapeHtml(item.paymentMethod || '-') + '</span><b class="' + escapeHtml(item.entryType || 'expense') + '">' +
          escapeHtml(moneyText(item.amount, item.entryType)) + '</b></div>'
      }).join('')
    }).catch(function () {
      if (requestSeq !== homeLedgerRequestSeq) return
      table.dataset.apiLoading = 'false'
      table.dataset.apiBacked = 'true'
      table.innerHTML = emptyRow('\uCD5C\uADFC \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
    })
  }

