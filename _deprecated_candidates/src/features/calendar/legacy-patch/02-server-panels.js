  function ensureServerSchedulePanel() {
    removeDeveloperServerPanels()
    return
    var card = document.querySelector('.schedule-list-card')
    if (!card || card.querySelector('.server-schedule-list')) return
    var list = document.createElement('div')
    list.className = 'server-schedule-list'
    list.innerHTML = '<div class="server-data-heading"><strong>DB 일정</strong><span>서버 저장 데이터</span></div><div class="server-data-list"></div>'
    card.appendChild(list)
  }

  function renderCalendarServerSchedules(force) {
    removeDeveloperServerPanels()
    return
    if (!document.querySelector('.family-calendar-panel')) return
    ensureServerSchedulePanel()
    var panel = document.querySelector('.server-schedule-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    var range = rangeForCalendarMode()
    var key = range.start + ':' + range.end
    if (!force && panel.dataset.rangeKey === key) return
    panel.dataset.rangeKey = key
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uC77C\uC815\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    loadCalendarScheduleCache(force).then(function (items) {
      if (!items.length) {
        list.innerHTML = '<p class="server-data-empty">\uD574\uB2F9 \uAE30\uAC04\uC5D0 DB \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      list.innerHTML = items.slice(0, 20).map(function (item) {
        return '<button type="button" class="server-schedule-row" data-api-schedule-id="' + item.id + '">' +
          '<span>' + escapeHtml((item.scheduleDate || '').replace(/-/g, '.')) + '</span>' +
          '<strong>' + escapeHtml(scheduleTimeText(item) + ' ' + item.title) + '</strong>' +
          '<small>' + escapeHtml((item.category || '\uC77C\uC815') + (item.memo ? ' · ' + item.memo : '')) + '</small>' +
          '</button>'
      }).join('')
    })
  }

  function ensureServerLedgerPanel() {
    removeDeveloperServerPanels()
    return
    if (!document.querySelector('.ledger-form') && !document.querySelector('.daily-ledger')) return
    if (document.querySelector('.server-ledger-list')) return
    var anchor = document.querySelector('.daily-ledger') || document.querySelector('.ledger-form')
    if (!anchor || !anchor.parentElement) return
    var panel = document.createElement('section')
    panel.className = 'panel server-ledger-list'
    panel.innerHTML = '<header class="panel-header"><h2>DB 가계부 내역</h2><button type="button">서버 조회</button></header><div class="server-data-list"></div>'
    anchor.parentElement.insertBefore(panel, anchor.nextSibling)
  }

  function renderLedgerServerEntries(force) {
    removeDeveloperServerPanels()
    return
    if (getCleanText(document.querySelector('.topbar h1')) !== '\uAC00\uACC4\uBD80') return
    ensureServerLedgerPanel()
    var panel = document.querySelector('.server-ledger-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    var range = monthRangeFor(todayText())
    var key = range.start + ':' + range.end
    if (!force && panel.dataset.rangeKey === key) return
    panel.dataset.rangeKey = key
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uAC00\uACC4\uBD80\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchLedgerEntries(range.start, range.end).then(function (items) {
      if (!items.length) {
        list.innerHTML = '<p class="server-data-empty">\uC774\uBC88 \uB2EC DB \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      list.innerHTML = items.slice(0, 20).map(function (item) {
        return '<div class="ledger-row api-ledger-row" data-api-ledger-id="' + item.id + '">' +
          '<div><strong>' + escapeHtml(item.title) + '</strong><span>' +
          escapeHtml((item.transactionDate || '').replace(/-/g, '.') + ' · ' + (item.category || '-') + ' · ' + (item.memberName || '-')) +
          '</span></div><span>' + escapeHtml(item.paymentMethod || '-') + '</span><b class="' + escapeHtml(item.entryType || 'expense') + '">' +
          escapeHtml(moneyText(item.amount, item.entryType)) + '</b></div>'
      }).join('')
    })
  }

