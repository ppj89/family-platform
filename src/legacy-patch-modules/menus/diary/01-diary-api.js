  function normalizeDiaryEntryForm() {
    if (!pageHeadingIs('\uC77C\uAE30')) return
    document.querySelectorAll('.diary-form, .entry-panel, form').forEach(function (form) {
      var text = getCleanText(form)
      if (text.indexOf('\uC81C\uBAA9') < 0 && text.indexOf('\uB0B4\uC6A9') < 0) return
      bindVisibleDiarySubmit(form)
      removePlaceholdersIn(form, ['\uC81C\uBAA9', '\uCD5C\uC800 \uC628\uB3C4', '\uCD5C\uACE0 \uC628\uB3C4', '\uB0B4\uC6A9'])
      setDateFieldToToday(form, ['\uB0A0\uC9DC'])
    })
    removeFeaturePlaceholders()
  }

  function bindVisibleDiarySubmit(form) {
    if (!form) return
    if (!form.matches || !form.matches('.diary-form')) return
    var submit = form.querySelector('button[type="submit"], .submit-action')
    var submitDirectly = function (event) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      var panel = form.closest('aside, section, article, .panel, .entry-panel') || form
      submitExistingDiaryPanel(panel, submit)
    }
    if (form.dataset.diaryDirectSubmitBound !== 'true') {
      form.dataset.diaryDirectSubmitBound = 'true'
      form.addEventListener('submit', submitDirectly, true)
    }
    if (submit) {
      var directButton = form.querySelector('[data-diary-direct-submit-button="true"]')
      if (!directButton) {
        directButton = document.createElement('button')
        directButton.type = 'button'
        directButton.className = submit.className || 'submit-action'
        directButton.textContent = submit.textContent || '\uC77C\uAE30 \uCD94\uAC00'
        directButton.dataset.diaryDirectSubmitButton = 'true'
        submit.style.display = 'none'
        submit.parentNode.insertBefore(directButton, submit.nextSibling)
      }
      if (directButton.dataset.diaryDirectClickBound !== 'true') {
        directButton.dataset.diaryDirectClickBound = 'true'
        directButton.addEventListener('pointerdown', submitDirectly, true)
        directButton.addEventListener('mousedown', submitDirectly, true)
        directButton.addEventListener('click', submitDirectly, true)
        directButton.onclick = submitDirectly
      }
    }
  }

  function normalizeBabyEntryForms() {
    if (!pageHeadingIs('\uC721\uC544')) return
    document.querySelectorAll('.baby-form, .baby-create-form, .entry-panel, form').forEach(function (form) {
      var text = getCleanText(form)
      if (text.indexOf('\uC544\uC774') < 0 && text.indexOf('\uC721\uC544') < 0 && text.indexOf('\uD0A4') < 0) return
      removePlaceholdersIn(form, ['\uC544\uC774 \uC774\uB984', '\uC774\uB984', '\uC131\uBCC4', '\uBA54\uBAA8', '\uD0A4', '\uBAB8\uBB34\uAC8C'])
      setDateFieldToToday(form, ['\uC0DD\uC77C', '\uB0A0\uC9DC'])
    })
    removeFeaturePlaceholders()
  }

  function renderDiaryPageFromApi(force) {
    if (!pageHeadingIs('\uC77C\uAE30')) return
    var section = document.querySelector('.diary-section')
    var list = section && section.querySelector('.diary-list')
    if (!section || !list) return
    var range = monthRangeFor(todayText())
    var key = range.start + ':' + range.end
    if (!force && list.dataset.apiRangeKey === key) return
    list.dataset.apiRangeKey = key
    var badge = section.querySelector('.passive-header-chip')
    if (badge) badge.textContent = '0\uAC1C'
    list.innerHTML = emptyRow('\uC77C\uAE30\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.', '')
    fetchDiaries(range.start, range.end).then(function (items) {
      if (badge) badge.textContent = Number(items.length || 0).toLocaleString('ko-KR') + '\uAC1C'
      if (!items.length) {
        list.innerHTML = emptyRow('\uB4F1\uB85D\uB41C \uC77C\uAE30\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
        return
      }
      list.innerHTML = items.map(function (item) {
        var date = item.diaryDate || item.date || ''
        var temp = item.minTemperature || item.maxTemperature
          ? (item.minTemperature || '-') + '/' + (item.maxTemperature || '-') + '\uB3C4'
          : '\uC628\uB3C4 \uBBF8\uC785\uB825'
        return '<div class="diary-list-row api-diary-row" data-api-diary-id="' + escapeHtml(item.id) + '">' +
          '<button class="diary-open-button" type="button" data-api-diary-open="' + escapeHtml(item.id) + '"><div><strong>' + escapeHtml(item.title || '') + '</strong>' +
          '<span>' + escapeHtml([date, item.weather || '\uB0A0\uC528 \uBBF8\uC785\uB825', temp, item.mood || ''].filter(Boolean).join(' \u00B7 ')) + '</span>' +
          '<p>' + escapeHtml(item.body || '') + '</p></div></button></div>'
      }).join('')
      list.querySelectorAll('[data-api-diary-open]').forEach(function (button) {
        button.addEventListener('click', function () {
          var item = items.find(function (entry) { return String(entry.id) === String(button.dataset.apiDiaryOpen) })
          showDiaryDetail(item)
        })
      })
    }).catch(function (error) {
      list.innerHTML = emptyRow(apiActionErrorMessage(error, '\uC77C\uAE30\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.'), '')
    })
  }

  function showDiaryDetail(item) {
    if (!item) {
      showPatchToast('\uC0C1\uC138\uB97C \uBCFC \uC77C\uAE30\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      return
    }
    var old = document.querySelector('.patch-diary-detail-backdrop')
    if (old) old.remove()
    var backdrop = document.createElement('div')
    backdrop.className = 'patch-ledger-detail-backdrop patch-diary-detail-backdrop'
    function renderView() {
      var temp = item.minTemperature || item.maxTemperature
        ? (item.minTemperature || '-') + '/' + (item.maxTemperature || '-') + '\uB3C4'
        : '\uC628\uB3C4 \uBBF8\uC785\uB825'
      backdrop.innerHTML = [
        '<section class="patch-ledger-detail-dialog diary-detail-dialog">',
        '<button type="button" class="dialog-close" data-diary-detail-close>\u00D7</button>',
        '<span class="ledger-detail-chip">\uC77C\uAE30</span>',
        '<h2>' + escapeHtml(item.title || '\uC77C\uAE30') + '</h2>',
        '<dl>',
        '<div><dt>\uB0A0\uC9DC</dt><dd>' + escapeHtml(String(item.diaryDate || item.date || '').replace(/-/g, '.')) + '</dd></div>',
        '<div><dt>\uB0A0\uC528</dt><dd>' + escapeHtml(item.weather || '-') + '</dd></div>',
        '<div><dt>\uAE30\uBD84</dt><dd>' + escapeHtml(item.mood || '-') + '</dd></div>',
        '<div><dt>\uC628\uB3C4</dt><dd>' + escapeHtml(temp) + '</dd></div>',
        '</dl>',
        '<p>' + escapeHtml(item.body || '\uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.') + '</p>',
        '<div class="ledger-detail-actions">',
        '<button type="button" class="edit-button" data-diary-detail-edit>\uC218\uC815</button>',
        '<button type="button" class="danger-button" data-diary-detail-delete>\uC0AD\uC81C</button>',
        '</div>',
        '</section>'
      ].join('')
    }
    function renderEdit() {
      backdrop.innerHTML = [
        '<section class="patch-ledger-detail-dialog diary-detail-dialog diary-detail-edit">',
        '<button type="button" class="dialog-close" data-diary-detail-close>\u00D7</button>',
        '<h2>\uC77C\uAE30 \uC218\uC815</h2>',
        '<label><span>\uC81C\uBAA9</span><input data-diary-edit-title value="' + escapeHtml(item.title || '') + '" /></label>',
        '<label><span>\uB0A0\uC9DC</span><input data-diary-edit-date type="date" value="' + escapeHtml(item.diaryDate || item.date || todayText()) + '" /></label>',
        '<div class="form-row two">',
        '<label><span>\uB0A0\uC528</span><input data-diary-edit-weather value="' + escapeHtml(item.weather || '') + '" /></label>',
        '<label><span>\uAE30\uBD84</span><input data-diary-edit-mood value="' + escapeHtml(item.mood || '') + '" /></label>',
        '</div>',
        '<div class="form-row two">',
        '<label><span>\uCD5C\uC800 \uC628\uB3C4</span><input data-diary-edit-min value="' + escapeHtml(item.minTemperature || '') + '" /></label>',
        '<label><span>\uCD5C\uACE0 \uC628\uB3C4</span><input data-diary-edit-max value="' + escapeHtml(item.maxTemperature || '') + '" /></label>',
        '</div>',
        '<label><span>\uB0B4\uC6A9</span><textarea data-diary-edit-body rows="5">' + escapeHtml(item.body || '') + '</textarea></label>',
        '<div class="ledger-detail-actions">',
        '<button type="button" class="cancel-button" data-diary-detail-view>\uCDE8\uC18C</button>',
        '<button type="button" class="edit-button" data-diary-detail-save>\uC800\uC7A5</button>',
        '</div>',
        '</section>'
      ].join('')
      var first = backdrop.querySelector('[data-diary-edit-title]')
      if (first) first.focus()
    }
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop || event.target.closest('[data-diary-detail-close]')) {
        backdrop.remove()
        return
      }
      if (event.target.closest('[data-diary-detail-edit]')) {
        renderEdit()
        return
      }
      if (event.target.closest('[data-diary-detail-view]')) {
        renderView()
        return
      }
      if (event.target.closest('[data-diary-detail-save]')) {
        var title = getFieldValue(backdrop, '[data-diary-edit-title]')
        var diaryDate = getFieldValue(backdrop, '[data-diary-edit-date]')
        if (!title) {
          showPatchToast('\uC81C\uBAA9\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
          var titleInput = backdrop.querySelector('[data-diary-edit-title]')
          if (titleInput) titleInput.focus()
          return
        }
        if (!diaryDate) {
          showPatchToast('\uB0A0\uC9DC\uB294 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
          var dateInput = backdrop.querySelector('[data-diary-edit-date]')
          if (dateInput) dateInput.focus()
          return
        }
        showPatchConfirm('\uC77C\uAE30\uB97C \uC218\uC815\uD560\uAE4C\uC694?', function () {
          apiRequest('/diaries/' + encodeURIComponent(item.id), {
            method: 'PUT',
            body: JSON.stringify({
              title: title,
              body: getFieldValue(backdrop, '[data-diary-edit-body]'),
              diaryDate: diaryDate,
              weather: getFieldValue(backdrop, '[data-diary-edit-weather]') || null,
              mood: getFieldValue(backdrop, '[data-diary-edit-mood]') || null,
              minTemperature: getFieldValue(backdrop, '[data-diary-edit-min]') || null,
              maxTemperature: getFieldValue(backdrop, '[data-diary-edit-max]') || null,
              mediaUrls: item.mediaUrls || []
            })
          }).then(function (updated) {
            item = updated || item
            showPatchToast('\uC77C\uAE30\uB97C \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.')
            renderDiaryPageFromApi(true)
            renderView()
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uC77C\uAE30 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
        return
      }
      if (event.target.closest('[data-diary-detail-delete]')) {
        showPatchConfirm('\uC77C\uAE30\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
          apiRequest('/diaries/' + encodeURIComponent(item.id), { method: 'DELETE' }).then(function () {
            showPatchToast('\uC77C\uAE30\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
            backdrop.remove()
            renderDiaryPageFromApi(true)
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uC77C\uAE30 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      }
    })
    renderView()
    document.body.appendChild(backdrop)
  }

