  function ensureServerBabyPanel() {
    removeDeveloperServerPanels()
    return
    if (!document.querySelector('.baby-card') && !document.querySelector('.baby-record-list') && !document.querySelector('.baby-record-row')) return
    if (document.querySelector('.server-baby-list')) return
    var anchor = document.querySelector('.baby-record-list') || document.querySelector('.baby-card')
    if (!anchor || !anchor.parentElement) return
    var panel = document.createElement('section')
    panel.className = 'panel server-baby-list server-domain-panel'
    panel.innerHTML = '<header class="panel-header"><h2>DB 육아 기록</h2><button type="button">서버 조회</button></header><div class="server-data-list"></div>'
    anchor.parentElement.insertBefore(panel, anchor.nextSibling)
  }

  function renderBabyApiCards(force) {
    if (getCleanText(document.querySelector('.topbar h1')) !== '\uC721\uC544') return
    if (!getStoredAuthToken()) return
    if (force) {
      restoreBabyListGrid()
      document.querySelectorAll('.baby-api-detail, .baby-detail').forEach(function (detail) {
        detail.remove()
      })
    } else if (document.querySelector('.baby-detail')) {
      return
    }
    var grid = document.querySelector('.baby-list-grid')
    if (!grid) {
      var panel = Array.from(document.querySelectorAll('.panel')).find(function (item) {
        return getCleanText(item.querySelector('.panel-header h2, h2')).indexOf('\uC721\uC544') >= 0
      })
      if (!panel) return
      grid = document.createElement('div')
      grid.className = 'baby-list-grid'
      panel.appendChild(grid)
    }
    grid.hidden = false
    if (!force && grid.dataset.apiLoaded === 'true') return
    if (grid.dataset.apiLoading === 'true') return
    var hasRenderedCards = grid.querySelector('.baby-card[data-api-baby-id]')
    grid.dataset.apiLoaded = 'true'
    grid.dataset.apiLoading = 'true'
    if (!hasRenderedCards) {
      grid.innerHTML = '<div class="api-empty-row baby-api-empty"><strong>\uC544\uC774 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</strong></div>'
    }
    fetchBabies().then(function (babies) {
      window.__familyBabyItemsById = Object.create(null)
      if (!babies.length) {
        grid.innerHTML = '<div class="api-empty-row baby-api-empty"><strong>\uB4F1\uB85D\uB41C \uC544\uC774\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</strong></div>'
        return
      }
      grid.innerHTML = babies.map(function (baby) {
        window.__familyBabyItemsById[String(baby.id)] = baby
        var growth = [baby.latestHeightCm ? baby.latestHeightCm + 'cm' : '', baby.latestWeightKg ? baby.latestWeightKg + 'kg' : ''].filter(Boolean).join(' \u00B7 ')
        return [
          '<article class="baby-card" role="button" tabindex="0" data-api-baby-id="' + escapeHtml(baby.id) + '">',
          '<div><span class="baby-card-avatar">\uC544\uC774</span></div>',
          '<div><strong>' + escapeHtml(baby.name || '-') + '</strong>',
          '<span>' + escapeHtml([baby.gender || '', baby.birthDate || ''].filter(Boolean).join(' \u00B7 ')) + '</span>',
          '<p>' + escapeHtml(baby.memo || '') + '</p>',
          '<small>' + escapeHtml(growth || '\uC131\uC7A5 \uAE30\uB85D \uC5C6\uC74C') + '</small>',
          '</div>',
          '<span class="baby-card-actions"><button type="button" class="baby-card-edit-button">\uC218\uC815</button><button type="button" class="danger-button baby-card-delete-button" data-api-baby-delete-id="' + escapeHtml(baby.id) + '">\uC0AD\uC81C</button></span>',
          '</article>'
        ].join('')
      }).join('')
      bindBabyCardDetailEvents(grid)
    }).catch(function (error) {
      if (!hasRenderedCards) {
        grid.innerHTML = '<div class="api-empty-row baby-api-empty"><strong>' + escapeHtml(apiActionErrorMessage(error, '\uC544\uC774 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')) + '</strong></div>'
      }
    }).finally(function () {
      delete grid.dataset.apiLoading
    })
  }

  function babyMetaText(baby) {
    return [baby.gender || '', baby.birthDate || ''].filter(Boolean).join(' \u00B7 ')
  }

  function babyGrowthText(baby) {
    return [baby.latestHeightCm ? baby.latestHeightCm + 'cm' : '', baby.latestWeightKg ? baby.latestWeightKg + 'kg' : ''].filter(Boolean).join(' \u00B7 ') || '\uC131\uC7A5 \uAE30\uB85D \uC5C6\uC74C'
  }

  function renderBabyApiRecordRows(detail, babyId) {
    var list = detail && detail.querySelector('.baby-record-list')
    if (!list) return
    list.innerHTML = '<div class="api-empty-row">\uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</div>'
    var range = monthRangeFor(todayText())
    fetchBabyRecords(babyId, range.start, range.end).then(function (records) {
      var visibleRecords = records.filter(function (record) {
        return record.recordType !== '\uC131\uC7A5'
      })
      if (!visibleRecords.length) {
        list.innerHTML = '<div class="api-empty-row">\uB4F1\uB85D\uB41C \uC721\uC544 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>'
        return
      }
      list.innerHTML = visibleRecords.map(function (record) {
        var metrics = [
          record.amountMl ? record.amountMl + 'ml' : '',
          record.heightCm ? record.heightCm + 'cm' : '',
          record.weightKg ? record.weightKg + 'kg' : ''
        ].filter(Boolean).join(' \u00B7 ')
        return '<article class="baby-record-row api-baby-record-row" data-api-baby-record-id="' + escapeHtml(record.id) + '">' +
          '<div><strong>' + escapeHtml(record.recordType || '\uAE30\uB85D') + '</strong>' +
          '<span>' + escapeHtml([record.recordDate || '', record.recordTime || '', metrics].filter(Boolean).join(' \u00B7 ')) + '</span>' +
          '<p>' + escapeHtml(record.memo || '') + '</p></div>' +
          '</article>'
      }).join('')
    }).catch(function (error) {
      list.innerHTML = '<div class="api-empty-row">' + escapeHtml(apiActionErrorMessage(error, '\uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')) + '</div>'
    })
  }

  function openBabyApiDetailById(babyId) {
    if (!babyId) return
    var cached = window.__familyBabyItemsById && window.__familyBabyItemsById[String(babyId)]
    if (cached) {
      openBabyApiDetail(cached)
      return
    }
    fetchBabies().then(function (babies) {
      var baby = babies.find(function (item) { return String(item.id) === String(babyId) })
      if (baby) openBabyApiDetail(baby)
      else showPatchToast('\uC544\uC774 \uC815\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.')
    })
  }

  function openBabyCardDetail(card, event) {
    if (!card || !card.dataset.apiBabyId) return
    if (event && event.target && event.target.closest && event.target.closest('button, a, input, select, textarea')) return
    if (event) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    }
    openBabyApiDetailById(card.dataset.apiBabyId)
  }

  function detachBabyListGrid(grid) {
    if (!grid || !grid.parentElement) return
    if (window.__familyDetachedBabyListGrid && window.__familyDetachedBabyListGrid.grid === grid) return window.__familyDetachedBabyListGrid.marker
    var marker = document.createComment('family-baby-list-grid')
    grid.parentElement.insertBefore(marker, grid)
    grid.remove()
    window.__familyDetachedBabyListGrid = { grid: grid, marker: marker }
    return marker
  }

  function restoreBabyListGrid() {
    var detached = window.__familyDetachedBabyListGrid
    if (!detached || !detached.grid || !detached.marker) return document.querySelector('.baby-list-grid')
    if (detached.marker.parentElement) {
      detached.marker.parentElement.insertBefore(detached.grid, detached.marker)
      detached.marker.remove()
    }
    detached.grid.hidden = false
    delete window.__familyDetachedBabyListGrid
    return detached.grid
  }

  function bindBabyCardDetailEvents(root) {
    ;(root || document).querySelectorAll('.baby-card[data-api-baby-id]').forEach(function (card) {
      if (card.dataset.detailClickReady === 'true') return
      card.dataset.detailClickReady = 'true'
      card.addEventListener('click', function (event) {
        openBabyCardDetail(card, event)
      }, true)
      card.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return
        openBabyCardDetail(card, event)
      }, true)
    })
  }

  function openBabyApiDetail(baby) {
    var grid = document.querySelector('.baby-list-grid')
    if (!grid) return
    var old = document.querySelector('.baby-api-detail')
    if (old) old.remove()
    var listMarker = detachBabyListGrid(grid)
    var detail = document.createElement('section')
    detail.className = 'baby-detail baby-api-detail'
    detail.dataset.apiBabyId = baby.id
    detail.innerHTML = [
      '<button type="button" class="back-button">\uBAA9\uB85D</button>',
      '<div class="baby-api-detail-layout"><div class="baby-api-detail-main">',
      '<article class="baby-profile-band">',
      '<span class="baby-avatar large">\uC544\uC774</span>',
      '<div><strong>' + escapeHtml(baby.name || '-') + '</strong><span>' + escapeHtml(babyMetaText(baby)) + '</span><p>' + escapeHtml(baby.memo || '') + '</p><small>' + escapeHtml(babyGrowthText(baby)) + '</small></div>',
      '</article>',
      '<section class="baby-growth-api-panel"><header><h3>\uC131\uC7A5 \uAE30\uB85D</h3><button type="button" class="secondary-action baby-growth-history-button" data-baby-growth-history>\uACFC\uAC70\uC131\uC7A5\uAE30\uB85D</button></header><form class="baby-growth-api-form"><label class="date-picker-field baby-growth-date-field form-field"><span class="form-label">\uB0A0\uC9DC</span><input name="recordDate" type="hidden" required value="' + todayText() + '" /><button type="button" class="date-picker-trigger baby-growth-date-button form-control" data-baby-growth-date-trigger><span>' + todayText().replace(/-/g, '.') + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2v4M16 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></label><label class="form-field"><span class="form-label">\uD0A4(cm)</span><input class="form-control" name="heightCm" type="text" inputmode="decimal" autocomplete="off" /></label><label class="form-field"><span class="form-label">\uBAB8\uBB34\uAC8C(kg)</span><input class="form-control" name="weightKg" type="text" inputmode="decimal" autocomplete="off" /></label><button type="submit" class="save-button">\uC800\uC7A5</button></form><div class="baby-growth-api-history"></div></section>',
      '<section class="baby-pattern-api-panel"><header><h3>\uC0DD\uD65C \uD328\uD134</h3><span>\uC774\uBC88 \uB2EC</span></header><div class="baby-pattern-api-summary"></div></section>',
      '<section class="baby-record-list"></section>',
      '</div><aside class="baby-api-detail-side"></aside></div>'
    ].join('')
    if (listMarker && listMarker.parentElement) {
      listMarker.parentElement.insertBefore(detail, listMarker.nextSibling)
    } else {
      grid.insertAdjacentElement('afterend', detail)
    }
    var back = detail.querySelector('.back-button')
    if (back) {
      back.addEventListener('click', function () {
        detail.remove()
        restoreBabyListGrid()
      })
    }
    ensureBabyApiRecordForm()
    bindBabyGrowthDateField(detail)
    normalizeTimeInputs(detail)
    renderBabyApiRecordRows(detail, baby.id)
    renderBabyGrowthHistory(detail, baby.id)
    window.setTimeout(function () {
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function renderBabyGrowthHistory(detail, babyId) {
    var history = detail && detail.querySelector('.baby-growth-api-history')
    if (!history) return
    history.innerHTML = '<div class="api-empty-row">\uC131\uC7A5 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</div>'
    fetchBabyRecords(babyId, '2000-01-01', '2099-12-31').then(function (records) {
      var growthRecords = records.filter(function (record) {
        return record.heightCm || record.weightKg
      }).sort(compareBabyRecordDate)
      window.__familyBabyGrowthRecordsByBabyId = window.__familyBabyGrowthRecordsByBabyId || Object.create(null)
      window.__familyBabyGrowthRecordsByBabyId[String(babyId)] = growthRecords
      renderBabyPatternSummary(detail, records)
      if (!growthRecords.length) {
        history.innerHTML = '<div class="api-empty-row">\uC131\uC7A5 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>'
        return
      }
      history.innerHTML = buildBabyGrowthChartAndList(growthRecords)
    }).catch(function (error) {
      history.innerHTML = '<div class="api-empty-row">' + escapeHtml(apiActionErrorMessage(error, '\uC131\uC7A5 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')) + '</div>'
    })
  }

  function openBabyGrowthHistoryDialog(detail, babyId) {
    if (!detail || !babyId) return
    var old = document.querySelector('.baby-growth-history-backdrop')
    if (old) old.remove()
    var backdrop = document.createElement('div')
    backdrop.className = 'baby-profile-edit-backdrop baby-growth-history-backdrop'
    var dialog = document.createElement('section')
    dialog.className = 'baby-profile-edit-dialog baby-growth-history-dialog'
    dialog.innerHTML = [
      '<button type="button" class="dialog-close">x</button>',
      '<header><h2>\uACFC\uAC70\uC131\uC7A5\uAE30\uB85D</h2><p>\uB0A0\uC9DC\uBCC4 \uD0A4\uC640 \uBAB8\uBB34\uAC8C\uB97C \uD655\uC778\uD558\uACE0 \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p></header>',
      '<div class="baby-growth-history-dialog-list"><div class="api-empty-row">\uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</div></div>'
    ].join('')
    backdrop.appendChild(dialog)
    document.body.appendChild(backdrop)
    var close = function () { backdrop.remove() }
    dialog.querySelector('.dialog-close').addEventListener('click', close)
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) close()
    })
    var list = dialog.querySelector('.baby-growth-history-dialog-list')
    fetchBabyRecords(babyId, '2000-01-01', '2099-12-31').then(function (records) {
      var growthRecords = records.filter(function (record) {
        return record.heightCm || record.weightKg
      }).sort(compareBabyRecordDate).reverse()
      window.__familyBabyGrowthRecordsByBabyId = window.__familyBabyGrowthRecordsByBabyId || Object.create(null)
      window.__familyBabyGrowthRecordsByBabyId[String(babyId)] = growthRecords.slice().reverse()
      if (!growthRecords.length) {
        list.innerHTML = '<div class="api-empty-row">\uC131\uC7A5 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>'
        return
      }
      list.innerHTML = growthRecords.map(function (record) {
        var metrics = [
          record.heightCm ? record.heightCm + 'cm' : '',
          record.weightKg ? record.weightKg + 'kg' : ''
        ].filter(Boolean).join(' \u00B7 ')
        return '<article class="baby-growth-history-dialog-row" data-growth-record-id="' + escapeHtml(record.id) + '"><div><strong>' + escapeHtml(formatBabyRecordDateTime(record)) + '</strong><span>' + escapeHtml(metrics || '-') + '</span></div><div class="baby-growth-history-dialog-actions"><button type="button" class="edit-button" data-growth-edit-id="' + escapeHtml(record.id) + '">\uC218\uC815</button><button type="button" class="danger-button" data-growth-delete-id="' + escapeHtml(record.id) + '">\uC0AD\uC81C</button></div></article>'
      }).join('')
    }).catch(function (error) {
      list.innerHTML = '<div class="api-empty-row">' + escapeHtml(apiActionErrorMessage(error, '\uC131\uC7A5 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')) + '</div>'
    })
    list.addEventListener('click', function (event) {
      var edit = event.target && event.target.closest && event.target.closest('[data-growth-edit-id]')
      var del = event.target && event.target.closest && event.target.closest('[data-growth-delete-id]')
      if (edit) {
        var record = findBabyGrowthRecord(babyId, edit.dataset.growthEditId)
        if (record) {
          close()
          fillBabyGrowthFormForEdit(detail, record)
        }
        return
      }
      if (del) {
        var deleteId = del.dataset.growthDeleteId
        showPatchConfirm('\uC131\uC7A5 \uAE30\uB85D\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
          apiRequest('/baby-records/' + encodeURIComponent(deleteId), { method: 'DELETE' }).then(function () {
            showPatchToast('\uC131\uC7A5 \uAE30\uB85D\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
            close()
            renderBabyApiRecordRows(detail, babyId)
            renderBabyGrowthHistory(detail, babyId)
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uC131\uC7A5 \uAE30\uB85D \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      }
    })
  }

  function findBabyGrowthRecord(babyId, recordId) {
    var records = window.__familyBabyGrowthRecordsByBabyId && window.__familyBabyGrowthRecordsByBabyId[String(babyId)]
    return (records || []).find(function (record) { return String(record.id) === String(recordId) })
  }

  function fillBabyGrowthFormForEdit(detail, record) {
    var form = detail && detail.querySelector('.baby-growth-api-form')
    if (!form || !record) return
    form.dataset.growthEditId = record.id
    var dateInput = form.querySelector('[name="recordDate"]')
    var dateText = form.querySelector('[data-baby-growth-date-trigger] span')
    if (dateInput) dateInput.value = record.recordDate || todayText()
    if (dateText) dateText.textContent = String(record.recordDate || todayText()).replace(/-/g, '.')
    var height = form.querySelector('[name="heightCm"]')
    var weight = form.querySelector('[name="weightKg"]')
    if (height) height.value = record.heightCm || ''
    if (weight) weight.value = record.weightKg || ''
    var submit = form.querySelector('button[type="submit"]')
    if (submit) submit.textContent = '\uC218\uC815 \uC800\uC7A5'
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(function () {
      var target = height || weight || form.querySelector('[data-baby-growth-date-trigger]')
      if (target) target.focus()
    }, 160)
  }

  function compareBabyRecordDate(a, b) {
    return String((a.recordDate || '') + ' ' + (a.recordTime || '')).localeCompare(String((b.recordDate || '') + ' ' + (b.recordTime || '')))
  }

  function formatBabyRecordDateTime(record) {
    var source = String(record.recordDate || '')
    var parts = source.split('-')
    var date = source.replace(/-/g, '.')
    if (parts.length === 3) {
      var parsed = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      var weekdays = ['일', '월', '화', '수', '목', '금', '토']
      if (!Number.isNaN(parsed.getTime())) {
        date = parts[0] + '. ' + parts[1] + '. ' + parts[2] + '(' + weekdays[parsed.getDay()] + ')'
      }
    }
    return [date, record.recordTime || ''].filter(Boolean).join(' ')
  }

  function formatBabyRecordDate(record) {
    var source = String(record.recordDate || '')
    var parts = source.split('-')
    var date = source.replace(/-/g, '.')
    if (parts.length === 3) {
      var parsed = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      var weekdays = ['일', '월', '화', '수', '목', '금', '토']
      if (!Number.isNaN(parsed.getTime())) {
        date = parts[0] + '. ' + parts[1] + '. ' + parts[2] + '(' + weekdays[parsed.getDay()] + ')'
      }
    }
    return date
  }

  function babyGrowthNumber(value) {
    if (value === null || typeof value === 'undefined' || value === '') return null
    var number = Number(value)
    return Number.isFinite(number) ? number : null
  }

  function babyGrowthMetricValue(record, mode) {
    var value = babyGrowthNumber(mode === 'weight' ? record.weightKg : record.heightCm)
    if (value === null) return ''
    return value + (mode === 'weight' ? 'kg' : 'cm')
  }

  function babyGrowthRecordsForMode(records, mode) {
    return records.slice().sort(compareBabyRecordDate).filter(function (record) {
      return babyGrowthNumber(mode === 'weight' ? record.weightKg : record.heightCm) !== null
    })
  }

  function resolveBabyGrowthMode(records, mode) {
    var heightRecords = babyGrowthRecordsForMode(records, 'height')
    var weightRecords = babyGrowthRecordsForMode(records, 'weight')
    var selectedMode = mode === 'weight' ? 'weight' : 'height'
    if (selectedMode === 'height' && !heightRecords.length && weightRecords.length) selectedMode = 'weight'
    if (selectedMode === 'weight' && !weightRecords.length && heightRecords.length) selectedMode = 'height'
    return selectedMode
  }

  function buildBabyGrowthChartAndList(records, mode) {
    var selectedMode = resolveBabyGrowthMode(records, mode)
    return buildBabyGrowthChart(records, selectedMode) + buildBabyGrowthHistoryList(records, selectedMode)
  }

  function buildBabyGrowthHistoryList(records, mode) {
    var selectedMode = resolveBabyGrowthMode(records, mode)
    var growthRecords = babyGrowthRecordsForMode(records, selectedMode).slice().reverse()
    if (!growthRecords.length) {
      return '<div class="growth-history detailed baby-growth-history-list" data-baby-growth-history-mode="' + selectedMode + '"><div class="api-empty-row">\uC131\uC7A5 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div></div>'
    }
    return '<div class="growth-history detailed baby-growth-history-list" data-baby-growth-history-mode="' + selectedMode + '">' + growthRecords.map(function (record, index) {
      var number = index + 1
      return '<article class="baby-growth-history-row"><strong>' + number + '. ' + escapeHtml(formatBabyRecordDate(record)) + '</strong><span>' + escapeHtml(babyGrowthMetricValue(record, selectedMode)) + '</span></article>'
    }).join('') + '</div>'
  }

  function buildBabyGrowthChart(records, mode) {
    var heightRecords = babyGrowthRecordsForMode(records, 'height')
    var weightRecords = babyGrowthRecordsForMode(records, 'weight')
    var selectedMode = resolveBabyGrowthMode(records, mode)
    var selectedRecords = selectedMode === 'weight' ? weightRecords : heightRecords
    var selectedPoints = selectedRecords.map(function (record, index) {
      return {
        index: index,
        value: babyGrowthNumber(selectedMode === 'weight' ? record.weightKg : record.heightCm),
        label: String(record.recordDate || '').slice(5).replace('-', '.')
      }
    })
    var values = selectedPoints.map(function (point) { return point.value })
    if (!values.length) return ''
    var min = Math.min.apply(null, values)
    var max = Math.max.apply(null, values)
    if (min === max) {
      min = Math.max(0, min - 1)
      max += 1
    }
    var width = 720
    var height = 280
    var left = 58
    var right = 26
    var top = 28
    var bottom = 48
    var chartWidth = width - left - right
    var chartHeight = height - top - bottom
    var maxIndex = Math.max(selectedPoints.length - 1, 1)
    function xy(point) {
      var x = left + chartWidth * (point.index / maxIndex)
      var y = top + chartHeight * (1 - ((point.value - min) / (max - min)))
      return { x: x, y: y }
    }
    function line(points) {
      return points.map(function (point) {
        var pos = xy(point)
        return pos.x.toFixed(1) + ',' + pos.y.toFixed(1)
      }).join(' ')
    }
    function dots(points, cls) {
      return points.map(function (point) {
        var pos = xy(point)
        return '<circle class="' + cls + '" cx="' + pos.x.toFixed(1) + '" cy="' + pos.y.toFixed(1) + '" r="5"><title>' + escapeHtml(point.label + ' ' + point.value) + '</title></circle>'
      }).join('')
    }
    function chartButton(buttonMode, label, hasData) {
      var active = selectedMode === buttonMode
      return '<button type="button" data-baby-growth-chart-mode="' + buttonMode + '" class="' + (active ? 'active' : '') + '" aria-pressed="' + (active ? 'true' : 'false') + '"' + (hasData ? '' : ' disabled') + '>' + label + '</button>'
    }
    var labels = [0, 0.5, 1].map(function (rate) {
      var value = max - ((max - min) * rate)
      var y = top + chartHeight * rate
      return '<line class="grid-line" x1="' + left + '" x2="' + (width - right) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text class="axis-label" x="' + (left - 8) + '" y="' + (y + 4).toFixed(1) + '">' + value.toFixed(1) + '</text>'
    }).join('')
    var xLabels = selectedPoints.filter(function (_, index) {
      return selectedPoints.length <= 4 || index === 0 || index === selectedPoints.length - 1 || index === Math.floor((selectedPoints.length - 1) / 2)
    }).map(function (point) {
      var x = left + chartWidth * (point.index / maxIndex)
      return '<text class="x-label" x="' + x.toFixed(1) + '" y="' + (height - 10) + '">' + escapeHtml(point.label) + '</text>'
    }).join('')
    var lineClass = selectedMode === 'weight' ? 'weight-line' : 'height-line'
    var dotClass = selectedMode === 'weight' ? 'weight-dot' : 'height-dot'
    var unit = selectedMode === 'weight' ? 'kg' : 'cm'
    var label = selectedMode === 'weight' ? '\uBAB8\uBB34\uAC8C' : '\uD0A4'
    return [
      '<div class="growth-chart baby-growth-chart">',
      '<div class="growth-chart-toggle" role="group" aria-label="\uC131\uC7A5 \uCC28\uD2B8 \uC9C0\uD45C">',
      chartButton('height', '\uD0A4', !!heightRecords.length),
      chartButton('weight', '\uBAB8\uBB34\uAC8C', !!weightRecords.length),
      '</div>',
      '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + label + ' \uC131\uC7A5 \uCC28\uD2B8">',
      labels,
      '<line class="axis-line" x1="' + left + '" x2="' + (width - right) + '" y1="' + (height - bottom) + '" y2="' + (height - bottom) + '"/>',
      '<polyline class="' + lineClass + '" points="' + line(selectedPoints) + '"/>' + dots(selectedPoints, dotClass),
      xLabels,
      '<text class="unit-label" x="' + left + '" y="14">' + unit + '</text>',
      '</svg></div>'
    ].join('')
  }

  function renderBabyPatternSummary(detail, records) {
    var target = detail && detail.querySelector('.baby-pattern-api-summary')
    if (!target) return
    var range = monthRangeFor(todayText())
    var monthRecords = records.filter(function (record) {
      return record.recordDate >= range.start && record.recordDate <= range.end
    })
    var types = ['\uC218\uC720', '\uB300\uBCC0', '\uC18C\uBCC0', '\uC218\uBA74', '\uC131\uC7A5', '\uBCD1\uC6D0', '\uBA54\uBAA8']
    if (!monthRecords.length) {
      target.innerHTML = '<div class="api-empty-row">\uC774\uBC88 \uB2EC \uD328\uD134 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>'
      return
    }
    target.innerHTML = '<div class="pattern-grid">' + types.map(function (type) {
      var count = monthRecords.filter(function (record) { return record.recordType === type }).length
      return '<article><strong>' + escapeHtml(type) + '</strong><span>' + count + '\uAC74</span></article>'
    }).join('') + '</div>'
  }

  function deleteBabyProfile(babyId) {
    if (!babyId) return
    apiRequest('/babies/' + encodeURIComponent(babyId), { method: 'DELETE' }).then(function () {
      document.querySelectorAll('.baby-api-detail').forEach(function (detail) {
        if (String(detail.dataset.apiBabyId || '') === String(babyId)) detail.remove()
      })
      var grid = document.querySelector('.baby-list-grid')
      if (grid) {
        delete grid.dataset.apiLoaded
        delete grid.dataset.apiLoading
        grid.hidden = false
      }
      renderBabyApiCards(true)
      showPatchToast('\uC544\uC774 \uC815\uBCF4\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
    }).catch(function (error) {
      showPatchToast(apiActionErrorMessage(error, '\uC544\uC774 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
    })
  }

  function renderBabyServerEntries(force) {
    removeDeveloperServerPanels()
    return
    if (getCleanText(document.querySelector('.topbar h1')) !== '\uC721\uC544') return
    ensureServerBabyPanel()
    var panel = document.querySelector('.server-baby-list')
    var list = panel && panel.querySelector('.server-data-list')
    if (!list) return
    var range = monthRangeFor(todayText())
    var key = range.start + ':' + range.end
    if (!force && panel.dataset.rangeKey === key) return
    panel.dataset.rangeKey = key
    list.innerHTML = '<p class="server-data-empty">\uC11C\uBC84 \uC721\uC544 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</p>'
    fetchBabies().then(function (babies) {
      if (!babies.length) {
        list.innerHTML = '<p class="server-data-empty">DB \uC544\uC774 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'
        return
      }
      return Promise.all(babies.slice(0, 4).map(function (baby) {
        return fetchBabyRecords(baby.id, range.start, range.end).then(function (records) {
          return { baby: baby, records: records }
        })
      })).then(function (groups) {
        list.innerHTML = groups.map(function (group) {
          var first = group.records[0]
          var growth = [group.baby.latestHeightCm ? group.baby.latestHeightCm + 'cm' : '', group.baby.latestWeightKg ? group.baby.latestWeightKg + 'kg' : ''].filter(Boolean).join(' · ')
          return '<article class="server-domain-row" data-api-baby-id="' + group.baby.id + '">' +
            '<div><strong>' + escapeHtml(group.baby.name) + '</strong><span>' +
            escapeHtml((group.baby.gender || '-') + ' · ' + (group.baby.birthDate || '-') + (growth ? ' · ' + growth : '')) +
            '</span></div><b>' + escapeHtml(group.records.length + '\uAC74') + '</b>' +
            (first ? '<small>' + escapeHtml((first.recordDate || '') + ' ' + (first.recordTime || '') + ' · ' + first.recordType + (first.memo ? ' · ' + first.memo : '')) + '</small>' : '<small>\uC774\uBC88 \uB2EC \uAE30\uB85D \uC5C6\uC74C</small>') +
            '</article>'
        }).join('')
      })
    })
  }

  function removeDeveloperServerPanels() {
    document.querySelectorAll([
      '.server-schedule-list',
      '.server-ledger-list',
      '.server-travel-list',
      '.server-diary-list',
      '.server-baby-list'
    ].join(',')).forEach(function (panel) {
      panel.remove()
    })
  }

  var HARDCODED_DEMO_PATTERNS = []

  function hasHardcodedDemoText(text) {
    return HARDCODED_DEMO_PATTERNS.some(function (pattern) {
      return text.indexOf(pattern) >= 0
    })
  }

  function findDemoDataContainer(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null
    if (node.closest('[data-api-ledger-id], [data-api-schedule-id], [data-api-trip-id], [data-api-baby-id], [data-api-diary-id]')) return null
    return node.closest([
      '.ledger-row',
      '.task-list li',
      '.trip-list article',
      '.trip-card',
      '.trip-list-card',
      '.travel-record-card',
      '.travel-card',
      '.route-sequence-item',
      '.route-item',
      '.baby-card',
      '.baby-record-row',
      '.baby-list article',
      '.diary-card',
      '.diary-entry',
      '.timeline-row',
      '.timeline-item',
      '.schedule-pill',
      '.restaurant-card',
      '.calendar-event-pill'
    ].join(','))
  }

  function removeHardcodedDemoData() {
    Array.from(document.querySelectorAll([
      '.ledger-row',
      '.task-list li',
      '.trip-list article',
      '.trip-card',
      '.trip-list-card',
      '.travel-record-card',
      '.travel-card',
      '.route-sequence-item',
      '.route-item',
      '.baby-card',
      '.baby-record-row',
      '.baby-list article',
      '.diary-card',
      '.diary-entry',
      '.timeline-row',
      '.timeline-item',
      '.schedule-pill',
      '.restaurant-card',
    '.calendar-event-pill'
    ].join(','))).forEach(function (node) {
      if (hasHardcodedDemoText(getCleanText(node))) {
        var container = findDemoDataContainer(node)
        if (container) container.remove()
      }
    })
  }

