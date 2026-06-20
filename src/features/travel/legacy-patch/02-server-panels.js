  function fetchTrips() {
    if (!getStoredAuthToken()) return Promise.resolve([])
    return readWithReadableFamily(function (familyId) {
      return '/trips?familyId=' + encodeURIComponent(familyId)
    }).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function fetchTripRecords(tripId) {
    if (!tripId || !getStoredAuthToken()) return Promise.resolve([])
    return apiRequest('/trips/' + encodeURIComponent(tripId) + '/records?_=' + encodeURIComponent(Date.now())).then(function (items) {
      window.__familyLastTripRecordsError = ''
      return Array.isArray(items) ? items : []
    }).catch(function (error) {
      window.__familyLastTripRecordsError = apiActionErrorMessage(error, '\uC5EC\uD589 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      throw error
    })
  }

