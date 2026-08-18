  function parseApiDate(value) {
    if (!value) return null
    var match = String(value).match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/)
    if (!match) return null
    return [match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0')].join('-')
  }

  function todayText() {
    return formatDate(new Date())
  }

  function currentTimeText() {
    var now = new Date()
    return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  }

  function resetScheduleCreateFieldsForDate(date) {
    var form = document.querySelector('.schedule-form-card')
    if (!form) return
    if (form.dataset.editingScheduleId || window.__familyEditingScheduleId) {
      clearScheduleFormEditMode(form)
    }
    setInputValueByLabel(form, '\uC77C\uC815\uBA85', '')
    setInputValueByLabel(form, '\uC2DC\uAC04', currentTimeText())
    setInputValueByLabel(form, '\uBA54\uBAA8', '')
    var inputs = Array.from(form.querySelectorAll('input')).filter(function (input) {
      return input.type !== 'hidden' && input.type !== 'file'
    })
    if (inputs[0]) setNativeInputValue(inputs[0], '')
    var timeInput = form.querySelector('input[type="time"]') || inputs.find(function (input) {
      return /time|\d{2}:\d{2}/i.test(String(input.name || '') + ' ' + String(input.value || ''))
    })
    if (timeInput) setNativeInputValue(timeInput, currentTimeText())
    var memo = form.querySelector('textarea')
    if (memo) setNativeInputValue(memo, '')
    if (date) updateScheduleFormVisibleDate(date)
  }

  function ensureScheduleDefaultTime() {
    var form = document.querySelector('.schedule-form-card')
    if (!form || form.dataset.editingScheduleId) return
    var timeInput = setInputValueByLabel(form, '\uC2DC\uAC04', getInputValueByLabel(form, '\uC2DC\uAC04') || currentTimeText())
    if (!timeInput) {
      timeInput = form.querySelector('input[type="time"]')
    }
    if (timeInput && !String(timeInput.value || '').trim()) {
      setNativeInputValue(timeInput, currentTimeText())
    }
  }

  function getFieldValue(root, selector) {
    var field = root.querySelector(selector)
    return field ? String(field.value || field.textContent || '').trim() : ''
  }

  function getCustomSelectValue(label) {
    var labels = Array.from(document.querySelectorAll('.travel-form label, .schedule-form-card label, .ledger-form label, .diary-form label'))
    var target = labels.find(function (item) {
      return getLabelText(item) === label
    })
    if (!target) return ''
    var trigger = target.querySelector('.custom-select-trigger, button')
    return getCleanText(trigger).replace(/\s+/g, ' ').trim()
  }

  function getDatePickerValue(root, labelText) {
    var fields = Array.from(root.querySelectorAll('.date-picker-field'))
    var target = fields.find(function (field) {
      return getLabelText(field) === labelText
    }) || fields[0]
    return parseApiDate(getCleanText(target)) || todayText()
  }

  function parseAmountValue(value) {
    var digits = String(value || '').replace(/[^\d]/g, '')
    return digits ? Number(digits) : 0
  }

  function normalizeScheduleBasis(value) {
    return String(value || '').indexOf('\uC74C') >= 0 ? 'lunar' : 'solar'
  }

  function normalizeScheduleRepeat(value) {
    var text = String(value || '')
    if (text.indexOf('\uB9E4\uC8FC') >= 0 || text.toLowerCase() === 'weekly') return 'weekly'
    if (text.indexOf('\uB9E4\uC6D4') >= 0 || text.toLowerCase() === 'monthly') return 'monthly'
    if (text.indexOf('\uB9E4\uB144') >= 0 || text.indexOf('1\uB144') >= 0 || text.toLowerCase() === 'yearly') return 'yearly'
    return 'none'
  }

  function getInputValueByLabel(root, labelText) {
    var labels = Array.from(root.querySelectorAll('label'))
    var target = labels.find(function (item) {
      return getLabelText(item) === labelText
    })
    var input = target && target.querySelector('input, textarea')
    return input ? String(input.value || '').trim() : ''
  }

  function setInputValueByLabel(root, labelText, value) {
    var labels = Array.from(root.querySelectorAll('label'))
    var target = labels.find(function (item) {
      return getLabelText(item) === labelText
    })
    var input = target && target.querySelector('input, textarea')
    if (input) setNativeInputValue(input, value == null ? '' : String(value))
    return input
  }

  function setCustomSelectValueByLabel(root, labelText, value) {
    var labels = Array.from(root.querySelectorAll('label'))
    var target = labels.find(function (item) {
      return getLabelText(item) === labelText
    })
    if (!target) return
    var text = target.querySelector('.custom-select-trigger span')
    if (text) text.textContent = value || ''
    var native = target.querySelector('select')
    if (native) {
      native.value = value || ''
      native.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  function setScheduleTextInputAt(form, index, value) {
    var inputs = Array.from(form.querySelectorAll('input')).filter(function (input) {
      return input.type !== 'hidden' && input.type !== 'file'
    })
    var input = inputs[index]
    if (input) setNativeInputValue(input, value == null ? '' : String(value))
    return input
  }

  function getScheduleTextInputAt(form, index) {
    var inputs = Array.from(form.querySelectorAll('input, textarea')).filter(function (input) {
      return input.type !== 'hidden' && input.type !== 'file'
    })
    return inputs[index] ? String(inputs[index].value || '').trim() : ''
  }

  function setScheduleSelectTextAt(form, index, value) {
    var triggers = Array.from(form.querySelectorAll('.custom-select-trigger span'))
    if (triggers[index]) triggers[index].textContent = value || ''
  }

  function getScheduleSelectTextAt(form, index) {
    var triggers = Array.from(form.querySelectorAll('.custom-select-trigger span'))
    return triggers[index] ? String(triggers[index].textContent || '').trim() : ''
  }

  function fillScheduleEditForm(form, item) {
    var titleInput = setInputValueByLabel(form, '\uC77C\uC815\uBA85', item.title || '') || setScheduleTextInputAt(form, 0, item.title || '')
    if (titleInput) setNativeInputValue(titleInput, item.title || '')
    var date = parseDate(item.scheduleDate)
    if (date) {
      updateScheduleFormVisibleDate(date)
      updateJumpInput(date)
    }
    var timeText = item.scheduleTime ? String(item.scheduleTime).slice(0, 5) : ''
    var timeInput = setInputValueByLabel(form, '\uC2DC\uAC04', timeText)
    if (!timeInput) {
      var inputs = Array.from(form.querySelectorAll('input')).filter(function (input) {
        return input !== titleInput && input.type !== 'hidden' && input.type !== 'file'
      })
      timeInput = inputs.find(function (input) {
        return input.type === 'time' || /time|\d{2}:\d{2}/i.test(String(input.name || '') + ' ' + String(input.value || ''))
      }) || inputs[1]
      if (timeInput) setNativeInputValue(timeInput, timeText)
    }
    var memoInput = setInputValueByLabel(form, '\uBA54\uBAA8', item.memo || '') || form.querySelector('textarea')
    if (memoInput) setNativeInputValue(memoInput, item.memo || '')

    var basisText = item.calendarBasis === 'lunar' ? '\uC74C\uB825' : '\uC591\uB825'
    var repeatText = item.repeatRule === 'weekly' ? '\uB9E4\uC8FC' : item.repeatRule === 'monthly' ? '\uB9E4\uC6D4' : item.repeatRule === 'yearly' ? '\uB9E4\uB144' : '\uBC18\uBCF5 \uC5C6\uC74C'
    setCustomSelectValueByLabel(form, '\uAE30\uC900', basisText)
    setCustomSelectValueByLabel(form, '\uAD6C\uBD84', item.category || '\uC77C\uC815')
    setCustomSelectValueByLabel(form, '\uAC00\uC871', item.memberName || '')
    setCustomSelectValueByLabel(form, '\uBC18\uBCF5', repeatText)
    setScheduleSelectTextAt(form, 0, basisText)
    setScheduleSelectTextAt(form, 1, item.category || '\uC77C\uC815')
    setScheduleSelectTextAt(form, 2, item.memberName || '')
    setScheduleSelectTextAt(form, 3, repeatText)

    return titleInput || form.querySelector('input, textarea, .date-picker-trigger, .custom-select-trigger')
  }

  function setScheduleFormEditMode(form, item) {
    var scheduleId = resolveScheduleItemId(item)
    form.dataset.editingScheduleId = scheduleId == null ? '' : String(scheduleId)
    window.__familyEditingScheduleId = form.dataset.editingScheduleId
    form.dataset.editingScheduleDate = item.scheduleDate || ''
    form.dataset.editingScheduleOriginalDate = item.scheduleDate || ''
    var heading = form.querySelector('h2, h3')
    if (heading) heading.textContent = '\uC77C\uC815 \uC218\uC815'
    var submit = form.querySelector('button[type="submit"], .submit-action, .fc-submit')
    if (submit) submit.textContent = '\uC800\uC7A5'
    var cancel = form.querySelector('[data-schedule-edit-cancel]')
    if (!cancel && submit && submit.parentElement) {
      cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'cancel-button'
      cancel.dataset.scheduleEditCancel = 'true'
      cancel.textContent = '\uCDE8\uC18C'
      cancel.addEventListener('click', function () {
        clearScheduleFormEditMode(form)
      })
      submit.parentElement.insertBefore(cancel, submit)
    }
  }

  function clearScheduleFormEditMode(form) {
    if (!form) return
    delete form.dataset.editingScheduleId
    delete form.dataset.editingScheduleDate
    delete form.dataset.editingScheduleOriginalDate
    window.__familyEditingScheduleId = ''
    var heading = form.querySelector('h2, h3')
    if (heading) heading.textContent = '\uC77C\uC815 \uCD94\uAC00'
    var submit = form.querySelector('button[type="submit"], .submit-action, .fc-submit')
    if (submit) submit.textContent = '\uCD94\uAC00'
    var cancel = form.querySelector('[data-schedule-edit-cancel]')
    if (cancel) cancel.remove()
  }

  function closeScheduleEditPopups() {
    document.querySelectorAll('.schedule-detail-patch-backdrop, .schedule-day-patch-backdrop, .schedule-item-patch-backdrop').forEach(function (node) {
      node.remove()
    })
  }

  function focusScheduleEditTarget(target, form) {
    var focusTarget = target && target.focus ? target : form.querySelector('input:not([type="hidden"]):not([type="file"]), textarea')
    if (!focusTarget) return
    function focusNow() {
      focusTarget.focus({ preventScroll: true })
      if (document.activeElement !== focusTarget) focusTarget.focus()
      if (focusTarget.select) focusTarget.select()
    }
    focusNow()
    window.requestAnimationFrame(function () {
      focusNow()
      window.setTimeout(focusNow, 220)
    })
  }

  function startScheduleApiEdit(item) {
    item = resolveFullScheduleItem(item)
    var form = document.querySelector('.schedule-form-card')
    if (!form || !item) return
    closeScheduleEditPopups()
    setScheduleFormEditMode(form, item)
    var focusTarget = fillScheduleEditForm(form, item)
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    focusScheduleEditTarget(focusTarget, form)
  }

  function firstInputValue(root) {
    var input = root.querySelector('input')
    return input ? String(input.value || '').trim() : ''
  }

  function syncScheduleForm(form) {
    var title = getInputValueByLabel(form, '\uC77C\uC815\uBA85') || firstInputValue(form)
    if (!title) return

    var timeValue = getInputValueByLabel(form, '\uC2DC\uAC04')
    if (timeValue && !/^\d{2}:\d{2}$/.test(timeValue)) timeValue = null

    queueApiSync({
      type: 'createSchedule',
      payload: {
        title: title,
        calendarBasis: normalizeScheduleBasis(getCustomSelectValue('\uAE30\uC900')),
        scheduleDate: getScheduleFormDateValue(form),
        scheduleTime: timeValue || currentTimeText(),
        category: getCustomSelectValue('\uAD6C\uBD84') || '\uC77C\uC815',
        memberName: getCustomSelectValue('\uAC00\uC871') || null,
        repeatRule: normalizeScheduleRepeat(getCustomSelectValue('\uBC18\uBCF5')),
        memo: getInputValueByLabel(form, '\uBA54\uBAA8') || ''
      }
    })
    flushApiQueue()
  }

  function buildSchedulePayloadFromForm(form) {
    var title = getInputValueByLabel(form, '\uC77C\uC815\uBA85') || firstInputValue(form)
    if (!title) return null
    var timeValue = getInputValueByLabel(form, '\uC2DC\uAC04') || getScheduleTextInputAt(form, 1)
    if (timeValue && !/^\d{2}:\d{2}$/.test(timeValue)) timeValue = null
    var memoValue = getInputValueByLabel(form, '\uBA54\uBAA8') || (form.querySelector('textarea') ? String(form.querySelector('textarea').value || '').trim() : '')
    return {
      title: title,
      calendarBasis: normalizeScheduleBasis(getCustomSelectValue('\uAE30\uC900') || getScheduleSelectTextAt(form, 0)),
      scheduleDate: getScheduleFormDateValue(form),
      scheduleTime: timeValue || currentTimeText(),
      category: getCustomSelectValue('\uAD6C\uBD84') || getScheduleSelectTextAt(form, 1) || '\uC77C\uC815',
      memberName: getCustomSelectValue('\uAC00\uC871') || getScheduleSelectTextAt(form, 2) || null,
      repeatRule: normalizeScheduleRepeat(getCustomSelectValue('\uBC18\uBCF5') || getScheduleSelectTextAt(form, 3)),
      memo: memoValue
    }
  }

  function submitScheduleFormDirect(form) {
    if (!form || form.dataset.scheduleSubmitting === 'true') return
    var payload = buildSchedulePayloadFromForm(form)
    var titleInput = form.querySelector('input')
    var editingId = form.dataset.editingScheduleId || window.__familyEditingScheduleId || ''
    if (editingId && !findScheduleItemById(editingId)) {
      clearScheduleFormEditMode(form)
      editingId = ''
    }
    if (!payload) {
      if (titleInput) titleInput.focus()
      showPatchToast('\uC77C\uC815\uBA85\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.')
      return
    }
    if (editingId && form.dataset.scheduleEditConfirmed !== 'true') {
      showPatchConfirm('\uC77C\uC815\uC744 \uC800\uC7A5\uD560\uAE4C\uC694?', function () {
        form.dataset.scheduleEditConfirmed = 'true'
        submitScheduleFormDirect(form)
      })
      return
    }
    form.dataset.scheduleSubmitting = 'true'
    var request = editingId
      ? updateScheduleApiItem(editingId, payload)
      : postScheduleWithFreshFamily(payload, false)
    return request.catch(function (error) {
      if (editingId) throw error
      localStorage.removeItem(API_FAMILY_ID_KEY)
      return postScheduleWithFreshFamily(payload, true).catch(function (retryError) {
        retryError.__firstScheduleError = error
        throw retryError
      })
    }).then(function () {
      calendarScheduleCache.key = ''
      calendarScheduleCache.items = []
      calendarScheduleCache.loadedAt = 0
      window.__familyYearScheduleCache = null
      window.__familyYearMonthListState = null
      showPatchToast(editingId ? '\uC77C\uC815\uC774 \uC218\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : '\uC77C\uC815\uC774 \uCD94\uAC00\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
      var date = parseDate(payload.scheduleDate)
      if (date) {
        updateScheduleFormVisibleDate(date)
        updateSelectedDayPanel(date)
        updateJumpInput(date)
      }
      refreshServerDataViews(true)
      renderCalendarApiSchedules(true)
      loadScheduleNotifications(true)
      if (titleInput) {
        titleInput.value = ''
        titleInput.dispatchEvent(new Event('input', { bubbles: true }))
      }
      clearScheduleFormEditMode(form)
    }).catch(function (error) {
      window.__familyLastScheduleSaveError = String(error && error.message ? error.message : error)
      if (window.console && console.warn) console.warn('schedule save failed', error)
      showPatchToast(apiActionErrorMessage(error, editingId ? '\uC77C\uC815 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.' : '\uC77C\uC815 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
    }).finally(function () {
      delete form.dataset.scheduleSubmitting
      delete form.dataset.scheduleEditConfirmed
    })
  }

  function normalizeLedgerType(value) {
    var text = String(value || '')
    return text.indexOf('\uC218\uC785') >= 0 || text.toLowerCase() === 'income' ? 'income' : 'expense'
  }

  function syncLedgerForm(form) {
    window.setTimeout(function () {
      if (!isLedgerEntryForm(form)) return
      submitLedgerCreate(form)
    }, 450)
  }

