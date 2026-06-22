  function refreshCalendarPatch() {
    if (document.documentElement.dataset.patchPage === 'community') {
      removeFeaturePlaceholders()
      return
    }
    if (document.documentElement.dataset.patchPage === 'family-group') {
      removeFeaturePlaceholders()
      cleanupPassiveButtons()
      return
    }
    cleanupStaleServerPanels()
    ensureCalendarModeDefaultDates()
    ensureCalendarJumpControl()
    ensureCommunityMenu()
    ensureYearMonthClickGuard()
    ensureScheduleActionDelegates()
    wireCalendarInteractions()
    cleanupCalendarChrome()
    syncCalendarEntryToToday()
    ensureYearModeTabs()
    ensureScheduleDefaultTime()
    normalizeLedgerEntryForm()
    normalizeTravelEntryForm()
    ensureTravelHeaderActions()
    normalizeDiaryEntryForm()
    normalizeBabyEntryForms()
    normalizeTimeInputs()
    removeFeaturePlaceholders()
    wireScheduleDetailRows()
    hideSelectedDayPanels()
    refreshScheduleListCount()
    renderCalendarApiSchedules(false)
    normalizeLunarLabels()
    decorateCalendarHolidays()
    enhanceDatepickers()
    syncScheduleBasisLayout()
    refreshLabelCleanup()
    ensureAuthRegisterFields()
    normalizeAuthLanding()
    cleanupAuthActions()
    consumePendingNavLabel()
    enhanceAuthApi()
    consumeSsoFragment()
    restoreAuthSession()
    ensurePasswordChangeAction()
    enhanceBabyGrowthTabs()
    enhanceAuthSso()
    enhanceHomeDashboard()
    renderNotificationBell()
    loadScheduleNotifications()
    refreshServerDataViews()
    removeLedgerManageButton()
    hideBabyEmptySelectionPanel()
    enhanceBabyRecordMedia()
    cleanupBabyDetailButtons()
    ensureBabyMainActions()
    normalizeBabyCreateDialog()
    ensureDiaryMainActions()
    ensureBabyApiRecordForm()
    enhanceBabyEditMediaHelper()
    enhanceBabyProfileEdit()
    hideAdminMenuAddButton()
    enhanceMediaUploadLimits()
    cleanupPassiveButtons()
    syncSelectedDayHeaderFromState()
  }

  function safeRefreshCalendarPatch() {
    if (window.__familyPatchRefreshing) return
    window.__familyPatchRefreshing = true
    try {
      refreshCalendarPatch()
    } catch (error) {
      window.__familyPatchLastError = String(error && error.message ? error.message : error)
    } finally {
      window.__familyPatchRefreshing = false
    }
  }

  function schedulePatchRefresh() {
    if (window.__familyPatchRefreshTimer) return
    window.__familyPatchRefreshTimer = window.setTimeout(function () {
      window.__familyPatchRefreshTimer = null
      safeRefreshCalendarPatch()
    }, 120)
  }

  function handlePatchMutations(mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === 'attributes') {
        removeFeaturePlaceholders(mutation.target)
        return
      }
      Array.from(mutation.addedNodes || []).forEach(function (node) {
        if (!node || node.nodeType !== 1) return
        removeFeaturePlaceholders(node)
        clearSampleFieldValues(node)
      })
    })
    schedulePatchRefresh()
  }

  var observer = new MutationObserver(handlePatchMutations)
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['placeholder'] })
  window.setInterval(function () {
    removeFeaturePlaceholders()
  }, 250)
  window.setInterval(safeRefreshCalendarPatch, 1000)
  safeRefreshCalendarPatch()

  function handleAuthSubmitEvent(event) {
    var submit = event.target && event.target.closest && event.target.closest('.auth-submit')
    if (!submit || submit.dataset.authBypass === 'true') return false
    if (document.querySelector('.app-shell')) return false
    var card = submit.closest('.auth-card')
    if (!card) return false
    if (shouldAllowLegacyLogin(card, submit)) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitAuthViaApi(card, submit)
    return true
  }

  window.addEventListener('click', handleAuthSubmitEvent, true)
  document.addEventListener('click', handleAuthSubmitEvent, true)

  function handleAuthFormSubmitEvent(event) {
    var card = event.target && event.target.closest && event.target.closest('.auth-card')
    if (!card) return false
    if (document.querySelector('.app-shell')) return false
    var submit = card.querySelector('.auth-submit')
    if (!submit || submit.dataset.authBypass === 'true') return false
    if (shouldAllowLegacyLogin(card, submit)) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    submitAuthViaApi(card, submit)
    return true
  }

  window.addEventListener('submit', handleAuthFormSubmitEvent, true)
  document.addEventListener('submit', handleAuthFormSubmitEvent, true)
  window.__familyAuthPatchReady = true

  document.addEventListener('pointerdown', function (event) {
    if (!findLogoutClickTarget(event.target)) return
    logoutCurrentSession()
  }, true)

  document.addEventListener('click', function (event) {
    if (!findLogoutClickTarget(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    logoutCurrentSession()
    forceClearStoredAuth()
    window.setTimeout(function () {
      window.location.replace('/')
    }, 80)
  }, true)

  document.addEventListener('click', function (event) {
    var titleButton = event.target && event.target.closest && event.target.closest('.family-calendar-panel .calendar-title-button')
    if (!titleButton) return

    event.preventDefault()
    event.stopPropagation()
    if (window.__calendarTitlePointerOpenedAt && Date.now() - window.__calendarTitlePointerOpenedAt < 500) return
    var current = document.querySelector('.jump-datepicker-popover')
    if (current) {
      current.remove()
      return
    }
    renderJumpDatepicker(getScheduleFormVisibleDate() || getFocusedDate())
  }, true)

  document.addEventListener('pointerdown', function (event) {
    var titleButton = event.target && event.target.closest && event.target.closest('.family-calendar-panel .calendar-title-button')
    if (!titleButton) return

    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    var current = document.querySelector('.jump-datepicker-popover')
    if (current) {
      current.remove()
      return
    }
    window.__calendarTitlePointerOpenedAt = Date.now()
    renderJumpDatepicker(getScheduleFormVisibleDate() || getFocusedDate())
  }, true)

  function normalizeLunarLabels() {
    var items = Array.from(document.querySelectorAll('.family-calendar-panel .calendar-day-card small'))
    items.forEach(function (item) {
      var card = item.closest('.calendar-day-card')
      var number = card && card.querySelector('.day-number')
      var day = number ? Number(number.textContent.trim()) : NaN
      if (!Number.isFinite(day)) return
      item.style.display = day % 5 === 0 ? '' : 'none'
    })
  }

  function enhanceDatepickers() {
    document.querySelectorAll('.calendar-popover:not(.jump-datepicker-popover):not(.baby-common-date-popover)').forEach(function (popover) {
      if (!popover.querySelector('.calendar-today-row')) {
        var row = document.createElement('div')
        row.className = 'calendar-today-row'
        var today = document.createElement('button')
        today.type = 'button'
        today.textContent = '\uC624\uB298'
        today.addEventListener('click', function () {
          var field = popover.closest('.date-picker-field')
          var triggerText = field && field.querySelector('.date-picker-trigger span')
          var now = new Date()
          if (field && field.closest('.schedule-form-card')) {
            updateScheduleFormVisibleDate(now)
          } else if (triggerText) {
            triggerText.textContent = formatDisplayDate(now)
          }
          popover.classList.add('calendar-popover-hidden')
        })
        row.appendChild(today)
        var header = popover.querySelector('.calendar-header')
        if (header) header.insertAdjacentElement('afterend', row)
      }

      popover.querySelectorAll('.calendar-day-grid button, .calendar-month-grid button, .calendar-year-grid button').forEach(function (button) {
        if (button.dataset.closeWired) return
        button.dataset.closeWired = 'true'
        button.addEventListener('click', function () {
          window.setTimeout(function () {
            var stillOpen = button.closest('.calendar-popover')
            var field = stillOpen && stillOpen.closest('.date-picker-field')
            if (field && field.closest('.schedule-form-card')) {
              var date = getScheduleFormVisibleDate()
              if (date) updateScheduleFormVisibleDate(date)
            }
            if (stillOpen) stillOpen.classList.add('calendar-popover-hidden')
          }, 120)
        })
      })
    })
  }

  function openCommonDatePickerPopover(input, trigger) {
    if (!input || !trigger) return
    document.querySelectorAll('.common-date-popover, .date-picker-field .calendar-popover').forEach(function (old) {
      old.remove()
    })
    var selected = parseApiDate(input.value) || todayText()
    var view = new Date(selected + 'T00:00:00')
    var popover = document.createElement('div')
    popover.className = 'calendar-popover common-date-popover'
    var level = 'day'

    function draw() {
      var year = view.getFullYear()
      var month = view.getMonth()
      var selectedDate = parseApiDate(selected) || todayText()
      var selectedYear = Number(selectedDate.slice(0, 4))
      var selectedMonth = Number(selectedDate.slice(5, 7)) - 1
      var title = level === 'year' ? year + '\uB144' : (level === 'month' ? year + '\uB144' : year + '\uB144 ' + (month + 1) + '\uC6D4')
      var html = '<header class="calendar-header"><button type="button" data-common-date-prev>&lt;</button><button type="button" class="calendar-title-button" data-common-date-title><span>' + title + '</span></button><button type="button" data-common-date-next>&gt;</button></header>'
      html += '<div class="calendar-today-row"><button type="button" data-common-date-today>\uC624\uB298</button></div>'
      if (level === 'year') {
        var startYear = Math.floor(year / 12) * 12
        html += '<div class="calendar-year-grid">'
        for (var yearIndex = 0; yearIndex < 12; yearIndex += 1) {
          var itemYear = startYear + yearIndex
          html += '<button type="button" class="' + (selectedYear === itemYear ? 'selected' : '') + '" data-common-year="' + itemYear + '">' + itemYear + '\uB144</button>'
        }
        html += '</div>'
      } else if (level === 'month') {
        html += '<div class="calendar-month-grid">'
        for (var monthIndex = 0; monthIndex < 12; monthIndex += 1) {
          var isSelectedMonth = selectedYear === year && selectedMonth === monthIndex
          html += '<button type="button" class="' + (isSelectedMonth ? 'selected' : '') + '" data-common-month="' + monthIndex + '">' + (monthIndex + 1) + '\uC6D4</button>'
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
          html += '<button type="button" class="' + classes.join(' ') + '" data-common-date="' + iso + '">' + day + '</button>'
        }
        html += '</div>'
      }
      popover.innerHTML = html
      if (popover.isConnected) window.setTimeout(function () { positionCommonDatePickerPopover(popover, trigger) }, 0)
    }

    function applySelected() {
      setInputValue(input, selected)
      var label = trigger.querySelector('span')
      if (label) label.textContent = selected.replace(/-/g, '.')
      popover.remove()
    }

    function handleAction(event, skipRecentPointer) {
      var target = event.target
      if (!target || !target.closest) return false
      var control = target.closest('[data-common-date-prev], [data-common-date-next], [data-common-date-title], [data-common-date-today], [data-common-year], [data-common-month], [data-common-date]')
      if (!control) return false
      if (skipRecentPointer && popover.dataset.commonDatePointerAt && Date.now() - Number(popover.dataset.commonDatePointerAt) < 600) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation) event.stopImmediatePropagation()
        return true
      }
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      if (event.type === 'pointerdown') popover.dataset.commonDatePointerAt = String(Date.now())
      if (target.closest('[data-common-date-prev]')) {
        if (level === 'year') view.setFullYear(view.getFullYear() - 12)
        else if (level === 'month') view.setFullYear(view.getFullYear() - 1)
        else view.setMonth(view.getMonth() - 1)
        draw()
        return true
      }
      if (target.closest('[data-common-date-next]')) {
        if (level === 'year') view.setFullYear(view.getFullYear() + 12)
        else if (level === 'month') view.setFullYear(view.getFullYear() + 1)
        else view.setMonth(view.getMonth() + 1)
        draw()
        return true
      }
      if (target.closest('[data-common-date-title]')) {
        if (level === 'day') level = 'month'
        else if (level === 'month') level = 'year'
        draw()
        return true
      }
      if (target.closest('[data-common-date-today]')) {
        selected = todayText()
        view = new Date(selected + 'T00:00:00')
        level = 'day'
        applySelected()
        return true
      }
      var yearButton = target.closest('[data-common-year]')
      if (yearButton) {
        view.setFullYear(Number(yearButton.dataset.commonYear))
        level = 'month'
        draw()
        return true
      }
      var monthButton = target.closest('[data-common-month]')
      if (monthButton) {
        view.setMonth(Number(monthButton.dataset.commonMonth))
        level = 'day'
        draw()
        return true
      }
      var dayButton = target.closest('[data-common-date]')
      if (dayButton) {
        selected = dayButton.dataset.commonDate
        applySelected()
      }
      return true
    }

    draw()
    document.body.appendChild(popover)
    positionCommonDatePickerPopover(popover, trigger)
    popover.addEventListener('pointerdown', function (event) { handleAction(event, false) }, true)
    popover.addEventListener('click', function (event) { handleAction(event, true) }, true)
  }

  function positionCommonDatePickerPopover(popover, trigger) {
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
    if (belowTop + height > maxBottom && aboveTop >= minTop) top = aboveTop
    else if (belowTop + height > maxBottom) top = Math.max(minTop, maxBottom - height)
    var minLeft = viewportLeft + 16
    var maxLeft = viewportLeft + viewportWidth - width - 16
    var left = Math.max(minLeft, Math.min(maxLeft, rect.left + rect.width / 2 - width / 2))
    popover.style.setProperty('position', 'fixed', 'important')
    popover.style.setProperty('width', width + 'px', 'important')
    popover.style.setProperty('left', left + 'px', 'important')
    popover.style.setProperty('top', top + 'px', 'important')
  }

  function syncScheduleBasisLayout() {
    var card = document.querySelector('.schedule-form-card')
    if (!card) return
    var labels = Array.from(card.querySelectorAll('label, .date-picker-field'))
    var dateField = card.querySelector('.date-picker-field')
    var basisLabel = labels.find(function (label) {
      return label.textContent && label.textContent.indexOf('\uAE30\uC900') >= 0
    })
    if (dateField && basisLabel && dateField.parentElement) {
      dateField.parentElement.classList.add('schedule-date-basis-row')
    }
    if (dateField && basisLabel && !basisLabel.classList.contains('basis-field-patched')) {
      basisLabel.classList.add('basis-field-patched')
      if (dateField.parentElement && basisLabel.parentElement !== dateField.parentElement) {
        dateField.parentElement.insertBefore(basisLabel, dateField)
      } else if (dateField.parentElement && basisLabel.nextElementSibling !== dateField) {
        dateField.parentElement.insertBefore(basisLabel, dateField)
      }
    }
    if (basisLabel && !basisLabel.dataset.basisWired) {
      basisLabel.dataset.basisWired = 'true'
      basisLabel.addEventListener('click', function (event) {
        window.setTimeout(function () {
          var text = basisLabel.textContent || ''
          var triggerText = basisLabel.querySelector('.custom-select-trigger span')
          var selectedBasis = triggerText ? triggerText.textContent.trim() : ''
          var note = card.querySelector('.schedule-lunar-note')
          if (selectedBasis === '\uC74C\uB825') {
            var date = getScheduleFormVisibleDate()
            if (date) updateScheduleFormVisibleDate(date)
          } else if (note) {
            note.remove()
            refreshScheduleDateDisplayForBasis()
          }
        }, 80)
      })
    }
  }

  function closeOpenSelects(target) {
    if (target && target.closest && (target.closest('.common-date-popover') || target.closest('.date-picker-trigger'))) {
      return
    }
    document.querySelectorAll('.common-date-popover').forEach(function (popover) {
      popover.remove()
    })

    if (target && target.closest && target.closest('.custom-select')) {
      var current = target.closest('.custom-select')
      document.querySelectorAll('.date-picker-field .calendar-popover').forEach(function (popover) {
        popover.remove()
      })
      document.querySelectorAll('.custom-select.open').forEach(function (select) {
        if (select !== current) select.classList.remove('open')
      })
      document.querySelectorAll('.custom-select-trigger.open').forEach(function (trigger) {
        if (!current.contains(trigger)) trigger.classList.remove('open')
      })
      if (target.closest('.custom-select-list button')) {
        var option = target.closest('.custom-select-list button')
        var optionText = option ? option.textContent.trim() : ''
        var triggerText = current.querySelector('.custom-select-trigger span')
        window.setTimeout(function () {
          if (optionText && triggerText && triggerText.textContent.trim() !== optionText) {
            triggerText.textContent = optionText
          }
          if (current.closest('.basis-field-patched')) {
            var card = document.querySelector('.schedule-form-card')
            var basisLabel = current.closest('.basis-field-patched')
            var note = card && card.querySelector('.schedule-lunar-note')
            if (optionText === '\uC74C\uB825') {
              var date = getScheduleFormVisibleDate()
              if (date) updateScheduleFormVisibleDate(date)
            } else if (note) {
              note.remove()
              refreshScheduleDateDisplayForBasis()
            } else if (current.closest('.basis-field-patched')) {
              refreshScheduleDateDisplayForBasis()
            }
          }
        }, 40)
        window.setTimeout(function () {
          current.classList.remove('open')
          current.querySelectorAll('.custom-select-trigger.open').forEach(function (trigger) {
            trigger.classList.remove('open')
          })
        }, 220)
      }
      return
    }

    window.dispatchEvent(new CustomEvent('family-platform-select-open', { detail: 'outside-click' }))

    window.setTimeout(function () {
      document.querySelectorAll('.custom-select.open').forEach(function (select) {
        select.classList.remove('open')
      })
      document.querySelectorAll('.custom-select-trigger.open').forEach(function (trigger) {
        trigger.classList.remove('open')
      })
    }, 0)
  }

  document.addEventListener('pointerdown', function (event) {
    closeOpenSelects(event.target)
  }, true)

  document.addEventListener('touchstart', function (event) {
    closeOpenSelects(event.target)
  }, true)

  document.addEventListener('click', function (event) {
    closeOpenSelects(event.target)
  }, true)

  document.addEventListener('focusin', function (event) {
    closeOpenSelects(event.target)
  }, true)

  document.addEventListener('click', function (event) {
    if (!(event.target && event.target.closest && event.target.closest('.date-picker-trigger'))) return
    window.setTimeout(function () {
      var field = event.target.closest('.date-picker-field')
      if (!field) return
      field.querySelectorAll('.calendar-popover-hidden').forEach(function (popover) {
        popover.classList.remove('calendar-popover-hidden')
      })
    }, 0)
  }, true)

  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && (event.target.closest('.jump-datepicker-popover') || event.target.closest('.family-calendar-panel .calendar-title-button'))) return
    var jump = document.querySelector('.jump-datepicker-popover')
    if (jump) {
      jump.remove()
      document.documentElement.classList.remove('calendar-jump-open')
    }
  }, true)

  function getCleanText(element) {
    return element ? element.textContent.replace(/\s+/g, ' ').trim() : ''
  }

  function normalizeLabelText(text) {
    return String(text || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
  }

  function getLabelTitle(label) {
    return label ? label.querySelector('span, strong, b') : null
  }

  function getLabelText(label) {
    return normalizeLabelText(getCleanText(getLabelTitle(label)))
  }

  function hidePatchElement(element) {
    if (!element) return
    element.style.display = 'none'
    element.setAttribute('aria-hidden', 'true')
    element.dataset.patchHidden = 'true'
  }

  function refreshLabelCleanup() {
    document.querySelectorAll('.topbar span, .eyebrow, .panel-header h2').forEach(function (item) {
      var text = getCleanText(item)
      if (text === '\uC0AC\uC9C4, \uB0A0\uC528, \uAC00\uC871 \uC77C\uAE30') item.textContent = '\uC0AC\uC9C4, \uB0A0\uC528, \uC77C\uAE30'
      if (text === '\uAC00\uC871 \uC77C\uAE30') item.textContent = '\uC77C\uAE30'
    })
    document.querySelectorAll('.panel-header').forEach(function (header) {
      var title = getCleanText(header.querySelector('h2'))
      var actionButton = header.querySelector(':scope > button')

      if (title === '\uAC00\uACC4\uBD80 \uC785\uB825' && actionButton && getCleanText(actionButton) === '\uD3B8\uC9D1') {
        hidePatchElement(actionButton)
      }

      if (title === '\uC77C\uC815 \uCD94\uAC00' && actionButton && getCleanText(actionButton) === '\uC0C8 \uC77C\uC815') {
        hidePatchElement(actionButton)
      }

      if (title === '\uC721\uC544 \uAE30\uB85D') {
        var babyNameButton = actionButton && getCleanText(actionButton) !== '\uBAA9\uB85D' ? actionButton : null
        if (babyNameButton) hidePatchElement(babyNameButton)

        var detail = document.querySelector('.baby-detail')
        var backButton = detail && detail.querySelector('.back-button')
        if (!backButton) {
          if (!detail) {
            header.querySelectorAll('.baby-header-back-button').forEach(function (button) {
              button.remove()
            })
            if (actionButton && getCleanText(actionButton) === '\uBAA9\uB85D') hidePatchElement(actionButton)
          }
          return
        }
        if (backButton && !header.querySelector('.baby-header-back-button')) {
          var babyBackClone = document.createElement('button')
          babyBackClone.type = 'button'
          babyBackClone.className = 'baby-header-back-button'
          babyBackClone.textContent = getCleanText(backButton) || '\uBAA9\uB85D'
          babyBackClone.addEventListener('click', function () {
            var original = document.querySelector('.baby-detail .back-button')
            if (original) original.click()
          })
          header.appendChild(babyBackClone)
        }
      }

      if (title === '\uC77C\uAE30' || title === '\uAC00\uC871 \uC77C\uAE30') {
        var detailButton = actionButton && getCleanText(actionButton) === '\uC0C1\uC138' ? actionButton : null
        if (detailButton) hidePatchElement(detailButton)

        var diaryDetail = document.querySelector('.diary-detail-card')
        var diaryBack = diaryDetail && diaryDetail.querySelector('.back-button')
        if (diaryBack && !header.querySelector('.diary-header-back-button')) {
          var diaryBackClone = document.createElement('button')
          diaryBackClone.type = 'button'
          diaryBackClone.className = 'diary-header-back-button'
          diaryBackClone.textContent = getCleanText(diaryBack) || '\uBAA9\uB85D'
          diaryBackClone.addEventListener('click', function () {
            var original = document.querySelector('.diary-detail-card .back-button')
            if (original) original.click()
          })
          header.appendChild(diaryBackClone)
        }
      }
    })
  }

