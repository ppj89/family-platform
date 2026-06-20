  function openBabyProfileEditor(card) {
    var old = document.querySelector('.baby-profile-edit-backdrop')
    if (old) old.remove()

    var nameEl = card.querySelector('strong')
    var metaEl = card.querySelector('span')
    var memoEl = card.querySelector('p')
    var metricEl = card.querySelector('small:last-child') || Array.from(card.querySelectorAll('small')).find(function (item) {
      return getCleanText(item).indexOf('cm') >= 0 || getCleanText(item).indexOf('kg') >= 0
    })
    var metric = getCleanText(metricEl)
    var metricParts = metric.split('\u00B7').map(function (item) { return item.trim() })
    var avatar = card.querySelector('.baby-avatar')
    var currentPhoto = avatar && avatar.querySelector('img') ? avatar.querySelector('img').src : ''
    var nextPhoto = currentPhoto

    var backdrop = document.createElement('div')
    backdrop.className = 'baby-profile-edit-backdrop'
    var dialog = document.createElement('section')
    dialog.className = 'baby-profile-edit-dialog'

    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'dialog-close'
    close.textContent = 'x'
    close.addEventListener('click', function () { backdrop.remove() })

    var title = document.createElement('h2')
    title.textContent = '\uC544\uC774 \uC815\uBCF4 \uC218\uC815'

    function field(label, value, placeholder) {
      var wrap = document.createElement('label')
      var span = document.createElement('span')
      var input = document.createElement('input')
      span.textContent = label
      input.value = value || ''
      input.placeholder = placeholder || ''
      wrap.appendChild(span)
      wrap.appendChild(input)
      return { wrap: wrap, input: input }
    }

    var photoWrap = document.createElement('label')
    photoWrap.className = 'baby-profile-photo-field'
    var photoLabel = document.createElement('span')
    photoLabel.textContent = '\uD504\uB85C\uD544 \uC0AC\uC9C4'
    var photoPreview = document.createElement('div')
    photoPreview.className = 'baby-profile-photo-preview'
    if (currentPhoto) {
      var currentImg = document.createElement('img')
      currentImg.src = currentPhoto
      photoPreview.appendChild(currentImg)
    } else {
      photoPreview.textContent = '\uC0AC\uC9C4'
    }
    var photoInput = document.createElement('input')
    photoInput.type = 'file'
    photoInput.accept = 'image/*'
    photoInput.addEventListener('change', function () {
      var file = photoInput.files && photoInput.files[0]
      if (!file) return
      var reader = new FileReader()
      reader.onload = function () {
        nextPhoto = String(reader.result || '')
        photoPreview.innerHTML = ''
        var img = document.createElement('img')
        img.src = nextPhoto
        photoPreview.appendChild(img)
      }
      reader.readAsDataURL(file)
    })
    photoWrap.appendChild(photoLabel)
    photoWrap.appendChild(photoPreview)
    photoWrap.appendChild(photoInput)

    var nameField = field('\uC774\uB984', getCleanText(nameEl), '\uC608: \uCCAB\uC9F8')
    var metaField = field('\uC131\uBCC4/\uC6D4\uB839', getCleanText(metaEl), '\uC608: \uC5EC\uC544 · 1\uC138 9\uAC1C\uC6D4')
    var memoField = field('\uBA54\uBAA8', getCleanText(memoEl), '\uC608: \uB0AE\uC7A0 \uB9AC\uB4EC \uCCB4\uD06C \uC911')
    var heightField = field('\uD0A4', metricParts.find(function (item) { return item.indexOf('cm') >= 0 }) || '', '\uC608: 89cm')
    var weightField = field('\uBAB8\uBB34\uAC8C', metricParts.find(function (item) { return item.indexOf('kg') >= 0 }) || '', '\uC608: 12.8kg')

    var actions = document.createElement('div')
    actions.className = 'baby-profile-edit-actions'
    var cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'cancel-button'
    cancel.textContent = '\uCDE8\uC18C'
    cancel.addEventListener('click', function () { backdrop.remove() })
    var save = document.createElement('button')
    save.type = 'button'
    save.className = 'save-button'
    save.textContent = '\uC800\uC7A5'
    save.addEventListener('click', function () {
      if (!nameField.input.value.trim()) {
        nameField.input.focus()
        showPatchToast('\uC774\uB984\uC740 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
        return
      }
      if (nameEl) nameEl.textContent = nameField.input.value.trim()
      if (metaEl) metaEl.textContent = metaField.input.value.trim()
      if (memoEl) memoEl.textContent = memoField.input.value.trim()
      if (metricEl) {
        var metrics = [heightField.input.value.trim(), weightField.input.value.trim()].filter(Boolean)
        metricEl.textContent = metrics.join(' · ')
      }
      if (avatar && nextPhoto) {
        avatar.innerHTML = ''
        var savedImg = document.createElement('img')
        savedImg.src = nextPhoto
        avatar.appendChild(savedImg)
        card.dataset.profilePhoto = nextPhoto
      }
      card.dataset.profileEdited = 'true'
      backdrop.remove()
      showPatchToast('\uC544\uC774 \uC815\uBCF4\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
    })
    actions.appendChild(cancel)
    actions.appendChild(save)

    dialog.appendChild(close)
    dialog.appendChild(title)
    dialog.appendChild(photoWrap)
    dialog.appendChild(nameField.wrap)
    dialog.appendChild(metaField.wrap)
    dialog.appendChild(memoField.wrap)
    dialog.appendChild(heightField.wrap)
    dialog.appendChild(weightField.wrap)
    dialog.appendChild(actions)
    backdrop.appendChild(dialog)
    document.body.appendChild(backdrop)
  }

  function enhanceBabyProfileEdit() {
    document.querySelectorAll('.baby-card').forEach(function (card) {
      if (card.dataset.profileEditReady) return
      card.dataset.profileEditReady = 'true'
      var button = card.querySelector('.baby-card-edit-button')
      if (!button) {
        button = document.createElement('button')
        button.type = 'button'
        button.className = 'baby-card-edit-button'
        button.textContent = '\uC218\uC815'
        card.appendChild(button)
      }
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        openBabyProfileEditor(card)
      }, true)
    })
  }

  function openBabyCreateDialog() {
    if (document.querySelector('.baby-profile-edit-backdrop')) return
    var backdrop = document.createElement('div')
    backdrop.className = 'baby-profile-edit-backdrop'
    var dialog = document.createElement('section')
    dialog.className = 'baby-profile-edit-dialog baby-create-dialog'
    dialog.innerHTML = [
      '<button type="button" class="dialog-close">x</button>',
      '<h2>\uC544\uC774 \uCD94\uAC00</h2>',
      '<label><span>\uC774\uB984 <em class="required-mark">*</em></span><input data-baby-create-name maxlength="30" /><small class="field-error" data-baby-create-error="name" hidden></small></label>',
      '<label><span>\uC131\uBCC4 <em class="required-mark">*</em></span><input data-baby-create-gender type="hidden" /><div class="custom-select baby-create-gender-select" data-baby-create-gender-select><button type="button" class="custom-select-trigger" data-baby-create-gender-trigger><span>\uC120\uD0DD</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="custom-select-list" hidden><button type="button" data-baby-create-gender-value="\uB0A8">\uB0A8</button><button type="button" data-baby-create-gender-value="\uC5EC">\uC5EC</button></div></div><small class="field-error" data-baby-create-error="gender" hidden></small></label>',
      '<label class="date-picker-field baby-create-date-field"><span>\uC0DD\uC77C</span><input data-baby-create-birth type="hidden" value="' + todayText() + '" /><button type="button" class="date-picker-trigger baby-create-date-button" data-baby-create-birth-trigger><span>' + todayText().replace(/-/g, '.') + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2v4M16 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></label>',
      '<label><span>\uBA54\uBAA8</span><input data-baby-create-memo /></label>',
      '<label><span>\uD0A4(cm)</span><input data-baby-create-height inputmode="decimal" /></label>',
      '<label><span>\uBAB8\uBB34\uAC8C(kg)</span><input data-baby-create-weight inputmode="decimal" /></label>',
      '<div class="baby-profile-edit-actions"><button type="button" class="cancel-button">\uCDE8\uC18C</button><button type="button" class="save-button">\uC800\uC7A5</button></div>'
    ].join('')
    backdrop.appendChild(dialog)
    document.body.appendChild(backdrop)

    var nameInput = dialog.querySelector('[data-baby-create-name]')
    var closeDialog = function () { backdrop.remove() }
    dialog.querySelector('.dialog-close').addEventListener('click', closeDialog)
    dialog.querySelector('.cancel-button').addEventListener('click', closeDialog)
    if (nameInput) {
      nameInput.addEventListener('input', function () {
        if (String(nameInput.value || '').trim()) hideBabyCreateError(dialog, 'name')
      })
    }
    var birthInput = dialog.querySelector('[data-baby-create-birth]')
    bindBabyCreateGender(dialog)
    bindBabyCreateBirthDate(dialog)
    dialog.querySelector('.save-button').addEventListener('click', function () {
      var name = String(nameInput.value || '').trim()
      var genderInput = dialog.querySelector('[data-baby-create-gender]')
      var gender = String((genderInput && genderInput.value) || '').trim()
      clearBabyCreateErrors(dialog)
      if (!name || !gender) {
        if (!name) setBabyCreateError(dialog, 'name', '\uC774\uB984\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
        if (!gender) setBabyCreateError(dialog, 'gender', '\uC131\uBCC4\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
        var focusTarget = !name ? nameInput : dialog.querySelector('[data-baby-create-gender-trigger]')
        showPatchToast(!name ? '\uC774\uB984\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.' : '\uC131\uBCC4\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
        if (focusTarget) focusTarget.focus()
        return
      }
      var save = dialog.querySelector('.save-button')
      var initialHeight = optionalDecimal(getFieldValue(dialog, '[data-baby-create-height]'))
      var initialWeight = optionalDecimal(getFieldValue(dialog, '[data-baby-create-weight]'))
      save.disabled = true
      save.textContent = '\uC800\uC7A5 \uC911'
      getCurrentFamilyId().then(function (familyId) {
        return postJson('/babies?familyId=' + encodeURIComponent(familyId), {
          name: name,
          gender: gender,
          birthDate: getFieldValue(dialog, '[data-baby-create-birth]') || todayText(),
          memo: getFieldValue(dialog, '[data-baby-create-memo]') || '',
          photoUrl: null,
          latestHeightCm: initialHeight,
          latestWeightKg: initialWeight
        })
      }).then(function (baby) {
        if (!baby || !baby.id || (!initialHeight && !initialWeight)) return baby
        return postJson('/babies/' + encodeURIComponent(baby.id) + '/records', {
          recordType: '\uC131\uC7A5',
          recordDate: todayText(),
          recordTime: currentTimeText(),
          heightCm: initialHeight,
          weightKg: initialWeight,
          memo: '',
          mediaUrls: []
        }).then(function () { return baby })
      }).then(function () {
        closeDialog()
        showPatchToast('\uC544\uC774\uB97C \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.')
        goMenu('\uC721\uC544')
        window.setTimeout(function () {
          renderBabyApiCards(true)
          refreshServerDataViews(true)
        }, 250)
      }).catch(function (error) {
        save.disabled = false
        save.textContent = '\uC800\uC7A5'
        showPatchToast(apiActionErrorMessage(error, '\uC544\uC774 \uCD94\uAC00\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      })
    })
    if (nameInput) nameInput.focus()
  }

  function normalizeBabyCreateDialog() {
    var dialog = document.querySelector('.baby-create-dialog')
    if (!dialog) return
    dialog.querySelectorAll('input, textarea').forEach(function (field) {
      field.removeAttribute('placeholder')
    })
    var birthInput = dialog.querySelector('[data-baby-create-birth]')
    if (birthInput && !birthInput.value) setInputValue(birthInput, todayText())
  }

  function clearBabyCreateErrors(dialog) {
    if (!dialog) return
    dialog.querySelectorAll('[data-baby-create-error]').forEach(function (item) {
      item.hidden = true
      item.textContent = ''
    })
    dialog.querySelectorAll('label.has-field-error').forEach(function (label) {
      label.classList.remove('has-field-error')
      label.removeAttribute('data-error-message')
    })
  }

  function setBabyCreateError(dialog, key, message) {
    var item = dialog && dialog.querySelector('[data-baby-create-error="' + key + '"]')
    if (item) {
      item.textContent = message
      item.hidden = true
    }
    var field = key === 'name'
      ? dialog && dialog.querySelector('[data-baby-create-name]')
      : dialog && dialog.querySelector('[data-baby-create-gender-select]')
    var label = field && field.closest && field.closest('label')
    if (label) {
      label.classList.add('has-field-error')
      label.setAttribute('data-error-message', message)
    }
  }

  function hideBabyCreateError(dialog, key) {
    var item = dialog && dialog.querySelector('[data-baby-create-error="' + key + '"]')
    if (item) {
      item.textContent = ''
      item.hidden = true
    }
    var field = key === 'name'
      ? dialog && dialog.querySelector('[data-baby-create-name]')
      : dialog && dialog.querySelector('[data-baby-create-gender-select]')
    var label = field && field.closest && field.closest('label')
    if (label) {
      label.classList.remove('has-field-error')
      label.removeAttribute('data-error-message')
    }
  }

  function bindBabyCreateGender(dialog) {
    var wrap = dialog && dialog.querySelector('[data-baby-create-gender-select]')
    if (!wrap) return
    var trigger = wrap.querySelector('[data-baby-create-gender-trigger]')
    var list = wrap.querySelector('.custom-select-list')
    var input = dialog.querySelector('[data-baby-create-gender]')
    if (!trigger || !list || !input) return
    trigger.addEventListener('click', function () {
      list.hidden = !list.hidden
      wrap.classList.toggle('open', !list.hidden)
      trigger.classList.toggle('open', !list.hidden)
    })
    list.querySelectorAll('[data-baby-create-gender-value]').forEach(function (button) {
      button.addEventListener('click', function () {
        input.value = button.dataset.babyCreateGenderValue || ''
        var label = trigger.querySelector('span')
        if (label) label.textContent = input.value || '\uC120\uD0DD'
        list.hidden = true
        wrap.classList.remove('open')
        trigger.classList.remove('open')
        hideBabyCreateError(dialog, 'gender')
      })
    })
  }

  function bindBabyCreateBirthDate(dialog) {
    var input = dialog && dialog.querySelector('[data-baby-create-birth]')
    var trigger = dialog && dialog.querySelector('[data-baby-create-birth-trigger]')
    if (!input || !trigger || trigger.dataset.babyBirthReady === 'true') return
    trigger.dataset.babyBirthReady = 'true'
  }

  function toggleCommonDatePopover(input, trigger) {
    var field = trigger && trigger.closest && trigger.closest('.date-picker-field')
    var current = field && field.querySelector('.calendar-popover')
    if (current) {
      current.remove()
      return
    }
    openCommonBirthDatePopover(input, trigger)
  }

  function openCommonBirthDatePopover(input, trigger) {
    document.querySelectorAll('.baby-common-date-popover, .date-picker-field .calendar-popover').forEach(function (old) {
      old.remove()
    })
    var selected = parseApiDate(input.value) || todayText()
    var view = new Date(selected + 'T00:00:00')
    var popover = document.createElement('div')
    popover.className = 'calendar-popover baby-common-date-popover'
    var level = 'day'

    function draw() {
      var year = view.getFullYear()
      var month = view.getMonth()
      var selectedDate = parseApiDate(selected) || todayText()
      var selectedYear = Number(selectedDate.slice(0, 4))
      var selectedMonth = Number(selectedDate.slice(5, 7)) - 1
      var title = level === 'year' ? year + '\uB144' : (level === 'month' ? year + '\uB144' : year + '\uB144 ' + (month + 1) + '\uC6D4')
      var html = '<header class="calendar-header"><button type="button" data-baby-date-prev>&lt;</button><button type="button" class="calendar-title-button" data-baby-date-title><span>' + title + '</span></button><button type="button" data-baby-date-next>&gt;</button></header>'
      html += '<div class="calendar-today-row"><button type="button" data-baby-date-today>\uC624\uB298</button></div>'
      if (level === 'year') {
        var startYear = Math.floor(year / 12) * 12
        html += '<div class="calendar-year-grid">'
        for (var yearIndex = 0; yearIndex < 12; yearIndex += 1) {
          var itemYear = startYear + yearIndex
          html += '<button type="button" class="' + (selectedYear === itemYear ? 'selected' : '') + '" data-baby-year="' + itemYear + '">' + itemYear + '\uB144</button>'
        }
        html += '</div>'
      } else if (level === 'month') {
        html += '<div class="calendar-month-grid">'
        for (var monthIndex = 0; monthIndex < 12; monthIndex += 1) {
          var isSelectedMonth = selectedYear === year && selectedMonth === monthIndex
          html += '<button type="button" class="' + (isSelectedMonth ? 'selected' : '') + '" data-baby-month="' + monthIndex + '">' + (monthIndex + 1) + '\uC6D4</button>'
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
          html += '<button type="button" class="' + classes.join(' ') + '" data-baby-date="' + iso + '">' + day + '</button>'
        }
        html += '</div>'
      }
      popover.innerHTML = html
      if (popover.isConnected) {
        window.setTimeout(function () {
          positionBabyCommonDatePopover(popover, trigger)
        }, 0)
      }
    }

    draw()
    document.body.appendChild(popover)
    positionBabyCommonDatePopover(popover, trigger)
    window.setTimeout(function () {
      positionBabyCommonDatePopover(popover, trigger)
    }, 0)
    function handleCommonDatePopoverAction(event, skipRecentPointer) {
      var target = event.target
      if (!target || !target.closest) return false
      var control = target.closest('[data-baby-date-prev], [data-baby-date-next], [data-baby-date-title], [data-baby-date-today], [data-baby-year], [data-baby-month], [data-baby-date]')
      if (!control) return false
      if (skipRecentPointer && popover.dataset.babyDatePointerAt && Date.now() - Number(popover.dataset.babyDatePointerAt) < 600) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation) event.stopImmediatePropagation()
        return true
      }
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      if (event.type === 'pointerdown') popover.dataset.babyDatePointerAt = String(Date.now())
      if (target.closest('[data-baby-date-prev]')) {
        if (level === 'year') view.setFullYear(view.getFullYear() - 12)
        else if (level === 'month') view.setFullYear(view.getFullYear() - 1)
        else view.setMonth(view.getMonth() - 1)
        draw()
        return true
      }
      if (target.closest('[data-baby-date-next]')) {
        if (level === 'year') view.setFullYear(view.getFullYear() + 12)
        else if (level === 'month') view.setFullYear(view.getFullYear() + 1)
        else view.setMonth(view.getMonth() + 1)
        draw()
        return true
      }
      if (target.closest('[data-baby-date-title]')) {
        if (level === 'day') level = 'month'
        else if (level === 'month') level = 'year'
        draw()
        return true
      }
      if (target.closest('[data-baby-date-today]')) {
        selected = todayText()
        view = new Date(selected + 'T00:00:00')
        level = 'day'
      }
      var yearButton = target.closest('[data-baby-year]')
      if (yearButton) {
        view.setFullYear(Number(yearButton.dataset.babyYear))
        level = 'month'
        draw()
        return true
      }
      var monthButton = target.closest('[data-baby-month]')
      if (monthButton) {
        view.setMonth(Number(monthButton.dataset.babyMonth))
        level = 'day'
        draw()
        return true
      }
      var dayButton = target.closest('[data-baby-date]')
      if (dayButton) selected = dayButton.dataset.babyDate
      if (target.closest('[data-baby-date-today]') || dayButton) {
        setInputValue(input, selected)
        var label = trigger.querySelector('span')
        if (label) label.textContent = selected.replace(/-/g, '.')
        popover.remove()
      }
      return true
    }

    popover.addEventListener('pointerdown', function (event) {
      handleCommonDatePopoverAction(event, false)
    }, true)
    popover.addEventListener('click', function (event) {
      handleCommonDatePopoverAction(event, true)
    }, true)
  }

  function positionBabyCommonDatePopover(popover, trigger) {
    if (!popover || !trigger || !trigger.getBoundingClientRect) return
    var viewport = window.visualViewport || null
    var viewportLeft = viewport ? viewport.offsetLeft : 0
    var viewportTop = viewport ? viewport.offsetTop : 0
    var viewportWidth = viewport ? viewport.width : window.innerWidth
    var viewportHeight = viewport ? viewport.height : window.innerHeight
    var rect = trigger.getBoundingClientRect()
    var width = Math.min(330, Math.max(280, viewportWidth - 32))
    var height = Math.min(popover.scrollHeight || popover.offsetHeight || 360, viewportHeight - 24)
    var belowTop = rect.bottom + 8
    var aboveTop = rect.top - height - 8
    var top = belowTop
    var minTop = viewportTop + 12
    var maxBottom = viewportTop + viewportHeight - 12
    if (belowTop + height > maxBottom && aboveTop >= minTop) {
      top = aboveTop
    } else if (belowTop + height > maxBottom) {
      top = Math.max(minTop, maxBottom - height)
    }
    var minLeft = viewportLeft + 16
    var maxLeft = viewportLeft + viewportWidth - width - 16
    var left = Math.max(minLeft, Math.min(maxLeft, rect.left + rect.width / 2 - width / 2))
    popover.style.setProperty('position', 'fixed', 'important')
    popover.style.setProperty('width', width + 'px', 'important')
    popover.style.setProperty('left', left + 'px', 'important')
    popover.style.setProperty('top', top + 'px', 'important')
  }

  function isBabyCommonDateTarget(target) {
    return !!(target && target.closest && target.closest('.baby-common-date-popover, [data-baby-create-birth-trigger], [data-baby-api-record-date-trigger], [data-baby-growth-date-trigger]'))
  }

  function closeBabyCommonDatePopoverOnOutsideEvent(event) {
    var popover = document.querySelector('.baby-common-date-popover')
    if (!popover) return
    if (isBabyCommonDateTarget(event.target)) return
    popover.remove()
  }

  function handleBabyCreateBirthTrigger(event, skipRecentPointer) {
    var trigger = event.target && event.target.closest && event.target.closest('[data-baby-create-birth-trigger]')
    if (!trigger) return false
    if (skipRecentPointer && trigger.dataset.babyBirthPointerAt && Date.now() - Number(trigger.dataset.babyBirthPointerAt) < 600) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      return true
    }
    var dialog = trigger.closest('.baby-create-dialog')
    var input = dialog && dialog.querySelector('[data-baby-create-birth]')
    if (!input) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (event.type === 'pointerdown') trigger.dataset.babyBirthPointerAt = String(Date.now())
    toggleCommonDatePopover(input, trigger)
    return true
  }

  document.addEventListener('pointerdown', function (event) {
    handleBabyCreateBirthTrigger(event, false)
  }, true)

  document.addEventListener('click', function (event) {
    handleBabyCreateBirthTrigger(event, true)
  }, true)

  document.addEventListener('pointerdown', function (event) {
    var dialog = document.querySelector('.baby-create-dialog')
    if (!dialog) return
    var gender = dialog.querySelector('[data-baby-create-gender-select]')
    if (gender && event.target && !event.target.closest('[data-baby-create-gender-select]')) {
      var list = gender.querySelector('.custom-select-list')
      if (list) list.hidden = true
      gender.classList.remove('open')
    }
    var popover = document.querySelector('.baby-common-date-popover') || dialog.querySelector('.calendar-popover')
    if (!popover) return
    if (event.target && event.target.closest && event.target.closest('.calendar-popover, [data-baby-create-birth-trigger]')) return
    popover.remove()
  }, true)

  function ensureBabyMainActions() {
    if (getCleanText(document.querySelector('.topbar h1')).indexOf('\uC721\uC544') < 0) return
    if (document.querySelector('.baby-detail')) return
    var header = Array.from(document.querySelectorAll('.panel-header')).find(function (item) {
      return getCleanText(item.querySelector('h2')).indexOf('\uC721\uC544') >= 0
    })
    if (!header || header.querySelector('.baby-main-action-bar')) return
    var actions = document.createElement('div')
    actions.className = 'baby-main-action-bar'
    var createButton = document.createElement('button')
    createButton.type = 'button'
    createButton.textContent = '\uC544\uC774 \uCD94\uAC00'
    createButton.addEventListener('click', openBabyCreateDialog)
    actions.appendChild(createButton)
    header.appendChild(actions)
  }

