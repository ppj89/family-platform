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
    return searchLocationPlaces(query, limit)
  }

  function placeCandidateLabel(item) {
    return locationCandidateLabel(item)
  }

  function placeCandidateDetail(item) {
    return locationCandidateDetail(item)
  }

  function setTravelLocationCandidate(input, item) {
    setLocationCandidate(input, item)
  }

  function getTravelLocationCoordinates(form) {
    return getLocationCoordinates(form, '[data-field="travel-location"]')
  }

  function resolveTravelLocationForSubmit(form, location) {
    return resolveLocationForSubmit(form, location, '[data-field="travel-location"]')
  }

  function ensureTravelLocationSearch(form) {
    ensureLocationSearch(form, '[data-field="travel-location"]')
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
      if (actions) {
        actions.querySelectorAll('[data-travel-new-entry], [data-travel-list-back]').forEach(function (button) { button.remove() })
        if (!actions.children.length) actions.remove()
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
    normalizeTravelRecordRows()
  }

  function normalizeTravelRecordRows() {
    if (!pageHeadingIs('\uC5EC\uD589')) return
    document.querySelectorAll('.travel-row').forEach(function (row) {
      normalizeTravelRecordMapButton(row)
      normalizeTravelRecordText(row)
    })
  }

  function normalizeTravelRecordMapButton(row) {
    var link = row && row.querySelector('.row-actions a.map-link')
    if (!link) return
    var query = getTravelMapQuery(link)
    var title = getCleanText(row.querySelector('.travel-main strong, .travel-record-head strong'))
    if (!query || query === '\uB300\uD55C\uBBFC\uAD6D' || query === title || isEmptyTravelCoordinateQuery(query)) {
      link.remove()
    }
  }

  function getTravelMapQuery(link) {
    try {
      return String(new URL(link.href).searchParams.get('query') || '').trim()
    } catch (error) {
      return ''
    }
  }

  function isEmptyTravelCoordinateQuery(query) {
    var match = String(query || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
    if (!match) return false
    return Math.abs(Number(match[1])) < 0.000001 && Math.abs(Number(match[2])) < 0.000001
  }

  function normalizeTravelRecordText(row) {
    var main = row && row.querySelector('.travel-main')
    if (!main || main.querySelector('.travel-record-head')) return
    var title = getCleanText(main.querySelector('strong')) || '\uC5EC\uD589 \uAE30\uB85D'
    var metaText = normalizeTravelCostText(getCleanText(main.querySelector('span')))
    var bodyText = getCleanText(main.querySelector('p'))
    var bodyParts = bodyText.split(/\s*\u00B7\s*/)
    var dateTime = bodyParts.shift() || ''
    var note = bodyParts.join(' \u00B7 ').trim()
    main.innerHTML = ''

    var head = document.createElement('div')
    head.className = 'travel-record-head'
    var titleNode = document.createElement('strong')
    titleNode.textContent = title
    head.appendChild(titleNode)
    if (dateTime) {
      var timeNode = document.createElement('time')
      timeNode.textContent = dateTime
      head.appendChild(timeNode)
    }
    main.appendChild(head)

    if (metaText) {
      var meta = document.createElement('span')
      meta.className = 'travel-record-cost'
      meta.textContent = metaText
      main.appendChild(meta)
    }

    if (note) {
      var noteNode = document.createElement('p')
      noteNode.className = 'travel-record-note'
      noteNode.textContent = note
      main.appendChild(noteNode)
    }
  }

  function normalizeTravelCostText(text) {
    var value = String(text || '').trim()
    if (!value || value.indexOf('\u00B7') >= 0) return value
    var match = value.match(/^(.+?)(-?[\d,]+\uC6D0)$/)
    if (!match) return value
    return match[1].trim() + ' \u00B7 ' + match[2]
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

