  function renderTravelRecordCards(records) {
    return sortedTravelRecords(records).map(function (record, index) {
      var order = travelRecordOrder(record, index)
      var amount = Number(record.amount || 0)
      var cost = [record.category || '', amount ? amount.toLocaleString('ko-KR') + '\uC6D0' : '0\uC6D0'].filter(Boolean).join(' \u00B7 ')
      var dateTime = [record.recordDate || '', formatTravelRecordTime(record.recordTime)].filter(Boolean).join(' \u00B7 ')
      var note = String(record.note || '').trim()
      var location = String(record.location || '').trim()
      return '<article class="travel-row travel-record-card api-travel-record-card" data-api-travel-record-id="' + escapeHtml(record.id || '') + '">' +
        '<b class="api-travel-record-order">' + escapeHtml(order) + '</b>' +
        '<div class="travel-thumb empty api-travel-record-thumb" aria-hidden="true">' + renderTravelRecordThumbIcon() + '</div>' +
        '<div class="travel-main api-travel-record-body">' +
        '<time class="api-travel-record-date">' + escapeHtml(dateTime) + '</time>' +
        '<strong class="api-travel-record-title">' + escapeHtml(record.title || '\uC5EC\uD589 \uAE30\uB85D') + '</strong>' +
        (note ? '<span class="api-travel-record-note">' + escapeHtml(note) + '</span>' : '') +
        (location ? '<small class="api-travel-record-location">' + escapeHtml(location) + '</small>' : '') +
        '<span class="api-travel-record-cost">' + escapeHtml(cost) + '</span>' +
        '</div>' +
        '<div class="travel-record-actions api-travel-record-actions">' +
        (hasTravelRecordCoordinates(record) ? '<button type="button" data-api-travel-record-map="' + escapeHtml(record.id || '') + '">\uC9C0\uB3C4</button>' : '') +
        '<button type="button" data-api-travel-record-edit="' + escapeHtml(record.id || '') + '">\uC218\uC815</button>' +
        '<button type="button" class="danger-action" data-api-travel-record-delete="' + escapeHtml(record.id || '') + '">\uC0AD\uC81C</button>' +
        '</div>' +
        '</article>'
    }).join('')
  }

  function renderTravelRecordThumbIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 8h4l2-3h4l2 3h4v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
  }

  function renderTravelRouteSequence(records) {
    var items = records.slice(0, 12).map(function (record, index) {
      var label = record.title || record.location || '\uC5EC\uD589 \uAE30\uB85D'
      var sub = record.location || [record.recordDate || '', formatTravelRecordTime(record.recordTime)].filter(Boolean).join(' \u00B7 ')
      return '<div class="route-sequence-item"><b>' + escapeHtml(travelRouteNumber(record, index)) + '</b><span>' + escapeHtml(label) + '</span>' +
        (sub ? '<small>' + escapeHtml(sub) + '</small>' : '') + (index < records.length - 1 ? '<i></i>' : '') + '</div>'
    }).join('')
    return items ? '<div class="route-sequence api-trip-route-sequence">' + items + '</div>' : ''
  }
