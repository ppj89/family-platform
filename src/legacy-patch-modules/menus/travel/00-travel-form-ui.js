  function normalizeTravelEntryForm() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    document.querySelectorAll('.travel-form, .trip-manager, .entry-panel, form').forEach(function (form) {
      var text = getCleanText(form)
      var isTripPeriodForm = text.indexOf('\uC2DC\uC791') >= 0 || text.indexOf('\uC885\uB8CC') >= 0
      var isTravelRecordForm = !!form.querySelector('[data-field="travel-title"], [data-field="travel-record-time"], [data-field="travel-location"]')
      if (!isTripPeriodForm && !isTravelRecordForm) return
      setDateFieldToToday(form, ['\uC2DC\uC791\uC77C', '\uC885\uB8CC\uC77C'])
      clearSampleFieldValues(form)
      normalizeTimeInputs(form)
      ensureRequiredMarkForInput(form.querySelector('[data-field="travel-title"]'))
      ensureRequiredMarkForInput(form.querySelector('[data-field="travel-record-date"]'))
      ensureRequiredMarkForInput(form.querySelector('[data-field="travel-record-time"]'))
      ensureRequiredMarkForLabel(findLabelByText(form, '\uB0A0\uC9DC'))
      ensureRequiredMarkForLabel(findLabelByText(form, '\uC2DC\uAC04'))
      normalizeTravelLocationOptional(form)
      ensureTravelLocationSearch(form)
      form.querySelectorAll('[data-field="travel-location"], [data-field="travel-amount"], [data-field="travel-title"]').forEach(function (field) {
        field.removeAttribute('placeholder')
      })
      form.querySelectorAll('button, span, b, strong, small').forEach(function (node) {
        if (getCleanText(node) === '\uC5EC\uD589' && !node.closest('label')) node.remove()
      })
    })
    cleanupTravelMapUi()
    removeFeaturePlaceholders()
  }

  function normalizeTravelLocationOptional(form) {
    var input = form && form.querySelector('[data-field="travel-location"]')
    if (!input) return
    input.required = false
    input.removeAttribute('required')
    var label = input.closest('label')
    var mark = label && label.querySelector('.required-mark')
    if (mark) {
      var previous = mark.previousSibling
      mark.remove()
      if (previous && previous.nodeType === 3 && !previous.textContent.trim()) previous.remove()
    }
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
    cleanupTravelPageCaption()
    var header = panel.querySelector('.panel-header') || panel.closest('.panel') && panel.closest('.panel').querySelector('.panel-header')
    if (!header) return
    var isListMode = panel.classList.contains('list-mode')
    var actions = header.querySelector('.travel-header-actions')

    if (isListMode) {
      if (!actions) {
        actions = document.createElement('div')
        actions.className = 'travel-header-actions'
        header.appendChild(actions)
      }
      actions.querySelectorAll('[data-travel-list-back]').forEach(function (button) { button.remove() })
      if (!actions.querySelector('[data-travel-new-entry]')) {
        var newButton = document.createElement('button')
        newButton.type = 'button'
        newButton.className = 'save-button travel-new-entry-button'
        newButton.dataset.travelNewEntry = 'true'
        newButton.textContent = '\uC2E0\uADDC\uC785\uB825'
        newButton.addEventListener('click', function () {
          var first = panel.querySelector('.trip-add-row input, .trip-add-row textarea')
          if (first) {
            first.scrollIntoView({ behavior: 'smooth', block: 'center' })
            window.setTimeout(function () { first.focus() }, 180)
          }
        })
        actions.appendChild(newButton)
      }
      normalizeTravelListWorkspace()
      return
    }

    var originalList = Array.from(panel.querySelectorAll('button')).find(function (button) {
      return getCleanText(button) === '\uBAA9\uB85D' && !button.dataset.travelListBack
    })
    if (!originalList) {
      if (actions) {
        actions.querySelectorAll('[data-travel-new-entry]').forEach(function (button) { button.remove() })
        if (!actions.children.length) actions.remove()
      }
      normalizeTravelListWorkspace()
      return
    }
    if (!actions) {
      actions = document.createElement('div')
      actions.className = 'travel-header-actions'
      header.appendChild(actions)
    }
    actions.querySelectorAll('[data-travel-new-entry]').forEach(function (button) { button.remove() })
    actions.querySelectorAll('[data-travel-list-back]').forEach(function (button) {
      if (button !== originalList) button.remove()
    })
    originalList.dataset.travelListBack = 'true'
    actions.appendChild(originalList)
    normalizeTravelListWorkspace()
  }

  function cleanupTravelPageCaption() {
    document.querySelectorAll('body *').forEach(function (node) {
      if (node.children.length) return
      if (getCleanText(node) === '\uC7A5\uC18C, \uB3D9\uC120, \uBE44\uC6A9') node.remove()
    })
  }

  function cleanupTravelMapUi() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    document.querySelectorAll('.location-map-actions a, .location-map-actions button, a.map-link').forEach(function (node) {
      if (getCleanText(node) === '\uC9C0\uB3C4\uC5D0\uC11C \uC5F4\uAE30') node.remove()
    })
    document.querySelectorAll('.route-map .route-sequence').forEach(function (node) {
      node.remove()
    })
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

