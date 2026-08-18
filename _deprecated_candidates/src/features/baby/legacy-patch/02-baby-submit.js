  function resetBabyApiRecordForm(form) {
    if (!form) return
    form.reset()
    var date = form.querySelector('[name="recordDate"]')
    var time = form.querySelector('[name="recordTime"]')
    if (date) {
      date.value = todayText()
      var triggerText = form.querySelector('[data-baby-api-record-date-trigger] span')
      if (triggerText) triggerText.textContent = todayText().replace(/-/g, '.')
    }
    if (time) time.value = currentTimeText()
    var type = form.querySelector('[name="recordType"]')
    var typeText = form.querySelector('[data-baby-record-type-trigger] span')
    if (type) type.value = '\uC218\uC720'
    if (typeText) typeText.textContent = '\uC218\uC720'
    var hint = form.querySelector('.baby-api-file-field small')
    if (hint) hint.textContent = mediaLimitText()
  }

  function submitBabyApiRecordForm(form) {
    if (!form || form.dataset.submitting === 'true') return
    var type = getFieldValue(form, '[name="recordType"]')
    var date = getFieldValue(form, '[name="recordDate"]')
    if (!type) {
      var typeField = form.querySelector('[name="recordType"]')
      if (typeField) typeField.focus()
      showPatchToast('\uAE30\uB85D\uC885\uB958\uB294 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
      return
    }
    if (!date) {
      var dateField = form.querySelector('[data-baby-api-record-date-trigger]') || form.querySelector('[name="recordDate"]')
      if (dateField) dateField.focus()
      showPatchToast('\uB0A0\uC9DC\uB294 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
      return
    }

    form.dataset.submitting = 'true'
    setBabyApiRecordBusy(form, true)
    var fileInput = form.querySelector('[name="files"]')
    uploadMediaFiles(fileInput).then(function (files) {
      return ensureApiBabyForDetail().then(function (babyId) {
        return postJson('/babies/' + encodeURIComponent(babyId) + '/records', {
          recordType: type,
          recordDate: date,
          recordTime: formatClockText(getFieldValue(form, '[name="recordTime"]'), '') || null,
          amountMl: optionalInteger(getFieldValue(form, '[name="amountMl"]')),
          heightCm: optionalDecimal(getFieldValue(form, '[name="heightCm"]')),
          weightKg: optionalDecimal(getFieldValue(form, '[name="weightKg"]')),
          memo: getFieldValue(form, '[name="memo"]') || '',
          mediaUrls: communityMediaUrls(files)
        })
      })
    }).then(function () {
      var detail = form.closest('.baby-api-detail')
      var babyId = detail && detail.dataset.apiBabyId
      resetBabyApiRecordForm(form)
      if (detail && babyId) {
        renderBabyApiRecordRows(detail, babyId)
        renderBabyGrowthHistory(detail, babyId)
        var grid = document.querySelector('.baby-list-grid')
        if (grid) delete grid.dataset.apiLoaded
      } else {
        refreshServerDataViews(true)
      }
      showPatchToast('\uC721\uC544 \uAE30\uB85D\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
    }).catch(function (error) {
      if (String(error && error.message || '').indexOf('INVALID_MEDIA') < 0) {
        showPatchToast(apiActionErrorMessage(error, '\uC721\uC544 \uAE30\uB85D \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      }
    }).finally(function () {
      delete form.dataset.submitting
      setBabyApiRecordBusy(form, false)
    })
  }

  document.addEventListener('click', function (event) {
    var tripButton = event.target && event.target.closest && event.target.closest('.trip-add-row .submit-action')
    if (tripButton) {
      event.preventDefault()
      syncTripAddRow(tripButton.closest('.trip-add-row'))
    }
  }, true)

  document.addEventListener('submit', function (event) {
    var tripRow = event.target && event.target.closest && event.target.closest('.trip-add-row')
    if (!tripRow) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    syncTripAddRow(tripRow)
  }, true)

  document.addEventListener('submit', function (event) {
    var travelForm = event.target && event.target.closest && event.target.closest('.travel-form')
    if (travelForm && travelForm.classList.contains('api-travel-record-form')) {
      event.preventDefault()
      event.stopPropagation()
      syncTravelForm(travelForm)
      return
    }
    if (travelForm) syncTravelForm(travelForm)
  }, true)

  document.addEventListener('submit', function (event) {
    var ledgerForm = event.target && event.target.closest && event.target.closest('.ledger-form, .entry-panel')
    if (!ledgerForm) return
    if (!isLedgerEntryForm(ledgerForm)) return
    if (getLedgerEditId(ledgerForm)) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      submitLedgerEdit(ledgerForm)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitLedgerCreate(ledgerForm)
  }, true)

  document.addEventListener('click', function (event) {
    var editButton = event.target && event.target.closest && event.target.closest('[data-ledger-edit-id]')
    var deleteButton = event.target && event.target.closest && event.target.closest('[data-ledger-delete-id]')
    if (!editButton && !deleteButton) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (editButton) {
      resolveLedgerItemForDetail(editButton.dataset.ledgerEditId).then(function (item) {
        if (!fillLedgerFormForEdit(item)) showPatchToast('\uC218\uC815\uD560 \uB300\uC0C1\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      })
      return
    }
    deleteLedgerEntry(deleteButton.dataset.ledgerDeleteId)
  }, true)

  document.addEventListener('click', function (event) {
    var row = event.target && event.target.closest && event.target.closest('.api-ledger-row[data-api-ledger-id]')
    if (!row || event.target.closest('button, a, input, textarea, select, .custom-select')) return
    resolveLedgerItemForDetail(row.dataset.apiLedgerId).then(showLedgerDetail)
  }, true)

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('.ledger-form button[type="submit"], .ledger-form .submit-action, .entry-panel button[type="submit"], .entry-panel .submit-action')
    if (!button) return
    var form = button.closest('.ledger-form, .entry-panel')
    if (!form || !isLedgerEntryForm(form)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (getLedgerEditId(form)) submitLedgerEdit(form)
    else submitLedgerCreate(form)
  }, true)

  document.addEventListener('submit', function (event) {
    var diaryForm = event.target && event.target.closest && event.target.closest('.diary-form')
    if (diaryForm) syncDiaryForm(diaryForm)
  }, true)

