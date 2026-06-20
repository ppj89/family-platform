  function formatLedgerDateLabel(dateText) {
    if (!dateText) return '\uB0A0\uC9DC \uBBF8\uC815'
    return new Date(dateText + 'T00:00:00').toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    })
  }

  function storeLedgerItemForDetail(item) {
    if (!item || item.id == null) return
    window.__familyLedgerItemsById = window.__familyLedgerItemsById || {}
    window.__familyLedgerItemsById[String(item.id)] = item
  }

  function resolveLedgerItemForDetail(entryId) {
    var id = String(entryId || '')
    if (!id) return Promise.resolve(null)
    var cached = window.__familyLedgerItemsById && window.__familyLedgerItemsById[id]
    if (cached) return Promise.resolve(cached)
    var range = getLedgerPageRange()
    return fetchLedgerEntries(range.start, range.end).then(function (items) {
      ;(items || []).forEach(storeLedgerItemForDetail)
      return (window.__familyLedgerItemsById && window.__familyLedgerItemsById[id]) || null
    })
  }

  function getLedgerPageRange() {
    var text = getCleanText(document.querySelector('.filter-panel'))
    var monthMatch = text.match(/(\d{4})\uB144\s*(\d{1,2})\uC6D4/)
    if (monthMatch) {
      var monthDate = monthMatch[1] + '-' + String(Number(monthMatch[2])).padStart(2, '0') + '-01'
      return monthRangeFor(monthDate)
    }
    return monthRangeFor(todayText())
  }

  function getLedgerListHost() {
    var existing = document.querySelector('.daily-ledger')
    if (existing) return existing
    var panel = Array.from(document.querySelectorAll('.content-grid .panel.wide, .content-grid .panel')).find(function (candidate) {
      return candidate.querySelector('.ledger-summary') && (candidate.querySelector('.sms-parser') || candidate.querySelector('.parser-box'))
    })
    if (!panel) return null
    var host = panel.querySelector('.api-ledger-list-host')
    if (!host) {
      host = document.createElement('section')
      host.className = 'daily-ledger api-ledger-list-host'
      var empty = panel.querySelector('.empty-message')
      if (empty) {
        empty.replaceWith(host)
      } else {
        var message = panel.querySelector('.form-message') || panel.querySelector('.sms-parser') || panel.querySelector('.parser-box')
        if (message) message.insertAdjacentElement('afterend', host)
        else panel.appendChild(host)
      }
    }
    return host
  }

  function pageHeadingIs(label) {
    return Array.from(document.querySelectorAll('h1')).some(function (heading) {
      return getCleanText(heading) === label
    })
  }

  function renderLedgerPageFromApi(force) {
    if (!pageHeadingIs('\uAC00\uACC4\uBD80')) return
    var summary = document.querySelector('.ledger-summary')
    var daily = getLedgerListHost()
    if (!summary && !daily) return
    var range = getLedgerPageRange()
    var key = range.start + ':' + range.end
    if (daily && daily.dataset.apiLoading === 'true' && daily.dataset.apiPendingKey === key) return
    if (!force && daily && daily.dataset.apiRangeKey === key && (!summary || summary.dataset.apiRangeKey === key)) return
    var requestSeq = ++ledgerPageRequestSeq
    if (daily) {
      daily.dataset.apiLoading = 'true'
      daily.dataset.apiPendingKey = key
    }
    if (summary) summary.dataset.apiPendingKey = key

    fetchLedgerSummary(range.start, range.end).then(function (values) {
      if (requestSeq !== ledgerPageRequestSeq) return
      if (!pageHeadingIs('\uAC00\uACC4\uBD80')) return
      if (summary && summary.dataset.apiPendingKey !== key) return
      var cards = summary ? Array.from(summary.querySelectorAll('.metric strong')) : []
      setMetricValue(cards[0] && cards[0].closest('.metric'), Number(values.expense || 0).toLocaleString('ko-KR') + '\uC6D0')
      setMetricValue(cards[1] && cards[1].closest('.metric'), Number(values.income || 0).toLocaleString('ko-KR') + '\uC6D0')
      setMetricValue(cards[2] && cards[2].closest('.metric'), Number(values.total || 0).toLocaleString('ko-KR') + '\uC6D0')
      if (summary) summary.dataset.apiRangeKey = key
    })

    if (!daily) return
    if (daily.dataset.apiBacked !== 'true') {
      daily.innerHTML = emptyRow('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.', '')
    }
    fetchLedgerEntries(range.start, range.end).then(function (items) {
      if (requestSeq !== ledgerPageRequestSeq) return
      if (!pageHeadingIs('\uAC00\uACC4\uBD80')) return
      if (daily.dataset.apiPendingKey !== key) return
      daily.dataset.apiLoading = 'false'
      daily.dataset.apiBacked = 'true'
      daily.dataset.apiRangeKey = key
      window.__familyLedgerItemsById = {}
      if (!items.length) {
        daily.innerHTML = emptyRow('\uD574\uB2F9 \uAE30\uAC04\uC758 \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
        return
      }
      var groups = items.reduce(function (map, item) {
        var date = item.transactionDate || item.txDate || ''
        map[date] = map[date] || []
        map[date].push(item)
        return map
      }, {})
      daily.innerHTML = Object.keys(groups).sort().reverse().map(function (date) {
        var rows = groups[date].slice().sort(function (a, b) {
          return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
        })
        rows.forEach(function (item) {
          storeLedgerItemForDetail(item)
        })
        return '<section class="api-ledger-day">' +
          '<header><strong>' + escapeHtml(formatLedgerDateLabel(date)) + '</strong></header>' +
          rows.map(function (item) {
            return '<div class="ledger-row api-ledger-row" data-api-ledger-id="' + item.id + '">' +
              '<div><strong>' + escapeHtml(item.title || '') + '</strong><span>' +
              escapeHtml((item.category || '-') + ' \u00B7 ' + (item.memberName || '-') + ' \u00B7 ' + (item.paymentMethod || '-')) +
              '</span></div><b class="' + escapeHtml(item.entryType || 'expense') + '">' +
              escapeHtml(moneyText(item.amount, item.entryType)) + '</b><div class="ledger-row-actions">' +
              '<button type="button" data-ledger-edit-id="' + escapeHtml(item.id) + '">\uC218\uC815</button>' +
              '<button type="button" class="danger-button" data-ledger-delete-id="' + escapeHtml(item.id) + '">\uC0AD\uC81C</button>' +
              '</div></div>'
          }).join('') +
          '</section>'
      }).join('')
    }).catch(function () {
      if (requestSeq !== ledgerPageRequestSeq) return
      daily.dataset.apiLoading = 'false'
      daily.dataset.apiBacked = 'true'
      daily.dataset.apiRangeKey = key
      daily.innerHTML = emptyRow('\uD574\uB2F9 \uAE30\uAC04\uC758 \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', '')
    })
  }

  function setLedgerDateValue(form, value) {
    var date = parseApiDate(value) || todayText()
    Array.from(form.querySelectorAll('.date-picker-field, label')).forEach(function (field) {
      var fieldText = getCleanText(field)
      if (fieldText.indexOf('\uAC70\uB798\uC77C') < 0 && fieldText.indexOf('\uB0A0\uC9DC') < 0) return
      var triggerText = field.querySelector('.date-picker-trigger span')
      if (triggerText) triggerText.textContent = date.replace(/-/g, '.')
      field.querySelectorAll('input').forEach(function (input) {
        setInputValue(input, input.type === 'date' ? date : date.replace(/-/g, '.'))
      })
    })
  }

  function findLedgerForm() {
    return Array.from(document.querySelectorAll('.ledger-form, .entry-panel, form')).find(function (form) {
      var text = getCleanText(form)
      return (text.indexOf('\uAC70\uB798\uC77C') >= 0 || text.indexOf('\uB0A0\uC9DC') >= 0) && text.indexOf('\uAE08\uC561') >= 0
    })
  }

  function fillLedgerFormForEdit(item) {
    var form = findLedgerForm()
    if (!form || !item) return false
    var editId = String(item.id || '')
    form.dataset.apiLedgerEditId = editId
    window.__familyEditingLedgerId = editId
    var ledgerShell = form.closest('.ledger-form, .entry-panel, aside, section, article')
    if (ledgerShell) ledgerShell.dataset.apiLedgerEditId = editId
    var ledgerInner = form.classList && form.classList.contains('ledger-form') ? form : form.querySelector('.ledger-form')
    if (ledgerInner) ledgerInner.dataset.apiLedgerEditId = editId
    setInputValueByLabel(form, '\uB0B4\uC5ED', item.title || '')
      || setInputValueByLabel(form, '\uC81C\uBAA9', item.title || '')
      || setInputValueByLabel(form, '\uAC00\uB9F9\uC810/\uB0B4\uC6A9', item.title || '')
      || setScheduleTextInputAt(form, 0, item.title || '')
    setInputValueByLabel(form, '\uAE08\uC561', Number(item.amount || 0).toLocaleString('ko-KR'))
    setInputValueByLabel(form, '\uBA54\uBAA8', item.memo || '')
    setLedgerDateValue(form, item.transactionDate)
    setCustomSelectValueByLabel(form, '\uAD6C\uBD84', item.entryType === 'income' ? '\uC218\uC785' : '\uC9C0\uCD9C')
    setCustomSelectValueByLabel(form, '\uCE74\uD14C\uACE0\uB9AC', item.category || '')
    setCustomSelectValueByLabel(form, '\uACB0\uC81C\uC218\uB2E8', item.paymentMethod || '')
    setCustomSelectValueByLabel(form, '\uC0AC\uC6A9\uC790', item.memberName || '')
    setCustomSelectValueByLabel(form, '\uAC00\uC871', item.memberName || '')
    var submit = form.querySelector('button[type="submit"], .submit-action')
    if (submit) {
      submit.textContent = '\uC800\uC7A5'
      submit.dataset.ledgerEditSubmit = 'true'
      submit.onclick = function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation) event.stopImmediatePropagation()
        submitLedgerEdit(form)
        return false
      }
    }
    var target = form.querySelector('input, textarea, .custom-select-trigger, .date-picker-trigger')
    if (target) target.focus()
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return true
  }

  function showLedgerDetail(item) {
    if (!item) {
      showPatchToast('\uC0C1\uC138\uB97C \uBCFC \uB0B4\uC5ED\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      return
    }
    var old = document.querySelector('.patch-ledger-detail-backdrop')
    if (old) old.remove()
    var backdrop = document.createElement('div')
    backdrop.className = 'patch-ledger-detail-backdrop'
    backdrop.innerHTML = [
      '<section class="patch-ledger-detail-dialog">',
      '<button type="button" class="dialog-close" data-ledger-detail-close>\u00D7</button>',
      '<span class="ledger-detail-chip">' + escapeHtml(item.entryType === 'income' ? '\uC218\uC785' : '\uC9C0\uCD9C') + '</span>',
      '<h2>' + escapeHtml(item.title || '\uB0B4\uC5ED \uC5C6\uC74C') + '</h2>',
      '<strong class="ledger-detail-amount ' + escapeHtml(item.entryType || 'expense') + '">' + escapeHtml(moneyText(item.amount, item.entryType)) + '</strong>',
      '<dl>',
      '<div><dt>\uAC70\uB798\uC77C</dt><dd>' + escapeHtml((item.transactionDate || '').replace(/-/g, '.')) + '</dd></div>',
      '<div><dt>\uCE74\uD14C\uACE0\uB9AC</dt><dd>' + escapeHtml(item.category || '-') + '</dd></div>',
      '<div><dt>\uACB0\uC81C\uC218\uB2E8</dt><dd>' + escapeHtml(item.paymentMethod || '-') + '</dd></div>',
      '<div><dt>\uC0AC\uC6A9\uC790</dt><dd>' + escapeHtml(item.memberName || '-') + '</dd></div>',
      '</dl>',
      '<p>' + escapeHtml(item.memo || '\uBA54\uBAA8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.') + '</p>',
      '<div class="ledger-detail-actions">',
      '<button type="button" class="edit-button" data-ledger-detail-edit="' + escapeHtml(item.id) + '">\uC218\uC815</button>',
      '<button type="button" class="danger-button" data-ledger-detail-delete="' + escapeHtml(item.id) + '">\uC0AD\uC81C</button>',
      '</div>',
      '</section>'
    ].join('')
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop || event.target.closest('[data-ledger-detail-close]')) {
        backdrop.remove()
        return
      }
      var edit = event.target.closest('[data-ledger-detail-edit]')
      if (edit) {
        backdrop.remove()
        if (!fillLedgerFormForEdit(item)) showPatchToast('\uC218\uC815\uD560 \uB300\uC0C1\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
        return
      }
      var del = event.target.closest('[data-ledger-detail-delete]')
      if (del) {
        deleteLedgerEntry(del.dataset.ledgerDetailDelete)
      }
    })
    document.body.appendChild(backdrop)
  }

  function ledgerPayloadFromForm(form) {
    return {
      title: getInputValueByLabel(form, '\uB0B4\uC6A9') || getInputValueByLabel(form, '\uB0B4\uC5ED') || getInputValueByLabel(form, '\uC81C\uBAA9') || getInputValueByLabel(form, '\uAC00\uB9F9\uC810/\uB0B4\uC6A9') || firstInputValue(form),
      entryType: normalizeLedgerType(getCustomSelectValue('\uAD6C\uBD84')),
      category: getCustomSelectValue('\uCE74\uD14C\uACE0\uB9AC') || null,
      paymentMethod: getCustomSelectValue('\uACB0\uC81C\uC218\uB2E8') || null,
      memberName: getCustomSelectValue('\uC0AC\uC6A9\uC790') || getCustomSelectValue('\uAC00\uC871') || null,
      amount: parseAmountValue(getInputValueByLabel(form, '\uAE08\uC561') || getFieldValue(form, '[data-field="ledger-amount"]') || getFieldValue(form, 'input[inputmode="numeric"]')),
      transactionDate: getDatePickerValue(form, '\uB0A0\uC9DC') || getDatePickerValue(form, '\uAC70\uB798\uC77C'),
      memo: getInputValueByLabel(form, '\uBA54\uBAA8') || ''
    }
  }

  function refreshLedgerAfterMutation() {
    var daily = document.querySelector('.daily-ledger')
    if (daily) delete daily.dataset.apiRangeKey
    var summary = document.querySelector('.ledger-summary')
    if (summary) delete summary.dataset.apiRangeKey
    renderLedgerPageFromApi(true)
    renderHomeMetricsFromApi(true)
    renderHomeLedgerFromApi(true)
  }

  function isLedgerEntryForm(form) {
    if (!form || !pageHeadingIs('\uAC00\uACC4\uBD80')) return false
    var text = getCleanText(form)
    return text.indexOf('\uAE08\uC561') >= 0 && (text.indexOf('\uB0B4\uC6A9') >= 0 || text.indexOf('\uAC00\uB9F9\uC810/\uB0B4\uC6A9') >= 0)
  }

  function focusLedgerField(form, labelText) {
    var label = findLabelByText(form, labelText)
    var target = label && label.querySelector('input, textarea, button')
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(function () {
      target.focus()
    }, 120)
  }

  function resetLedgerCreateForm(form) {
    setInputValueByLabel(form, '\uB0B4\uC6A9', '')
      || setInputValueByLabel(form, '\uAC00\uB9F9\uC810/\uB0B4\uC6A9', '')
      || setScheduleTextInputAt(form, 0, '')
    setInputValueByLabel(form, '\uAE08\uC561', '')
    setInputValueByLabel(form, '\uBA54\uBAA8', '')
    setLedgerDateValue(form, todayText())
    normalizeLedgerEntryForm()
  }

  function getLedgerEditId(form) {
    if (!form) return ''
    var node = form
    while (node && node !== document) {
      if (node.dataset && node.dataset.apiLedgerEditId) return node.dataset.apiLedgerEditId
      node = node.parentElement
    }
    var inner = form.querySelector && form.querySelector('.ledger-form[data-api-ledger-edit-id]')
    return (inner && inner.dataset.apiLedgerEditId) || window.__familyEditingLedgerId || ''
  }

  function clearLedgerEditMode(form) {
    if (!form) return
    var node = form
    while (node && node !== document) {
      if (node.dataset) delete node.dataset.apiLedgerEditId
      node = node.parentElement
    }
    if (form.querySelectorAll) {
      form.querySelectorAll('[data-api-ledger-edit-id]').forEach(function (item) {
        delete item.dataset.apiLedgerEditId
      })
    }
    window.__familyEditingLedgerId = ''
    var submit = form.querySelector('button[type="submit"], .submit-action')
    if (submit) {
      submit.textContent = '\uCD94\uAC00'
      delete submit.dataset.ledgerEditSubmit
    }
  }

  function validateLedgerPayload(form, payload) {
    if (!payload.title) {
      showPatchToast('\uB0B4\uC6A9\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
      focusLedgerField(form, '\uB0B4\uC6A9')
      return false
    }
    if (!payload.amount) {
      showPatchToast('\uAE08\uC561\uC740 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
      focusLedgerField(form, '\uAE08\uC561')
      return false
    }
    if (!parseApiDate(payload.transactionDate)) {
      showPatchToast('\uB0A0\uC9DC\uB294 \uD544\uC218\uAC12\uC785\uB2C8\uB2E4.')
      focusLedgerField(form, '\uB0A0\uC9DC')
      return false
    }
    return true
  }

  function submitLedgerCreate(form) {
    if (!isLedgerEntryForm(form) || form.dataset.ledgerCreateSubmitting === 'true') return
    var payload = ledgerPayloadFromForm(form)
    if (!validateLedgerPayload(form, payload)) return
    var submit = form.querySelector('button[type="submit"], .submit-action')
    form.dataset.ledgerCreateSubmitting = 'true'
    if (submit) {
      submit.disabled = true
      submit.textContent = '\uCD94\uAC00 \uC911'
    }
    getReadableFamilyId().then(function (familyId) {
      return postJson('/ledger-entries?familyId=' + encodeURIComponent(familyId), payload)
    }).then(function () {
      showPatchToast('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.')
      resetLedgerCreateForm(form)
      refreshLedgerAfterMutation()
    }).catch(function (error) {
      showPatchToast(apiActionErrorMessage(error, '\uAC00\uACC4\uBD80 \uCD94\uAC00\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
    }).finally(function () {
      delete form.dataset.ledgerCreateSubmitting
      if (submit) {
        submit.disabled = false
        submit.textContent = '\uCD94\uAC00'
      }
    })
  }

  function submitLedgerEdit(form) {
    var entryId = getLedgerEditId(form)
    if (!entryId || form.dataset.ledgerEditSubmitting === 'true') return
    var payload = ledgerPayloadFromForm(form)
    if (!validateLedgerPayload(form, payload)) return
    showPatchConfirm('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uC218\uC815\uD560\uAE4C\uC694?', function () {
      form.dataset.ledgerEditSubmitting = 'true'
      getCurrentFamilyId().then(function (familyId) {
        return apiRequest('/ledger-entries/' + encodeURIComponent(entryId) + '?familyId=' + encodeURIComponent(familyId), {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
      }).then(function () {
        clearLedgerEditMode(form)
        showPatchToast('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.')
        refreshLedgerAfterMutation()
      }).catch(function (error) {
        showPatchToast(apiActionErrorMessage(error, '\uAC00\uACC4\uBD80 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      }).finally(function () {
        delete form.dataset.ledgerEditSubmitting
      })
    })
  }

  function deleteLedgerEntry(entryId) {
    if (!entryId) return
    showPatchConfirm('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
      apiRequest('/ledger-entries/' + encodeURIComponent(entryId), { method: 'DELETE' }).then(function () {
        showPatchToast('\uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
        refreshLedgerAfterMutation()
      }).catch(function (error) {
        showPatchToast(apiActionErrorMessage(error, '\uAC00\uACC4\uBD80 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
      })
    })
  }

