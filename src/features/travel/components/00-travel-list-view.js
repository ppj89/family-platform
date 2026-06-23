  function renderTravelTripListCards(trips) {
    return trips.map(function (trip) {
      return '<article class="trip-list-card api-trip-card" data-api-trip-id="' + escapeHtml(trip.id) + '" data-api-trip-title="' + escapeHtml(trip.title || '\uC5EC\uD589') + '" data-api-trip-start="' + escapeHtml(trip.startDate || '') + '" data-api-trip-end="' + escapeHtml(trip.endDate || trip.startDate || '') + '">' +
        '<button type="button" class="trip-card-main" data-api-trip-open="' + escapeHtml(trip.id) + '">' +
        '<div><strong>' + escapeHtml(trip.title || '\uC5EC\uD589') + '</strong>' +
        '<span>' + escapeHtml(travelTripPeriodText(trip)) + '</span></div>' +
        '</button>' +
        '<div class="trip-card-actions">' +
        '<button type="button" data-api-trip-edit="' + escapeHtml(trip.id) + '">\uC218\uC815</button>' +
        '<button type="button" class="danger-action" data-api-trip-delete="' + escapeHtml(trip.id) + '">\uC0AD\uC81C</button>' +
        '</div>' +
        '</article>'
    }).join('')
  }

  function travelTripPeriodText(trip) {
    return (trip && trip.startDate ? trip.startDate : '') +
      (trip && trip.endDate && trip.endDate !== trip.startDate ? ' ~ ' + trip.endDate : '')
  }
