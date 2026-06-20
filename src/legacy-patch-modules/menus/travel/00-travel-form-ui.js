  function normalizeTravelEntryForm() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    document.querySelectorAll('.travel-form, .trip-manager, .entry-panel, form').forEach(function (form) {
      var text = getCleanText(form)
      if (text.indexOf('\uC2DC\uC791') < 0 && text.indexOf('\uC885\uB8CC') < 0) return
      setDateFieldToToday(form, ['\uC2DC\uC791\uC77C', '\uC885\uB8CC\uC77C'])
      clearSampleFieldValues(form)
      normalizeTimeInputs(form)
      ensureRequiredMarkForInput(form.querySelector('[data-field="travel-title"]'))
      ensureTravelLocationSearch(form)
      form.querySelectorAll('[data-field="travel-location"], [data-field="travel-amount"], [data-field="travel-title"]').forEach(function (field) {
        field.removeAttribute('placeholder')
      })
      form.querySelectorAll('button, span, b, strong, small').forEach(function (node) {
        if (getCleanText(node) === '\uC5EC\uD589' && !node.closest('label')) node.remove()
      })
    })
    removeFeaturePlaceholders()
  }

  function searchTravelPlaces(query, limit) {
    var text = String(query || '').trim()
    if (!text || text.length < 2 || !getStoredAuthToken()) return Promise.resolve([])
    return apiRequest('/places/search?q=' + encodeURIComponent(text) + '&limit=' + encodeURIComponent(limit || 6)).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function placeCandidateLabel(item) {
    return String(item && (item.name || item.address) || '').trim()
  }

  function placeCandidateDetail(item) {
    return String(item && item.address || '').trim()
  }

  function setTravelLocationCandidate(input, item) {
    if (!input || !item) return
    var label = placeCandidateLabel(item)
    var detail = placeCandidateDetail(item)
    setNativeInputValue(input, label || detail)
    input.dataset.latitude = String(item.latitude || '')
    input.dataset.longitude = String(item.longitude || '')
    input.dataset.placeAddress = detail
  }

  function getTravelLocationCoordinates(form) {
    var input = form && form.querySelector('[data-field="travel-location"]')
    if (!input) return null
    var latitude = Number(input.dataset.latitude)
    var longitude = Number(input.dataset.longitude)
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

  function resolveTravelLocationForSubmit(form, location) {
    var existing = getTravelLocationCoordinates(form)
    if (existing || !String(location || '').trim()) return Promise.resolve(existing)
    return searchTravelPlaces(location, 1).then(function (items) {
      var first = items[0]
      if (!first) return null
      var input = form.querySelector('[data-field="travel-location"]')
      setTravelLocationCandidate(input, first)
      return { latitude: Number(first.latitude), longitude: Number(first.longitude) }
    })
  }

  function ensureTravelLocationSearch(form) {
    var input = form && form.querySelector('[data-field="travel-location"]')
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
        candidates.innerHTML = '<span>\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC0C1\uD638\uBA85\uC744 \uC880 \uB354 \uC790\uC138\uD788 \uC785\uB825\uD574\uC8FC\uC138\uC694.</span>'
        candidates.hidden = false
        return
      }
      candidates.innerHTML = '<span>\uC704\uCE58\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.</span>' + items.map(function (item, index) {
        return '<button type="button" data-place-index="' + index + '">' +
          '<b>' + escapeHtml(placeCandidateLabel(item)) + '</b>' +
          '<small>' + escapeHtml(placeCandidateDetail(item)) + '</small>' +
          '</button>'
      }).join('')
      candidates.hidden = false
      candidates.querySelectorAll('button[data-place-index]').forEach(function (button) {
        button.addEventListener('mousedown', function (event) { event.preventDefault() })
        button.addEventListener('click', function () {
          var item = items[Number(button.dataset.placeIndex)]
          setTravelLocationCandidate(input, item)
          hideCandidates()
        })
      })
    }

    input.addEventListener('input', function () {
      delete input.dataset.latitude
      delete input.dataset.longitude
      delete input.dataset.placeAddress
      window.clearTimeout(timer)
      var query = String(input.value || '').trim()
      if (query.length < 2) {
        hideCandidates()
        return
      }
      timer = window.setTimeout(function () {
        candidates.innerHTML = '<span>\uC704\uCE58\uB97C \uAC80\uC0C9\uD558\uB294 \uC911\uC785\uB2C8\uB2E4.</span>'
        candidates.hidden = false
        searchTravelPlaces(query, 6).then(function (items) {
          renderCandidates(query, items)
        })
      }, 280)
    })
    input.addEventListener('blur', function () {
      window.setTimeout(hideCandidates, 220)
    })
  }

  function ensureTravelHeaderActions() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    var panel = document.querySelector('.trip-manager')
    if (!panel) return
    var header = panel.querySelector('.panel-header') || panel.closest('.panel') && panel.closest('.panel').querySelector('.panel-header')
    if (!header) return
    var originalList = Array.from(panel.querySelectorAll('button')).find(function (button) {
      return getCleanText(button) === '\uBAA9\uB85D' && !button.dataset.travelListBack
    })
    var actions = header.querySelector('.travel-header-actions')
    if (!originalList) {
      if (actions && !actions.querySelector('[data-travel-list-back]')) actions.remove()
      normalizeTravelListWorkspace()
      return
    }
    if (!actions) {
      actions = document.createElement('div')
      actions.className = 'travel-header-actions'
      header.appendChild(actions)
    }
    var listButton = actions.querySelector('[data-travel-list-back]')
    if (!listButton && originalList) {
      listButton = document.createElement('button')
      listButton.type = 'button'
      listButton.className = originalList.className || 'cancel-button'
      listButton.dataset.travelListBack = 'true'
      listButton.textContent = '\uBAA9\uB85D'
      actions.appendChild(listButton)
      listButton.addEventListener('click', function () { originalList.click() })
      originalList.remove()
    }
    normalizeTravelListWorkspace()
  }

  function normalizeTravelListWorkspace() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    var manager = document.querySelector('.trip-manager')
    if (!manager) return
    document.querySelectorAll('.travel-trip-create-card').forEach(function (node) {
      var row = node.querySelector('.trip-add-row')
      if (row && !manager.contains(row)) {
        var list = manager.querySelector('.trip-list')
        manager.insertBefore(row, list || manager.firstChild)
      }
      node.remove()
    })
    var panel = manager.closest('.panel')
    if (!panel) return
    panel.classList.remove('full-span', 'fp-side-panel')
    panel.classList.add('fp-primary-panel', 'fp-wide-panel')
  }

  function cleanupTravelListWorkspace() {
    if (pageHeadingIs('\uC5EC\uD589')) return
    document.querySelectorAll('.travel-trip-create-card').forEach(function (node) { node.remove() })
  }

