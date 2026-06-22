  function searchLocationPlaces(query, limit) {
    var text = String(query || '').trim()
    if (!text || text.length < 2 || !getStoredAuthToken()) return Promise.resolve([])
    return apiRequest('/places/search?q=' + encodeURIComponent(text) + '&limit=' + encodeURIComponent(limit || 6)).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function locationCandidateLabel(item) {
    return String(item && (item.name || item.address) || '').trim()
  }

  function locationCandidateDetail(item) {
    return String(item && item.address || '').trim()
  }

  function setLocationCandidate(input, item, options) {
    if (!input || !item) return
    options = options || {}
    var label = locationCandidateLabel(item)
    var detail = locationCandidateDetail(item)
    setNativeInputValue(input, label || detail)
    var latitude = Number(item.latitude)
    var longitude = Number(item.longitude)
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
      input.dataset.latitude = String(latitude)
      input.dataset.longitude = String(longitude)
      if (options.storeCoordinatesOnForm && input.form) {
        input.form.dataset.latitude = String(latitude)
        input.form.dataset.longitude = String(longitude)
      }
    } else {
      delete input.dataset.latitude
      delete input.dataset.longitude
      if (options.storeCoordinatesOnForm && input.form) {
        delete input.form.dataset.latitude
        delete input.form.dataset.longitude
      }
    }
    if (detail) input.dataset.placeAddress = detail
    else delete input.dataset.placeAddress
    if (options.addressSelector && input.form) {
      var addressInput = input.form.querySelector(options.addressSelector)
      if (addressInput && detail) setNativeInputValue(addressInput, detail)
    }
    if (typeof options.onSelect === 'function') {
      options.onSelect(input, item, { latitude: latitude, longitude: longitude, label: label, detail: detail })
    }
    input.dispatchEvent(new CustomEvent('family-platform-location-selected', {
      bubbles: true,
      detail: { item: item, latitude: latitude, longitude: longitude, label: label, address: detail }
    }))
  }

  function getLocationCoordinates(form, selector) {
    var input = form && form.querySelector(selector)
    if (!input) return null
    var latitude = Number(input.dataset.latitude || form.dataset.latitude)
    var longitude = Number(input.dataset.longitude || form.dataset.longitude)
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
      return { latitude: latitude, longitude: longitude }
    }
    var match = String(input.value || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
    if (!match) return null
    latitude = Number(match[1])
    longitude = Number(match[2])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
    return { latitude: latitude, longitude: longitude }
  }

  function resolveLocationForSubmit(form, location, selector, options) {
    var existing = getLocationCoordinates(form, selector)
    if (existing || !String(location || '').trim()) return Promise.resolve(existing)
    return searchLocationPlaces(location, 1).then(function (items) {
      var first = items[0]
      if (!first) return null
      var input = form.querySelector(selector)
      setLocationCandidate(input, first, options)
      return { latitude: Number(first.latitude), longitude: Number(first.longitude) }
    })
  }

  function ensureLocationSearch(form, selector, options) {
    options = options || {}
    var input = form && form.querySelector(selector)
    if (!input || input.dataset.placeSearchReady === 'true') return
    input.dataset.placeSearchReady = 'true'
    var label = input.closest('label')
    var candidates = document.createElement('div')
    candidates.className = 'location-candidates travel-location-candidates'
    candidates.hidden = true
    if (label && label.parentElement) {
      label.insertAdjacentElement('afterend', candidates)
    }
    var timer = null

    function hideCandidates() {
      candidates.hidden = true
      candidates.innerHTML = ''
    }

    function renderCandidates(query, items) {
      if (String(input.value || '').trim() !== query) return
      if (!items.length) {
        items = [{ id: 'manual:' + query, name: query, address: '\uC785\uB825\uD55C \uC704\uCE58\uB85C \uC800\uC7A5', latitude: '', longitude: '', source: 'manual' }]
      }
      candidates.innerHTML = '<span>\uC704\uCE58\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.</span>' + items.map(function (item, index) {
        return '<button type="button" data-place-index="' + index + '">' +
          '<b>' + escapeHtml(locationCandidateLabel(item)) + '</b>' +
          '<small>' + escapeHtml(locationCandidateDetail(item)) + '</small>' +
          '</button>'
      }).join('')
      candidates.hidden = false
      candidates.querySelectorAll('button[data-place-index]').forEach(function (button) {
        button.addEventListener('mousedown', function (event) { event.preventDefault() })
        button.addEventListener('click', function () {
          var item = items[Number(button.dataset.placeIndex)]
          setLocationCandidate(input, item, options)
          hideCandidates()
        })
      })
    }

    function queuePlaceSearch(clearCoordinates) {
      if (clearCoordinates) {
        delete input.dataset.latitude
        delete input.dataset.longitude
        delete input.dataset.placeAddress
        if (options.storeCoordinatesOnForm && input.form) {
          delete input.form.dataset.latitude
          delete input.form.dataset.longitude
        }
      }
      window.clearTimeout(timer)
      var query = String(input.value || '').trim()
      if (query.length < 2) {
        hideCandidates()
        return
      }
      timer = window.setTimeout(function () {
        candidates.innerHTML = '<span>\uC704\uCE58\uB97C \uAC80\uC0C9\uD558\uB294 \uC911\uC785\uB2C8\uB2E4.</span>'
        candidates.hidden = false
        searchLocationPlaces(query, 6).then(function (items) {
          renderCandidates(query, items)
        })
      }, 280)
    }

    input.addEventListener('input', function () {
      queuePlaceSearch(true)
    })
    input.addEventListener('focus', function () {
      if (String(input.value || '').trim().length >= 2 && candidates.hidden) {
        queuePlaceSearch(false)
      }
    })
    input.addEventListener('blur', function () {
      window.setTimeout(hideCandidates, 220)
    })
  }
