  function ensureDiaryMainActions() {
    if (getCleanText(document.querySelector('.topbar h1')).indexOf('\uC77C\uAE30') < 0) return
    if (document.querySelector('.diary-detail-card')) return
    var header = Array.from(document.querySelectorAll('.panel-header')).find(function (item) {
      return getCleanText(item.querySelector('h2')) === '\uC77C\uAE30'
    }) || Array.from(document.querySelectorAll('.panel-header')).find(function (item) {
      var heading = getCleanText(item.querySelector('h2'))
      return heading.indexOf('\uC77C\uAE30') >= 0 && heading.indexOf('\uCD94\uAC00') < 0
    })
    if (!header || header.querySelector('.diary-main-action-bar')) return
    var actions = document.createElement('div')
    actions.className = 'diary-main-action-bar'
    var createButton = document.createElement('button')
    createButton.type = 'button'
    createButton.dataset.diaryOpenComposer = 'true'
    createButton.textContent = '\uC77C\uAE30 \uCD94\uAC00'
    createButton.addEventListener('click', function () {
      var form = ensureDiaryApiComposer()
      var target = form && (form.closest('form, .panel, aside') || form)
      if (!target) {
        showPatchToast('\uC77C\uAE30 \uC785\uB825 \uC601\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.')
        return
      }
      target.classList.add('diary-api-composer-open')
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      var input = target.querySelector('[data-field="diary-title"], input, textarea')
      if (input) window.setTimeout(function () { input.focus() }, 180)
    })
    actions.appendChild(createButton)
    header.appendChild(actions)
  }

  function ensureDiaryApiComposer() {
    if (getCleanText(document.querySelector('.topbar h1')).indexOf('\uC77C\uAE30') < 0) return null
    var entryForm = document.querySelector('.entry-panel .diary-form')
    if (entryForm && entryForm.getClientRects && entryForm.getClientRects().length) {
      document.querySelectorAll('.diary-api-composer').forEach(function (panel) {
        panel.remove()
      })
      return entryForm
    }
    var existing = document.querySelector('.diary-api-composer')
    if (existing) return existing
    var diaryPanel = Array.from(document.querySelectorAll('.panel, article, section')).find(function (item) {
      var heading = item.querySelector('h2')
      return heading && getCleanText(heading) === '\uC77C\uAE30'
    })
    var targetParent = diaryPanel && diaryPanel.parentElement
      ? diaryPanel.parentElement
      : (document.querySelector('.content-grid') || document.querySelector('main'))
    if (!targetParent) return null
    var panel = document.createElement('section')
    panel.className = 'panel wide full-span diary-api-composer diary-form'
    panel.innerHTML = [
      '<div class="panel-header"><div><h2>\uC77C\uAE30 \uCD94\uAC00</h2></div></div>',
      '<form class="ledger-form">',
      '<label><span>\uC81C\uBAA9</span><input data-diary-create-title maxlength="80" /></label>',
      '<label class="date-picker-field diary-create-date-field"><span>\uB0A0\uC9DC</span><input data-diary-create-date type="hidden" value="' + todayText() + '" /><button type="button" class="date-picker-trigger diary-create-date-button" data-diary-create-date-trigger><span>' + todayText().replace(/-/g, '.') + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2v4M16 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></label>',
      '<div class="form-row">',
      '<label><span>\uB0A0\uC528</span><input data-diary-create-weather maxlength="30" /></label>',
      '<label><span>\uAE30\uBD84</span><input data-diary-create-mood maxlength="30" /></label>',
      '</div>',
      '<label><span>\uB0B4\uC6A9</span><textarea data-diary-create-content rows="5"></textarea></label>',
      '<button class="submit-action" type="submit">\uC800\uC7A5</button>',
      '</form>'
    ].join('')
    bindDiaryCreateDate(panel)
    panel.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault()
      var title = getFieldValue(panel, '[data-diary-create-title]')
      var content = getFieldValue(panel, '[data-diary-create-content]')
      if (!title) {
        showPatchToast('\uC81C\uBAA9\uC740 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
        panel.querySelector('[data-diary-create-title]').focus()
        return
      }
      var button = panel.querySelector('.submit-action')
      button.disabled = true
      button.textContent = '\uC800\uC7A5 \uC911'
      getReadableFamilyId().then(function (familyId) {
        return postJson('/diaries?familyId=' + encodeURIComponent(familyId), {
          title: title,
          body: content,
          diaryDate: getFieldValue(panel, '[data-diary-create-date]') || todayText(),
          weather: getFieldValue(panel, '[data-diary-create-weather]') || null,
          mood: getFieldValue(panel, '[data-diary-create-mood]') || null,
          mediaUrls: []
        })
      }).then(function () {
        showPatchToast('\uC77C\uAE30\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
        panel.querySelector('form').reset()
        panel.querySelector('[data-diary-create-date]').value = todayText()
        var dateLabel = panel.querySelector('[data-diary-create-date-trigger] span')
        if (dateLabel) dateLabel.textContent = todayText().replace(/-/g, '.')
        button.disabled = false
        button.textContent = '\uC800\uC7A5'
        refreshServerDataViews(true)
      }).catch(function (error) {
        button.disabled = false
        button.textContent = '\uC800\uC7A5'
        showPatchToast(apiActionErrorMessage(error, '\uC77C\uAE30 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      })
    })
    if (diaryPanel && diaryPanel.nextSibling) targetParent.insertBefore(panel, diaryPanel.nextSibling)
    else targetParent.appendChild(panel)
    removeFeaturePlaceholders(panel)
    return panel
  }

  function bindDiaryCreateDate(panel) {
    var input = panel && panel.querySelector('[data-diary-create-date]')
    var trigger = panel && panel.querySelector('[data-diary-create-date-trigger]')
    if (!input || !trigger || trigger.dataset.diaryDateBound === 'true') return
    trigger.dataset.diaryDateBound = 'true'
    trigger.addEventListener('click', function () {
      openDiaryCreateDatePopover(input, trigger)
    })
  }

  function openDiaryCreateDatePopover(input, trigger) {
    var old = document.querySelector('.diary-api-composer .calendar-popover')
    if (old) old.remove()
    var selected = parseApiDate(input.value) || todayText()
    var view = new Date(selected + 'T00:00:00')
    var popover = document.createElement('div')
    popover.className = 'calendar-popover diary-create-calendar-popover'

    function draw() {
      var year = view.getFullYear()
      var month = view.getMonth()
      var first = new Date(year, month, 1)
      var last = new Date(year, month + 1, 0).getDate()
      var html = '<header class="calendar-header"><button type="button" data-diary-date-prev>&lt;</button><strong>' + year + '\uB144 ' + (month + 1) + '\uC6D4</strong><button type="button" data-diary-date-next>&gt;</button></header>'
      html += '<div class="calendar-today-row"><button type="button" data-diary-date-today>\uC624\uB298</button></div>'
      html += '<div class="calendar-weekdays"><span>\uC77C</span><span>\uC6D4</span><span>\uD654</span><span>\uC218</span><span>\uBAA9</span><span>\uAE08</span><span>\uD1A0</span></div><div class="calendar-day-grid">'
      for (var blank = 0; blank < first.getDay(); blank += 1) html += '<span class="calendar-empty"></span>'
      for (var day = 1; day <= last; day += 1) {
        var date = new Date(year, month, day)
        var iso = formatDate(date)
        var classes = []
        if (date.getDay() === 0) classes.push('holiday')
        if (date.getDay() === 6) classes.push('saturday')
        if (iso === selected) classes.push('selected')
        html += '<button type="button" class="' + classes.join(' ') + '" data-diary-date="' + iso + '">' + day + '</button>'
      }
      popover.innerHTML = html + '</div>'
    }

    draw()
    trigger.insertAdjacentElement('afterend', popover)
    popover.addEventListener('click', function (event) {
      var target = event.target
      if (!target || !target.closest) return
      if (target.closest('[data-diary-date-prev]')) {
        view.setMonth(view.getMonth() - 1)
        draw()
        return
      }
      if (target.closest('[data-diary-date-next]')) {
        view.setMonth(view.getMonth() + 1)
        draw()
        return
      }
      if (target.closest('[data-diary-date-today]')) selected = todayText()
      var dayButton = target.closest('[data-diary-date]')
      if (dayButton) selected = dayButton.dataset.diaryDate
      if (target.closest('[data-diary-date-today]') || dayButton) {
        setInputValue(input, selected)
        var label = trigger.querySelector('span')
        if (label) label.textContent = selected.replace(/-/g, '.')
        popover.remove()
      }
    })
  }

  function getControlValueByLabel(root, labelText) {
    var labels = Array.from(root.querySelectorAll('label'))
    var target = labels.find(function (item) {
      return getCleanText(item.querySelector('span')) === labelText
    })
    if (!target) return ''
    var control = target.querySelector('input, textarea, .custom-select-trigger, .date-picker-trigger, button')
    return control ? getCleanText(control) || String(control.value || '').trim() : ''
  }

  function submitExistingDiaryPanel(panel, submitButton) {
    if (!panel || panel.dataset.diaryPanelSubmitting === 'true') return
    var title = getInputValueByLabel(panel, '\uC81C\uBAA9') || getFieldValue(panel, 'form.diary-form input') || getFieldValue(panel, 'input')
    var body = getInputValueByLabel(panel, '\uB0B4\uC6A9') || getFieldValue(panel, 'form.diary-form textarea') || getFieldValue(panel, 'textarea')
    if (!title) {
      showPatchToast('\uC81C\uBAA9\uC740 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
      var titleField = panel.querySelector('label input, input')
      if (titleField) titleField.focus()
      return
    }
    panel.dataset.diaryPanelSubmitting = 'true'
    if (submitButton) submitButton.disabled = true
    getReadableFamilyId().then(function (familyId) {
      return postJson('/diaries?familyId=' + encodeURIComponent(familyId), {
        title: title,
        body: body,
        diaryDate: getDatePickerValue(panel, '\uB0A0\uC9DC') || todayText(),
        weather: getControlValueByLabel(panel, '\uB0A0\uC528') || null,
        mood: getControlValueByLabel(panel, '\uAE30\uBD84') || null,
        minTemperature: optionalInteger(getInputValueByLabel(panel, '\uCD5C\uC800 \uC628\uB3C4')),
        maxTemperature: optionalInteger(getInputValueByLabel(panel, '\uCD5C\uACE0 \uC628\uB3C4')),
        mediaUrls: []
      })
    }).then(function () {
      showPatchToast('\uC77C\uAE30\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
      panel.querySelectorAll('input, textarea').forEach(function (field) {
        if (field.type !== 'hidden') setNativeInputValue(field, '')
      })
      renderDiaryPageFromApi(true)
      refreshServerDataViews(true)
    }).catch(function (error) {
      showPatchToast(apiActionErrorMessage(error, '\uC77C\uAE30 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
    }).finally(function () {
      delete panel.dataset.diaryPanelSubmitting
      if (submitButton) submitButton.disabled = false
    })
  }

