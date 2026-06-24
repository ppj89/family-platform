  function renderTravelTripDetailShell() {
    return [
      '<div class="api-trip-detail-shell">',
      '<section class="api-trip-detail-main">',
      '<div class="api-trip-detail-toolbar"><button type="button" data-api-trip-back>\uBAA9\uB85D</button></div>',
      '<div class="travel-summary api-travel-summary"><div><span>\uCD1D \uC0AC\uC6A9\uAE08\uC561</span><strong data-trip-total-amount>0\uC6D0</strong></div><div><span>\uB2E4\uC74C \uC21C\uC11C</span><strong data-trip-next-order>01</strong></div></div>',
      '<div class="route-map api-trip-route-map"><div class="route-map-osm" data-trip-route-map></div><div class="route-map-empty" data-trip-route-empty>\uB4F1\uB85D\uB41C \uC704\uCE58\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div></div>',
      '<div class="api-trip-record-list"></div>',
      '</section>',
      '<aside class="api-trip-detail-side">',
      renderTravelRecordFormShell(),
      '</aside>',
      '</div>'
    ].join('')
  }

  function renderTravelRecordFormShell() {
    var defaultCategory = getFamilyCommonDefaultCode('travelRecordCostCategory', '\uAD50\uD1B5')
    return [
      '<form class="travel-form api-travel-record-form">',
      '<h3>\uC5EC\uD589 \uAE30\uB85D \uCD94\uAC00</h3>',
      '<label class="form-field"><span class="form-label">\uC21C\uC11C</span><input class="form-control" data-field="travel-sort-order" inputmode="numeric" value="1" /></label>',
      '<label class="form-field travel-category-field"><span class="form-label">\uBE44\uC6A9 \uAD6C\uBD84</span><input type="hidden" data-field="travel-category" value="' + escapeHtml(defaultCategory) + '" />' + renderTravelCategorySelect(defaultCategory) + '</label>',
      '<label class="form-field travel-title-field"><span class="form-label">\uC81C\uBAA9 <em class="required-mark">*</em></span><input class="form-control" data-field="travel-title" /></label>',
      '<label class="form-field date-picker-field travel-record-date-field"><span class="form-label">\uB0A0\uC9DC <em class="required-mark">*</em></span><input type="hidden" data-field="travel-record-date" value="' + todayText() + '" /><button type="button" class="date-picker-trigger form-control" data-api-travel-record-date-trigger><span>' + todayText().replace(/-/g, '.') + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></label>',
      '<label class="form-field"><span class="form-label">\uC2DC\uAC04 <em class="required-mark">*</em></span><input class="form-control" data-field="travel-record-time" type="text" inputmode="numeric" maxlength="5" autocomplete="off" value="' + currentTimeText() + '" /></label>',
      '<label class="form-field travel-location-field"><span class="form-label">\uC704\uCE58</span><input class="form-control" data-field="travel-location" autocomplete="off" /></label>',
      '<div class="location-map-box api-location-map-box"><div class="location-map-osm" data-travel-location-map><span>\uC704\uCE58\uB97C \uC120\uD0DD\uD558\uBA74 \uC9C0\uB3C4\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4.</span></div></div>',
      '<label class="form-field"><span class="form-label">\uC0AC\uC6A9\uAE08\uC561</span><input class="form-control" data-field="travel-amount" inputmode="numeric" /></label>',
      '<label class="form-field travel-note-field"><span class="form-label">\uB0B4\uC6A9</span><textarea class="form-control" rows="5"></textarea></label>',
      '<div class="travel-form-actions"><button type="submit" class="save-button submit-action">\uAE30\uB85D \uCD94\uAC00</button></div>',
      '</form>'
    ].join('')
  }

  function renderTravelCategorySelect(selectedValue) {
    return '<div class="custom-select api-travel-category-select" data-api-travel-category-select><button type="button" class="custom-select-trigger form-control" data-api-travel-category-trigger><span>' + escapeHtml(selectedValue) + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="custom-select-list" hidden>' + renderFamilyCommonCodeButtons('travelRecordCostCategory', 'data-api-travel-category-value', selectedValue) + '</div></div>'
  }
