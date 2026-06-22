  function fetchRestaurants() {
    return getReadableFamilyId().then(function (familyId) {
      return apiRequest('/restaurants?familyId=' + encodeURIComponent(familyId)).then(function (items) {
        return Array.isArray(items) ? items : []
      })
    })
  }

  var restaurantSelectOptions = {
    price: [
      { value: '', label: '\uC120\uD0DD' },
      { value: '10000', label: '1\uB9CC\uC6D0\uB300' },
      { value: '20000', label: '2\uB9CC\uC6D0\uB300' },
      { value: '30000', label: '3\uB9CC\uC6D0\uB300' },
      { value: '50000', label: '5\uB9CC\uC6D0 \uC774\uC0C1' }
    ],
    rating: [
      { value: '', label: '\uC120\uD0DD' },
      { value: '5.0', label: '5.0' },
      { value: '4.5', label: '4.5' },
      { value: '4.0', label: '4.0' },
      { value: '3.5', label: '3.5' },
      { value: '3.0', label: '3.0' }
    ],
    scope: [
      { value: '\uC804\uCCB4 \uAC00\uC871', label: '\uC804\uCCB4 \uAC00\uC871' },
      { value: '\uAC00\uC871\uAD00\uB9AC\uC790', label: '\uAC00\uC871\uAD00\uB9AC\uC790' },
      { value: '\uB098\uB9CC \uBCF4\uAE30', label: '\uB098\uB9CC \uBCF4\uAE30' }
    ]
  }

  function restaurantSelectInputSelector(name) {
    if (name === 'price') return '[data-restaurant-price]'
    if (name === 'rating') return '[data-restaurant-rating]'
    if (name === 'scope') return '[data-restaurant-scope]'
    return ''
  }

  function restaurantSelectLabel(name, value) {
    var options = restaurantSelectOptions[name] || []
    var match = options.find(function (option) { return String(option.value) === String(value || '') })
    return (match && match.label) || (options[0] && options[0].label) || ''
  }

  function restaurantCustomSelectMarkup(name, label, inputAttrs, defaultValue) {
    var value = defaultValue || ''
    var options = restaurantSelectOptions[name] || []
    return '<label class="form-field restaurant-select-field"><span class="form-label">' + label + '</span>' +
      '<input type="hidden" ' + inputAttrs + ' value="' + escapeHtml(value) + '" />' +
      '<div class="custom-select restaurant-custom-select" data-restaurant-custom-select data-restaurant-select-name="' + escapeHtml(name) + '">' +
      '<button type="button" class="custom-select-trigger form-control" data-restaurant-select-trigger aria-haspopup="listbox" aria-expanded="false"><span>' + escapeHtml(restaurantSelectLabel(name, value)) + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<div class="custom-select-list" role="listbox" hidden>' +
      options.map(function (option) {
        return '<button type="button" role="option" class="' + (String(option.value) === String(value) ? 'selected' : '') + '" data-restaurant-select-option="' + escapeHtml(option.value) + '">' + escapeHtml(option.label) + '</button>'
      }).join('') +
      '</div></div></label>'
  }

  function setRestaurantCustomSelectOpen(wrapper, open) {
    if (!wrapper) return
    var trigger = wrapper.querySelector('[data-restaurant-select-trigger]')
    var list = wrapper.querySelector('.custom-select-list')
    wrapper.classList.toggle('open', !!open)
    if (trigger) {
      trigger.classList.toggle('open', !!open)
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
    }
    if (list) list.hidden = !open
  }

  function closeRestaurantCustomSelects(root, except) {
    Array.from((root || document).querySelectorAll('[data-restaurant-custom-select].open')).forEach(function (wrapper) {
      if (wrapper !== except) setRestaurantCustomSelectOpen(wrapper, false)
    })
  }

  function syncRestaurantCustomSelect(form, name) {
    if (!form) return
    var input = form.querySelector(restaurantSelectInputSelector(name))
    var wrapper = form.querySelector('[data-restaurant-select-name="' + name + '"]')
    if (!input || !wrapper) return
    var value = input.value || ''
    var label = wrapper.querySelector('[data-restaurant-select-trigger] span')
    if (label) label.textContent = restaurantSelectLabel(name, value)
    wrapper.querySelectorAll('[data-restaurant-select-option]').forEach(function (button) {
      button.classList.toggle('selected', String(button.dataset.restaurantSelectOption || '') === String(value))
    })
  }

  function syncRestaurantCustomSelects(form) {
    syncRestaurantCustomSelect(form, 'price')
    syncRestaurantCustomSelect(form, 'rating')
    syncRestaurantCustomSelect(form, 'scope')
  }

  function bindRestaurantCustomSelects(form) {
    if (!form || form.dataset.restaurantSelectsWired === 'true') return
    form.dataset.restaurantSelectsWired = 'true'
    form.addEventListener('click', function (event) {
      var trigger = event.target && event.target.closest && event.target.closest('[data-restaurant-select-trigger]')
      if (trigger && form.contains(trigger)) {
        event.preventDefault()
        event.stopPropagation()
        var wrapper = trigger.closest('[data-restaurant-custom-select]')
        var willOpen = !wrapper.classList.contains('open')
        closeRestaurantCustomSelects(form, wrapper)
        setRestaurantCustomSelectOpen(wrapper, willOpen)
        return
      }
      var option = event.target && event.target.closest && event.target.closest('[data-restaurant-select-option]')
      if (option && form.contains(option)) {
        event.preventDefault()
        event.stopPropagation()
        var select = option.closest('[data-restaurant-custom-select]')
        var name = select && select.dataset.restaurantSelectName
        var input = name && form.querySelector(restaurantSelectInputSelector(name))
        if (input) setOptionalInputValue(input, option.dataset.restaurantSelectOption || '')
        syncRestaurantCustomSelect(form, name)
        setRestaurantCustomSelectOpen(select, false)
      }
    })
    document.addEventListener('click', function (event) {
      if (!form.contains(event.target)) closeRestaurantCustomSelects(form)
    })
    syncRestaurantCustomSelects(form)
  }

  function restaurantPayloadFromForm(form) {
    var locationInput = form.querySelector('[data-restaurant-location]')
    var mediaUrls = []
    try {
      mediaUrls = JSON.parse(form.dataset.mediaUrls || '[]')
    } catch (error) {
      mediaUrls = []
    }
    return {
      name: getFieldValue(form, '[data-restaurant-name]'),
      menu: getFieldValue(form, '[data-restaurant-menu]') || null,
      price: parseAmountValue(getFieldValue(form, '[data-restaurant-price]')) || null,
      rating: Number(getFieldValue(form, '[data-restaurant-rating]')) || null,
      visitDate: getFieldValue(form, '[data-restaurant-visit-date]') || todayText(),
      location: getFieldValue(form, '[data-restaurant-location]') || null,
      address: getFieldValue(form, '[data-restaurant-address]') || null,
      latitude: Number(form.dataset.latitude || (locationInput && locationInput.dataset.latitude) || '') || null,
      longitude: Number(form.dataset.longitude || (locationInput && locationInput.dataset.longitude) || '') || null,
      scope: getFieldValue(form, '[data-restaurant-scope]') || '\uC804\uCCB4 \uAC00\uC871',
      memo: getFieldValue(form, '[data-restaurant-memo]') || null,
      mediaUrls: mediaUrls
    }
  }

  function clearRestaurantForm(form) {
    if (!form) return
    form.dataset.editId = ''
    form.dataset.mediaUrls = '[]'
    form.querySelectorAll('input, textarea').forEach(function (input) {
      if (input.matches('[data-restaurant-visit-date]')) setOptionalInputValue(input, todayText())
      else if (input.matches('[type="file"]')) input.value = ''
      else setOptionalInputValue(input, '')
      delete input.dataset.latitude
      delete input.dataset.longitude
      delete input.dataset.placeAddress
    })
    delete form.dataset.latitude
    delete form.dataset.longitude
    var scope = form.querySelector('[data-restaurant-scope]')
    if (scope) setOptionalInputValue(scope, '\uC804\uCCB4 \uAC00\uC871')
    var submit = form.querySelector('button[type="submit"]')
    if (submit) submit.textContent = '\uCD94\uAC00'
    syncRestaurantCustomSelects(form)
    syncRestaurantVisitDateDisplay(form)
    renderRestaurantMediaPreview(form)
    renderRestaurantLocationPreview(form)
  }

  function fillRestaurantForm(form, item) {
    if (!form || !item) return
    form.dataset.editId = String(item.id || '')
    form.dataset.mediaUrls = JSON.stringify(item.mediaUrls || [])
    setOptionalInputValue(form.querySelector('[data-restaurant-name]'), item.name || '')
    setOptionalInputValue(form.querySelector('[data-restaurant-menu]'), item.menu || '')
    setOptionalInputValue(form.querySelector('[data-restaurant-price]'), item.price != null ? String(Math.round(Number(item.price))) : '')
    setOptionalInputValue(form.querySelector('[data-restaurant-rating]'), item.rating != null ? String(item.rating) : '')
    setOptionalInputValue(form.querySelector('[data-restaurant-visit-date]'), item.visitDate || todayText())
    setOptionalInputValue(form.querySelector('[data-restaurant-location]'), item.location || '')
    setOptionalInputValue(form.querySelector('[data-restaurant-address]'), item.address || '')
    setOptionalInputValue(form.querySelector('[data-restaurant-scope]'), item.scope || '\uC804\uCCB4 \uAC00\uC871')
    setOptionalInputValue(form.querySelector('[data-restaurant-memo]'), item.memo || '')
    form.dataset.latitude = item.latitude || ''
    form.dataset.longitude = item.longitude || ''
    var locationInput = form.querySelector('[data-restaurant-location]')
    if (locationInput) {
      if (item.latitude) locationInput.dataset.latitude = String(item.latitude)
      else delete locationInput.dataset.latitude
      if (item.longitude) locationInput.dataset.longitude = String(item.longitude)
      else delete locationInput.dataset.longitude
      if (item.address) locationInput.dataset.placeAddress = item.address
      else delete locationInput.dataset.placeAddress
    }
    var submit = form.querySelector('button[type="submit"]')
    if (submit) submit.textContent = '\uC800\uC7A5'
    syncRestaurantCustomSelects(form)
    syncRestaurantVisitDateDisplay(form)
    renderRestaurantMediaPreview(form)
    renderRestaurantLocationPreview(form)
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    var first = form.querySelector('[data-restaurant-name]')
    if (first) window.setTimeout(function () { first.focus() }, 180)
  }

  function restaurantMediaUrls(form) {
    try {
      return JSON.parse(form.dataset.mediaUrls || '[]').filter(Boolean)
    } catch (error) {
      return []
    }
  }

  function renderRestaurantMediaPreview(form) {
    var target = form && form.querySelector('[data-restaurant-media-preview]')
    var fileInput = form && form.querySelector('[data-restaurant-media]')
    var hint = form && form.querySelector('[data-restaurant-media-hint]')
    if (!target) return
    var urls = restaurantMediaUrls(form)
    var selectedFiles = fileInput && fileInput.files && fileInput.files.length ? Array.from(fileInput.files) : []
    if (hint) hint.textContent = selectedFiles.length ? selectedFiles.map(function (file) { return file.name }).join(', ') : (typeof mediaLimitText === 'function' ? mediaLimitText() : '\uC0AC\uC9C4/\uC601\uC0C1 \uCD94\uAC00')
    if (selectedFiles.length) {
      target.innerHTML = '<div class="photo-preview-grid">' + selectedFiles.slice(0, 6).map(function (file) {
        var url = URL.createObjectURL(file)
        return file.type && file.type.indexOf('video/') === 0
          ? '<video muted src="' + escapeHtml(url) + '"></video>'
          : '<img alt="" src="' + escapeHtml(url) + '" />'
      }).join('') + '</div>'
      return
    }
    if (urls.length) {
      target.innerHTML = '<div class="photo-preview-grid">' + urls.slice(0, 6).map(function (url) {
        return /\.(mp4|mov|webm)(\?|$)/i.test(url)
          ? '<video muted src="' + escapeHtml(url) + '"></video>'
          : '<img alt="" src="' + escapeHtml(url) + '" />'
      }).join('') + '</div>'
      return
    }
    target.innerHTML = '<div class="media-upload-empty"><span>\uC0AC\uC9C4/\uC601\uC0C1 \uCD94\uAC00</span></div>'
  }

  function renderRestaurantLocationPreview(form) {
    var target = form && form.querySelector('[data-restaurant-map-preview]')
    var locationInput = form && form.querySelector('[data-restaurant-location]')
    if (!target || !locationInput) return
    var coords = typeof getLocationCoordinates === 'function'
      ? getLocationCoordinates(form, '[data-restaurant-location]')
      : null
    var latitude = Number((coords && coords.latitude) || form.dataset.latitude || locationInput.dataset.latitude || '')
    var longitude = Number((coords && coords.longitude) || form.dataset.longitude || locationInput.dataset.longitude || '')
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
      target.innerHTML = restaurantGoogleMapEmbed(latitude, longitude, '\uB9DB\uC9D1 \uC704\uCE58')
      return
    }
    target.innerHTML = restaurantGoogleMapEmbed(null, null, '\uB9DB\uC9D1 \uC9C0\uB3C4')
  }

  function restaurantGoogleMapEmbed(latitude, longitude, title) {
    var lat = Number(latitude)
    var lng = Number(longitude)
    var query = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
      ? lat + ',' + lng
      : '\uB300\uD55C\uBBFC\uAD6D'
    var zoom = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 ? '15' : '6'
    return '<iframe title="' + escapeHtml(title || '\uB9DB\uC9D1 \uC9C0\uB3C4') + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=' +
      encodeURIComponent(query) + '&z=' + zoom + '&output=embed"></iframe>'
  }

  function syncRestaurantVisitDateDisplay(form) {
    var input = form && form.querySelector('[data-restaurant-visit-date]')
    var trigger = form && form.querySelector('[data-restaurant-visit-date-trigger]')
    var label = trigger && trigger.querySelector('span')
    if (!input || !label) return
    var value = parseApiDate(input.value) || todayText()
    setOptionalInputValue(input, value)
    label.textContent = value.replace(/-/g, '.')
  }

  function bindRestaurantVisitDate(form) {
    var input = form && form.querySelector('[data-restaurant-visit-date]')
    var trigger = form && form.querySelector('[data-restaurant-visit-date-trigger]')
    if (!input || !trigger || trigger.dataset.restaurantDateWired === 'true') return
    trigger.dataset.restaurantDateWired = 'true'
    syncRestaurantVisitDateDisplay(form)
    trigger.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      openRestaurantVisitDatePopover(input, trigger)
    })
    input.addEventListener('input', function () { syncRestaurantVisitDateDisplay(form) })
    input.addEventListener('change', function () { syncRestaurantVisitDateDisplay(form) })
  }

  function handleRestaurantVisitDateTriggerEvent(event) {
    var trigger = event.target && event.target.closest && event.target.closest('[data-restaurant-visit-date-trigger]')
    if (!trigger) return
    var form = trigger.closest('[data-restaurant-form]')
    var input = form && form.querySelector('[data-restaurant-visit-date]')
    if (!input) return
    if ((event.type === 'click' || event.type === 'mouseup') && trigger.dataset.restaurantDatePointerAt && Date.now() - Number(trigger.dataset.restaurantDatePointerAt) < 600) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (event.type !== 'click') trigger.dataset.restaurantDatePointerAt = String(Date.now())
    openRestaurantVisitDatePopover(input, trigger)
    syncRestaurantVisitDateDisplay(form)
  }

  document.addEventListener('pointerdown', handleRestaurantVisitDateTriggerEvent, true)
  document.addEventListener('mousedown', handleRestaurantVisitDateTriggerEvent, true)
  document.addEventListener('touchstart', handleRestaurantVisitDateTriggerEvent, true)
  document.addEventListener('click', handleRestaurantVisitDateTriggerEvent, true)

  function openRestaurantVisitDatePopover(input, trigger) {
    if (!input || !trigger) return
    document.querySelectorAll('.restaurant-date-popover, .restaurant-visit-date-field .calendar-popover').forEach(function (old) {
      old.remove()
    })
    var selected = parseApiDate(input.value) || todayText()
    var view = new Date(selected + 'T00:00:00')
    var level = 'day'
    var popover = document.createElement('div')
    popover.className = 'calendar-popover restaurant-date-popover'

    function draw() {
      var year = view.getFullYear()
      var month = view.getMonth()
      var selectedDate = parseApiDate(selected) || todayText()
      var selectedYear = Number(selectedDate.slice(0, 4))
      var selectedMonth = Number(selectedDate.slice(5, 7)) - 1
      var title = level === 'year' ? year + '\uB144' : (level === 'month' ? year + '\uB144' : year + '\uB144 ' + (month + 1) + '\uC6D4')
      var html = '<header class="calendar-header"><button type="button" data-restaurant-date-prev>&lt;</button><button type="button" class="calendar-title-button" data-restaurant-date-title><span>' + title + '</span></button><button type="button" data-restaurant-date-next>&gt;</button></header>'
      html += '<div class="calendar-today-row"><button type="button" data-restaurant-date-today>\uC624\uB298</button></div>'
      if (level === 'year') {
        var startYear = Math.floor(year / 12) * 12
        html += '<div class="calendar-year-grid">'
        for (var yearIndex = 0; yearIndex < 12; yearIndex += 1) {
          var itemYear = startYear + yearIndex
          html += '<button type="button" class="' + (selectedYear === itemYear ? 'selected' : '') + '" data-restaurant-year="' + itemYear + '">' + itemYear + '\uB144</button>'
        }
        html += '</div>'
      } else if (level === 'month') {
        html += '<div class="calendar-month-grid">'
        for (var monthIndex = 0; monthIndex < 12; monthIndex += 1) {
          var isSelectedMonth = selectedYear === year && selectedMonth === monthIndex
          html += '<button type="button" class="' + (isSelectedMonth ? 'selected' : '') + '" data-restaurant-month="' + monthIndex + '">' + (monthIndex + 1) + '\uC6D4</button>'
        }
        html += '</div>'
      } else {
        var first = new Date(year, month, 1)
        var last = new Date(year, month + 1, 0).getDate()
        html += '<div class="calendar-weekdays"><span>\uC77C</span><span>\uC6D4</span><span>\uD654</span><span>\uC218</span><span>\uBAA9</span><span>\uAE08</span><span>\uD1A0</span></div><div class="calendar-day-grid">'
        for (var blank = 0; blank < first.getDay(); blank += 1) html += '<span class="calendar-empty"></span>'
        for (var day = 1; day <= last; day += 1) {
          var date = new Date(year, month, day)
          var iso = formatDate(date)
          var classes = []
          if (date.getDay() === 0) classes.push('holiday')
          if (date.getDay() === 6) classes.push('saturday')
          if (iso === selected) classes.push('selected')
          html += '<button type="button" class="' + classes.join(' ') + '" data-restaurant-date="' + iso + '">' + day + '</button>'
        }
        html += '</div>'
      }
      popover.innerHTML = html
    }

    function applySelected() {
      setInputValue(input, selected)
      var label = trigger.querySelector('span')
      if (label) label.textContent = selected.replace(/-/g, '.')
      popover.remove()
    }

    draw()
    trigger.insertAdjacentElement('afterend', popover)
    popover.addEventListener('pointerdown', function (event) {
      event.stopPropagation()
    }, true)
    popover.addEventListener('click', function (event) {
      var target = event.target
      if (!target || !target.closest) return
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      if (target.closest('[data-restaurant-date-prev]')) {
        if (level === 'year') view.setFullYear(view.getFullYear() - 12)
        else if (level === 'month') view.setFullYear(view.getFullYear() - 1)
        else view.setMonth(view.getMonth() - 1)
        draw()
        return
      }
      if (target.closest('[data-restaurant-date-next]')) {
        if (level === 'year') view.setFullYear(view.getFullYear() + 12)
        else if (level === 'month') view.setFullYear(view.getFullYear() + 1)
        else view.setMonth(view.getMonth() + 1)
        draw()
        return
      }
      if (target.closest('[data-restaurant-date-title]')) {
        if (level === 'day') level = 'month'
        else if (level === 'month') level = 'year'
        draw()
        return
      }
      if (target.closest('[data-restaurant-date-today]')) {
        selected = todayText()
        applySelected()
        return
      }
      var yearButton = target.closest('[data-restaurant-year]')
      if (yearButton) {
        view.setFullYear(Number(yearButton.dataset.restaurantYear))
        level = 'month'
        draw()
        return
      }
      var monthButton = target.closest('[data-restaurant-month]')
      if (monthButton) {
        view.setMonth(Number(monthButton.dataset.restaurantMonth))
        level = 'day'
        draw()
        return
      }
      var dayButton = target.closest('[data-restaurant-date]')
      if (dayButton) {
        selected = dayButton.dataset.restaurantDate
        applySelected()
      }
    }, true)
  }

  function useRestaurantCurrentLocation(form) {
    if (!form || !navigator.geolocation) {
      showPatchToast('\uD604\uC7AC \uC704\uCE58\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.')
      return
    }
    navigator.geolocation.getCurrentPosition(function (position) {
      var latitude = position.coords.latitude
      var longitude = position.coords.longitude
      var locationInput = form.querySelector('[data-restaurant-location]')
      var value = latitude.toFixed(6) + ', ' + longitude.toFixed(6)
      form.dataset.latitude = String(latitude)
      form.dataset.longitude = String(longitude)
      if (locationInput) {
        setNativeInputValue(locationInput, value)
        locationInput.dataset.latitude = String(latitude)
        locationInput.dataset.longitude = String(longitude)
      }
      renderRestaurantLocationPreview(form)
      showPatchToast('\uD604\uC7AC \uC704\uCE58\uB97C \uBC18\uC601\uD588\uC2B5\uB2C8\uB2E4.')
    }, function () {
      showPatchToast('\uD604\uC7AC \uC704\uCE58\uB97C \uAC00\uC838\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
    }, { enableHighAccuracy: true, timeout: 10000 })
  }

  function renderRestaurantRows(root, items) {
    var list = root.querySelector('[data-restaurant-list]')
    root.querySelectorAll('[data-restaurant-count]').forEach(function (count) {
      count.textContent = (items || []).length + '\uACF3'
    })
    root.querySelectorAll('[data-restaurant-rating-average]').forEach(function (target) {
      var ratedItems = (items || []).map(function (item) { return Number(item.rating || 0) }).filter(function (rating) { return rating > 0 })
      var average = ratedItems.length
        ? (ratedItems.reduce(function (sum, rating) { return sum + rating }, 0) / ratedItems.length).toFixed(1)
        : '0.0'
      target.textContent = average
    })
    if (!list) return
    if (!items || !items.length) {
      list.innerHTML = '<p class="api-empty-row">\uB4F1\uB85D\uB41C \uB9DB\uC9D1\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
      return
    }
    list.innerHTML = items.map(function (item) {
      var rating = Number(item.rating || 0)
      var meta = [
        item.visitDate ? item.visitDate.replace(/-/g, '.') : '',
        item.price != null ? Number(item.price).toLocaleString('ko-KR') + '\uC6D0' : '',
        item.scope || ''
      ].filter(Boolean)
      var location = item.location || item.address || ''
      var caption = item.menu || location || '\uB300\uD45C \uBA54\uB274\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.'
      var memo = item.memo || item.address || ''
      return '<article class="restaurant-card" data-restaurant-id="' + escapeHtml(item.id) + '">' +
        '<div class="restaurant-empty-photo" aria-hidden="true"><span>\uB9DB\uC9D1</span></div>' +
        '<div class="restaurant-card-body">' +
        '<div class="restaurant-card-top"><strong>' + escapeHtml(item.name || '\uC0C1\uD638\uBA85') + '</strong><span>' + (rating ? '\u2605 ' + escapeHtml(rating) : '') + '</span></div>' +
        '<p>' + escapeHtml(caption) + '</p>' +
        '<div class="restaurant-meta">' + meta.map(function (text) { return '<span>' + escapeHtml(text) + '</span>' }).join('') + '</div>' +
        (memo ? '<em>' + escapeHtml(memo) + '</em>' : '') +
        (location ? '<small>' + escapeHtml(location) + '</small>' : '') +
        '<div class="restaurant-actions"><button type="button" class="edit-button" data-restaurant-edit="' + escapeHtml(item.id) + '">\uC218\uC815</button><button type="button" class="danger-button" data-restaurant-delete="' + escapeHtml(item.id) + '">\uC0AD\uC81C</button></div>' +
        '</div>' +
        '</article>'
    }).join('')
    list.querySelectorAll('[data-restaurant-edit]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation()
        var item = items.find(function (candidate) { return String(candidate.id) === String(button.dataset.restaurantEdit) })
        fillRestaurantForm(root.querySelector('[data-restaurant-form]'), item)
      })
    })
    list.querySelectorAll('[data-restaurant-delete]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation()
        var id = button.dataset.restaurantDelete
        showPatchConfirm('\uB9DB\uC9D1\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
          apiRequest('/restaurants/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
            showPatchToast('\uB9DB\uC9D1\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
            loadRestaurantApiPage(root, true)
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uB9DB\uC9D1 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      })
    })
  }

  function loadRestaurantApiPage(root, force) {
    if (!root || (root.dataset.loaded === 'true' && !force)) return
    root.dataset.loaded = 'true'
    var list = root.querySelector('[data-restaurant-list]')
    if (list) list.innerHTML = '<p class="api-empty-row">\uB9DB\uC9D1\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchRestaurants().then(function (items) {
      root.__restaurantItems = items
      renderRestaurantRows(root, items)
    }).catch(function (error) {
      if (list) list.innerHTML = '<p class="api-empty-row">' + escapeHtml(apiActionErrorMessage(error, '\uB9DB\uC9D1\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')) + '</p>'
    })
  }

  function renderRestaurantPageFromApi() {
    if (!pageHeadingIs('\uB9DB\uC9D1')) return
    clearCustomPatchPageNow()
    removeHardcodedDemoData()
    removeFeaturePlaceholders()

    var content = document.querySelector('.content-grid')
    if (!content) return
    if (content.dataset.restaurantApiReady !== 'true') {
      content.dataset.restaurantApiReady = 'true'
      content.className = 'content-grid'
      content.innerHTML = [
        '<article class="panel wide">',
        '<div class="panel-header"><h2>\uAC00\uC871 \uB9DB\uC9D1</h2><span class="passive-header-chip" data-restaurant-count>0\uACF3</span></div>',
        '<section class="restaurant-hero"><div><strong>\uAC00\uC871\uC774 \uB2E4\uC2DC \uAC00\uACE0 \uC2F6\uC740 \uC7A5\uC18C</strong><span>\uC0AC\uC9C4, \uC704\uCE58, \uB300\uD45C \uBA54\uB274, \uBCC4\uC810\uAE4C\uC9C0 \uD55C \uBC88\uC5D0 \uC800\uC7A5</span></div><b data-restaurant-rating-average>0.0</b></section>',
        '<div class="restaurant-grid" data-restaurant-list></div>',
        '</article>',
        '<aside class="panel entry-panel">',
        '<div class="panel-header"><h2>\uB9DB\uC9D1 \uCD94\uAC00</h2></div>',
        '<form class="ledger-form restaurant-form" data-restaurant-form>',
        '<label><span>\uB9DB\uC9D1 \uC774\uB984 <em class="required-mark">*</em></span><input data-restaurant-name data-field="restaurant-title" autocomplete="off" /></label>',
        '<label><span>\uB300\uD45C \uBA54\uB274</span><input data-restaurant-menu data-field="restaurant-menu" autocomplete="off" /></label>',
        '<div class="form-row">' + restaurantCustomSelectMarkup('price', '\uAC00\uACA9\uB300', 'data-restaurant-price data-field="restaurant-price"', '') + restaurantCustomSelectMarkup('rating', '\uBCC4\uC810', 'data-restaurant-rating data-field="restaurant-rating"', '') + '</div>',
        '<label class="date-picker-field restaurant-visit-date-field form-field"><span class="form-label">\uBC29\uBB38\uC77C <em class="required-mark">*</em></span><input data-restaurant-visit-date data-field="restaurant-visit-date" type="hidden" value="' + todayText() + '" /><button type="button" class="date-picker-trigger form-control" data-restaurant-visit-date-trigger><span>' + todayText().replace(/-/g, '.') + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2v4M16 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></label>',
        '<label><span>\uC704\uCE58</span><input data-restaurant-location data-field="restaurant-location" autocomplete="off" placeholder="\uC0C1\uD638\uBA85 \uB610\uB294 \uC8FC\uC18C\uB97C \uC785\uB825\uD558\uACE0 \uD6C4\uBCF4\uB97C \uC120\uD0DD\uD558\uC138\uC694" /></label>',
        '<div class="location-map-box"><div data-restaurant-map-preview>' + restaurantGoogleMapEmbed(null, null, '\uB9DB\uC9D1 \uC9C0\uB3C4') + '</div><div class="location-map-actions"><button type="button" class="cancel-button" data-restaurant-current-location>\uD604\uC7AC \uC704\uCE58 \uC0AC\uC6A9</button></div></div>',
        '<label><span>\uC8FC\uC18C</span><input data-restaurant-address data-field="restaurant-address" autocomplete="off" /></label>',
        restaurantCustomSelectMarkup('scope', '\uACF5\uAC1C\uBC94\uC704', 'data-restaurant-scope data-field="restaurant-scope"', '\uC804\uCCB4 \uAC00\uC871'),
        '<label><span>\uBBF8\uB514\uC5B4</span><div class="photo-input"><div data-restaurant-media-preview class="media-upload-empty"><span>\uC0AC\uC9C4/\uC601\uC0C1 \uCD94\uAC00</span></div><input data-restaurant-media name="files" type="file" accept="image/*,video/*" multiple /></div><small data-restaurant-media-hint>' + (typeof mediaLimitText === 'function' ? mediaLimitText() : '') + '</small></label>',
        '<label><span>\uBA54\uBAA8</span><textarea data-restaurant-memo data-field="restaurant-note" rows="4" placeholder="\uC544\uC774 \uB3D9\uBC18, \uC8FC\uCC28, \uC7AC\uBC29\uBB38 \uC5EC\uBD80 \uB4F1\uC744 \uC801\uC5B4\uB450\uC138\uC694"></textarea></label>',
        '<div class="form-actions"><button type="submit" class="submit-action">\uCD94\uAC00</button><button type="button" class="cancel-button" data-restaurant-reset>\uCD08\uAE30\uD654</button></div>',
        '</form>',
        '</aside>'
      ].join('')

      var form = content.querySelector('[data-restaurant-form]')
      form.addEventListener('submit', function (event) {
        event.preventDefault()
        var payload = restaurantPayloadFromForm(form)
        if (!payload.name) {
          var nameInput = form.querySelector('[data-restaurant-name]')
          showPatchToast('\uC0C1\uD638\uBA85\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
          if (nameInput) nameInput.focus()
          return
        }
        if (!payload.visitDate) {
          var dateInput = form.querySelector('[data-restaurant-visit-date]')
          showPatchToast('\uBC29\uBB38\uC77C\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
          if (dateInput) dateInput.focus()
          return
        }
        var editId = form.dataset.editId
        var request = editId
          ? function () { return apiRequest('/restaurants/' + encodeURIComponent(editId), { method: 'PUT', body: JSON.stringify(payload) }) }
          : function () { return getReadableFamilyId().then(function (familyId) { return postJson('/restaurants?familyId=' + encodeURIComponent(familyId), payload) }) }
        showPatchConfirm(editId ? '\uB9DB\uC9D1\uC744 \uC218\uC815\uD560\uAE4C\uC694?' : '\uB9DB\uC9D1\uC744 \uCD94\uAC00\uD560\uAE4C\uC694?', function () {
          var fileInput = form.querySelector('[data-restaurant-media]')
          var upload = fileInput && fileInput.files && fileInput.files.length ? uploadMediaFiles(fileInput) : Promise.resolve([])
          upload.then(function (files) {
            if (files && files.length) {
              payload.mediaUrls = files.map(function (file) { return file.url }).filter(Boolean)
              form.dataset.mediaUrls = JSON.stringify(payload.mediaUrls)
            }
            return request()
          }).then(function () {
            showPatchToast(editId ? '\uB9DB\uC9D1\uC744 \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.' : '\uB9DB\uC9D1\uC744 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.')
            clearRestaurantForm(form)
            loadRestaurantApiPage(content, true)
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, editId ? '\uB9DB\uC9D1 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.' : '\uB9DB\uC9D1 \uCD94\uAC00\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      })
      var reset = content.querySelector('[data-restaurant-reset]')
      if (reset) reset.addEventListener('click', function () { clearRestaurantForm(form) })
      var mediaInput = content.querySelector('[data-restaurant-media]')
      if (mediaInput) mediaInput.addEventListener('change', function () { renderRestaurantMediaPreview(form) })
      var currentLocation = content.querySelector('[data-restaurant-current-location]')
      if (currentLocation) currentLocation.addEventListener('click', function () { useRestaurantCurrentLocation(form) })
      bindRestaurantCustomSelects(form)
      bindRestaurantVisitDate(form)
      content.querySelectorAll('[data-restaurant-location], [data-restaurant-address]').forEach(function (input) {
        input.addEventListener('input', function () { window.setTimeout(function () { renderRestaurantLocationPreview(form) }, 0) })
        input.addEventListener('family-platform-location-selected', function () { window.setTimeout(function () { renderRestaurantLocationPreview(form) }, 0) })
      })
      renderRestaurantMediaPreview(form)
      renderRestaurantLocationPreview(form)
    }
    syncRestaurantMenuState()
    ensureRestaurantLocationSearch(content.querySelector('[data-restaurant-form]'))
    loadRestaurantApiPage(content, false)
  }

  function ensureRestaurantLocationSearch(form) {
    ensureLocationSearch(form, '[data-restaurant-location]', {
      addressSelector: '[data-restaurant-address]',
      storeCoordinatesOnForm: true
    })
  }

  function normalizeRestaurantVisitDate() {
    if (!pageHeadingIs('\uB9DB\uC9D1')) return
    var visitDateField = Array.from(document.querySelectorAll('.date-picker-field, .restaurant-form label, .entry-panel label')).find(function (label) {
      return label.textContent.indexOf('\uBC29\uBB38\uC77C') !== -1
    })
    var triggerText = visitDateField && visitDateField.querySelector('.date-picker-trigger span')
    if (triggerText && (!triggerText.textContent || triggerText.textContent.trim() === '2026.06.03')) {
      triggerText.textContent = formatDotDate(new Date())
    }
    var visitDateInput = visitDateField && visitDateField.querySelector('input')
    if (visitDateInput && (!visitDateInput.value || visitDateInput.value === '2026.06.03')) {
      setInputValue(visitDateInput, formatDotDate(new Date()))
    }
  }

  function normalizeRestaurantFormControls() {
    var form = document.querySelector('.restaurant-form')
    if (!form) return
    if (form.matches('[data-restaurant-form]')) return
    Array.from(form.querySelectorAll('label')).forEach(function (label) {
      var labelText = getCleanText(label)
      var title = label.querySelector('span')

      if (labelText.indexOf('\uB9DB\uC9D1 \uC774\uB984') >= 0) {
        if (title) title.textContent = '\uC0C1\uD638\uBA85'
        label.querySelectorAll('input, textarea').forEach(function (field) {
          field.removeAttribute('placeholder')
        })
      }

      if (labelText.indexOf('\uAC00\uACA9\uB300') >= 0 || (title && getCleanText(title) === '\uAC00\uACA9')) {
        if (title) title.textContent = '\uAC00\uACA9'
        var priceInput = label.querySelector('[data-restaurant-price-input]')
        if (!priceInput) {
          priceInput = document.createElement('input')
          priceInput.type = 'text'
          priceInput.inputMode = 'numeric'
          priceInput.pattern = '[0-9]*'
          priceInput.name = 'restaurantPrice'
          priceInput.dataset.restaurantPriceInput = 'true'
          priceInput.autocomplete = 'off'
          label.appendChild(priceInput)
          priceInput.addEventListener('input', function () {
            var next = String(priceInput.value || '').replace(/[^\d]/g, '')
            if (priceInput.value !== next) setInputValue(priceInput, next)
          })
        }
        priceInput.removeAttribute('placeholder')
        label.querySelectorAll('.custom-select, select').forEach(function (select) {
          if (!select.contains(priceInput)) hidePatchElement(select)
        })
      }
    })
  }

