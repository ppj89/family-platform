  function fetchRestaurants() {
    return getReadableFamilyId().then(function (familyId) {
      return apiRequest('/restaurants?familyId=' + encodeURIComponent(familyId)).then(function (items) {
        return Array.isArray(items) ? items : []
      })
    })
  }

  function restaurantPayloadFromForm(form) {
    return {
      name: getFieldValue(form, '[data-restaurant-name]'),
      menu: getFieldValue(form, '[data-restaurant-menu]') || null,
      price: parseAmountValue(getFieldValue(form, '[data-restaurant-price]')) || null,
      rating: Number(getFieldValue(form, '[data-restaurant-rating]')) || null,
      visitDate: getFieldValue(form, '[data-restaurant-visit-date]') || todayText(),
      location: getFieldValue(form, '[data-restaurant-location]') || null,
      address: getFieldValue(form, '[data-restaurant-address]') || null,
      latitude: Number(form.dataset.latitude || '') || null,
      longitude: Number(form.dataset.longitude || '') || null,
      scope: getFieldValue(form, '[data-restaurant-scope]') || '\uC804\uCCB4 \uAC00\uC871',
      memo: getFieldValue(form, '[data-restaurant-memo]') || null,
      mediaUrls: []
    }
  }

  function clearRestaurantForm(form) {
    if (!form) return
    form.dataset.editId = ''
    form.querySelectorAll('input, textarea').forEach(function (input) {
      if (input.matches('[data-restaurant-visit-date]')) setOptionalInputValue(input, todayText())
      else setOptionalInputValue(input, '')
    })
    var scope = form.querySelector('[data-restaurant-scope]')
    if (scope) setOptionalInputValue(scope, '\uC804\uCCB4 \uAC00\uC871')
    var submit = form.querySelector('button[type="submit"]')
    if (submit) submit.textContent = '\uCD94\uAC00'
  }

  function fillRestaurantForm(form, item) {
    if (!form || !item) return
    form.dataset.editId = String(item.id || '')
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
    var submit = form.querySelector('button[type="submit"]')
    if (submit) submit.textContent = '\uC800\uC7A5'
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    var first = form.querySelector('[data-restaurant-name]')
    if (first) window.setTimeout(function () { first.focus() }, 180)
  }

  function renderRestaurantRows(root, items) {
    var list = root.querySelector('[data-restaurant-list]')
    root.querySelectorAll('[data-restaurant-count]').forEach(function (count) {
      count.textContent = (items || []).length + '\uACF3'
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
        '<section class="panel restaurant-api-panel">',
        '<div class="panel-header"><h2>\uB9DB\uC9D1</h2><span class="passive-header-chip" data-restaurant-count>0\uACF3</span></div>',
        '<div class="restaurant-hero"><div><span>\uBC29\uBB38\uD55C \uACF3</span><strong>\uAC00\uC871\uACFC \uD568\uAED8 \uAE30\uB85D\uD55C \uB9DB\uC9D1</strong></div><b data-restaurant-count>0\uACF3</b></div>',
        '<div class="restaurant-grid restaurant-api-list" data-restaurant-list></div>',
        '</section>',
        '<aside class="panel entry-panel restaurant-api-form-panel">',
        '<div class="panel-header"><h2>\uB9DB\uC9D1 \uCD94\uAC00</h2></div>',
        '<form class="restaurant-form restaurant-api-form" data-restaurant-form>',
        '<label class="form-field"><span class="form-label">\uC0C1\uD638\uBA85 <em class="required-mark">*</em></span><input class="form-control" data-restaurant-name autocomplete="off" /></label>',
        '<label class="form-field"><span class="form-label">\uB300\uD45C \uBA54\uB274</span><input class="form-control" data-restaurant-menu autocomplete="off" /></label>',
        '<div class="form-row two"><label class="form-field"><span class="form-label">\uAC00\uACA9</span><input class="form-control" data-restaurant-price inputmode="numeric" autocomplete="off" /></label><label class="form-field"><span class="form-label">\uBCC4\uC810</span><input class="form-control" data-restaurant-rating inputmode="decimal" autocomplete="off" /></label></div>',
        '<label class="form-field"><span class="form-label">\uBC29\uBB38\uC77C <em class="required-mark">*</em></span><input class="form-control" data-restaurant-visit-date type="date" value="' + todayText() + '" /></label>',
        '<label class="form-field"><span class="form-label">\uC704\uCE58</span><input class="form-control" data-restaurant-location autocomplete="off" /></label>',
        '<label class="form-field"><span class="form-label">\uC8FC\uC18C</span><input class="form-control" data-restaurant-address autocomplete="off" /></label>',
        '<label class="form-field"><span class="form-label">\uACF5\uAC1C\uBC94\uC704</span><input class="form-control" data-restaurant-scope value="\uC804\uCCB4 \uAC00\uC871" autocomplete="off" /></label>',
        '<label class="form-field"><span class="form-label">\uBA54\uBAA8</span><textarea class="form-control" data-restaurant-memo rows="4"></textarea></label>',
        '<div class="form-actions"><button type="button" class="cancel-button" data-restaurant-reset>\uCD08\uAE30\uD654</button><button type="submit" class="save-button">\uCD94\uAC00</button></div>',
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
          request().then(function () {
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
    }
    syncRestaurantMenuState()
    loadRestaurantApiPage(content, false)
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

