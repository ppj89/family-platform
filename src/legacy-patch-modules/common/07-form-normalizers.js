  function setInputValue(input, value) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    if (setter && setter.set) setter.set.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function removePlaceholdersIn(root, labelTexts) {
    if (!root) return
    var labels = Array.from(root.querySelectorAll('label'))
    labels.forEach(function (label) {
      var text = getCleanText(label)
      if (!labelTexts.some(function (target) { return text.indexOf(target) >= 0 })) return
      label.querySelectorAll('input, textarea').forEach(function (field) {
        field.removeAttribute('placeholder')
      })
    })
  }

  function setDateFieldToToday(root, labelTexts) {
    if (!root) return
    var dotToday = formatDotDate(new Date())
    var isoToday = todayText()
    Array.from(root.querySelectorAll('.date-picker-field, label')).forEach(function (field) {
      var text = getCleanText(field)
      if (!labelTexts.some(function (target) { return text.indexOf(target) >= 0 })) return
      var triggerText = field.querySelector('.date-picker-trigger span')
      if (triggerText && (!triggerText.textContent || parseApiDate(triggerText.textContent) === '2026-06-03')) {
        triggerText.textContent = dotToday
      }
      field.querySelectorAll('input').forEach(function (input) {
        var nextValue = input.type === 'date' ? isoToday : dotToday
        if (!input.value || parseApiDate(input.value) === '2026-06-03') setInputValue(input, nextValue)
      })
    })
  }

  function normalizeTimeInputs(root) {
    var scope = root || document
    var now = currentTimeText()
    scope.querySelectorAll('input[type="time"], input[name="recordTime"], [data-field="travel-record-time"]').forEach(function (input) {
      if (!input || input.disabled) return
      if (document.activeElement === input) return
      if (input.matches && input.matches('input[name="recordTime"]')) {
        var value = String(input.value || '').trim()
        if (!value || ((value === '00:00' || value === '14:00') && input.dataset.timeDefaulted !== 'true')) {
          setInputValue(input, now)
          input.dataset.timeDefaulted = 'true'
        } else {
          setInputValue(input, formatClockText(value, ''))
        }
        return
      }
      if (!input.value || ((input.value === '00:00' || input.value === '14:00') && input.dataset.timeDefaulted !== 'true')) {
        setInputValue(input, now)
        input.dataset.timeDefaulted = 'true'
      }
    })
  }

  function formatClockTyping(value) {
    var digits = String(value || '').replace(/\D/g, '').slice(0, 4)
    if (digits.length <= 2) return digits
    return digits.slice(0, 2) + ':' + digits.slice(2)
  }

  function formatClockText(value, fallback) {
    var digits = String(value || '').replace(/\D/g, '').slice(0, 4)
    if (!digits) return fallback || ''
    if (digits.length <= 2) digits += '00'
    if (digits.length === 3) digits = '0' + digits
    var hour = Math.min(23, Number(digits.slice(0, 2)) || 0)
    var minute = Math.min(59, Number(digits.slice(2, 4)) || 0)
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0')
  }

  document.addEventListener('input', function (event) {
    var input = event.target && event.target.closest && event.target.closest('input[name="recordTime"], [data-field="travel-record-time"]')
    if (!input) return
    input.dataset.timeTouched = 'true'
    input.value = String(input.value || '').replace(/[^\d:]/g, '').slice(0, 5)
  }, true)

  document.addEventListener('blur', function (event) {
    var input = event.target && event.target.closest && event.target.closest('input[name="recordTime"], [data-field="travel-record-time"]')
    if (!input) return
    var next = formatClockText(input.value, currentTimeText())
    if (input.value !== next) setInputValue(input, next)
  }, true)

  function clearSampleFieldValues(root) {
    if (!root) return
    root.querySelectorAll('input, textarea').forEach(function (field) {
      var value = String(field.value || '').trim()
      var placeholder = String(field.getAttribute('placeholder') || '')
      if (placeholder.indexOf('\uC608:') >= 0 || placeholder.indexOf('\uD611\uC7AC\uD574\uC218\uC695\uC7A5') >= 0 || placeholder.indexOf('\uC81C\uC8FC\uB3C4') >= 0) {
        field.removeAttribute('placeholder')
      }
      if (value === '24,500' || value === '24500' || value.indexOf('\uD611\uC7AC\uD574\uC218\uC695\uC7A5') >= 0) setInputValue(field, '')
    })
  }

  function removeFeaturePlaceholders(root) {
    var scope = root || document
    scope.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(function (field) {
      if (field.closest('.auth-card, .auth-recovery-dialog, .password-change-dialog')) return
      field.removeAttribute('placeholder')
    })
  }

  function schedulePlaceholderSweep(root) {
    ;[0, 60, 180, 400, 800, 1400, 2400, 3600].forEach(function (delay) {
      window.setTimeout(function () {
        removeFeaturePlaceholders(root || document)
      }, delay)
    })
  }

  function ensureRequiredMarkForInput(input) {
    if (!input) return
    var label = input.closest('label')
    ensureRequiredMarkForLabel(label)
  }

  function ensureRequiredMarkForLabel(label) {
    var title = getLabelTitle(label)
    if (!title || title.querySelector('.required-mark')) return
    var mark = document.createElement('em')
    mark.className = 'required-mark'
    mark.textContent = '*'
    title.appendChild(document.createTextNode(' '))
    title.appendChild(mark)
  }

  function renameLabelTitle(form, fromText, toText) {
    var labels = Array.from(form.querySelectorAll('label'))
    var label = labels.find(function (item) {
      return getLabelText(item) === fromText
    })
    var title = getLabelTitle(label)
    if (title) title.textContent = toText
    return label || null
  }

  function findLabelByText(form, text) {
    return Array.from(form.querySelectorAll('label')).find(function (label) {
      return getLabelText(label) === text
    }) || null
  }

  function normalizeLedgerEntryForm() {
    if (!pageHeadingIs('\uAC00\uACC4\uBD80')) return
    var forms = document.querySelectorAll('.ledger-form, .entry-panel, form')
    forms.forEach(function (form) {
      var text = getCleanText(form)
      if (text.indexOf('\uAC00\uACC4\uBD80') < 0 && text.indexOf('\uAC70\uB798\uC77C') < 0 && text.indexOf('\uAE08\uC561') < 0) return
      renameLabelTitle(form, '\uAC00\uB9F9\uC810/\uB0B4\uC6A9', '\uB0B4\uC6A9')
      renameLabelTitle(form, '\uAC70\uB798\uC77C', '\uB0A0\uC9DC')
      var requiredLedgerLabels = ['\uB0B4\uC6A9', '\uAE08\uC561', '\uB0A0\uC9DC']
      requiredLedgerLabels.forEach(function (labelText) {
        ensureRequiredMarkForLabel(findLabelByText(form, labelText))
      })
      var submit = form.querySelector('button[type="submit"], .submit-action')
      if (submit && !form.dataset.apiLedgerEditId) submit.textContent = '\uCD94\uAC00'
      removePlaceholdersIn(form, ['\uAC00\uB9F9\uC810', '\uB0B4\uC6A9', '\uAE08\uC561'])
      setDateFieldToToday(form, ['\uAC70\uB798\uC77C', '\uB0A0\uC9DC'])
    })
    removeFeaturePlaceholders()
  }

  function removeLedgerManageButton() {
    if (!pageHeadingIs('\uAC00\uACC4\uBD80')) return
    Array.from(document.querySelectorAll('.panel-header')).forEach(function (header) {
      var title = getCleanText(header.querySelector('h2'))
      if (title !== '\uAC00\uACC4\uBD80 \uC870\uD68C') return
      Array.from(header.querySelectorAll('button, .passive-header-chip, [role="button"]')).forEach(function (button) {
        if (getCleanText(button) === '\uB0B4\uC5ED \uAD00\uB9AC') button.remove()
      })
    })
  }

