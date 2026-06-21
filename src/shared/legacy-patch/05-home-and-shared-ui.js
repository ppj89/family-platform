  function enhanceAuthSso() {
    var card = document.querySelector('.auth-card')
    if (!card || card.dataset.ssoReady) return
    card.dataset.ssoReady = 'true'

    var submit = card.querySelector('.auth-submit')
    if (!submit) return

    var block = document.createElement('div')
    block.className = 'auth-sso-block'

    var divider = document.createElement('div')
    divider.className = 'auth-sso-divider'
    divider.textContent = 'SSO \uB85C\uADF8\uC778'
    block.appendChild(divider)

    var providerStatus = {}
    var statusLoaded = false
    var statusFailed = false
    var providers = [
      { key: 'naver', label: '\uB124\uC774\uBC84' },
      { key: 'google', label: '\uAD6C\uAE00' },
      { key: 'kakao', label: '\uCE74\uCE74\uC624' }
    ]

    function resolveSsoStartUrl(provider, item) {
      var startUrl = item && item.startUrl ? item.startUrl : '/auth/oauth/' + provider.key + '/start'
      var apiBase = window.FAMILY_PLATFORM_API_BASE_URL || localStorage.getItem('family-platform-api-base-url') || API_BASE_URL || '/api'
      if (/^https?:\/\//i.test(startUrl)) return startUrl
      if (startUrl.indexOf('/api/') === 0) {
        var rootBase = apiBase.replace(/\/api\/?$/, '')
        if (/^https?:\/\//i.test(rootBase)) return rootBase + startUrl
        return startUrl
      }
      return apiBase.replace(/\/$/, '') + (startUrl.charAt(0) === '/' ? startUrl : '/' + startUrl)
    }

    function updateProviderButtons() {
      providers.forEach(function (provider) {
        var button = block.querySelector('[data-sso-provider="' + provider.key + '"]')
        if (!button) return
        var item = providerStatus[provider.key]
        var configured = item && item.configured
        var unavailable = statusLoaded && !statusFailed && !configured
        button.classList.toggle('is-disabled', unavailable)
        button.title = unavailable ? '\uB3C4\uBA54\uC778\uACFC OAuth Client ID \uC124\uC815 \uD6C4 \uC5F0\uACB0\uB429\uB2C8\uB2E4.' : provider.label + ' \uB85C\uADF8\uC778'
      })
    }

    apiGetJson('/auth/oauth/providers').then(function (items) {
      providerStatus = {}
      ;(items || []).forEach(function (item) {
        providerStatus[item.provider] = item
      })
      statusLoaded = true
      statusFailed = false
      updateProviderButtons()
    }).catch(function () {
      statusLoaded = true
      statusFailed = true
      updateProviderButtons()
    })

    providers.forEach(function (provider) {
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'auth-sso-button ' + provider.key
      button.dataset.ssoProvider = provider.key
      button.textContent = provider.label + ' \uB85C\uADF8\uC778'
      button.addEventListener('click', function () {
        var item = providerStatus[provider.key]
        if (statusLoaded && !statusFailed && (!item || !item.configured)) {
          showPatchToast(provider.label + ' SSO\uB294 \uB3C4\uBA54\uC778\uACFC OAuth Client ID \uC124\uC815 \uD6C4 \uC5F0\uACB0\uB429\uB2C8\uB2E4.')
          return
        }
        window.location.href = resolveSsoStartUrl(provider, item)
      })
      block.appendChild(button)
    })

    updateProviderButtons()
    submit.insertAdjacentElement('afterend', block)
  }

  function hideReactOwnedElement(element) {
    if (!element) return
    hidePatchElement(element)
  }

  function enhanceHomeDashboard() {
    var content = document.querySelector('.content-grid')
    if (!content) return
    document.querySelectorAll('.sync-panel').forEach(function (panel) {
      hideReactOwnedElement(panel)
    })
    document.querySelectorAll('.topbar .custom-select, .topbar .user-chip').forEach(function (item) {
      hideReactOwnedElement(item)
    })

    Array.from(content.querySelectorAll('.summary-band')).forEach(function (panel) {
      hideReactOwnedElement(panel)
    })
    Array.from(content.querySelectorAll('.panel')).forEach(function (panel) {
      if (getCleanText(panel).indexOf('\uAC00\uC871 \uC0DD\uD65C \uB370\uC774\uD130') >= 0) hideReactOwnedElement(panel)
    })

    var panels = Array.from(content.querySelectorAll('.panel'))
    var todayPanel = panels.find(function (panel) {
      var h2 = panel.querySelector('.panel-header h2')
      return getCleanText(h2) === '\uC624\uB298 \uD560 \uC77C' || getCleanText(h2) === '\uC624\uB298\uC758 \uC77C\uC815'
    })

    if (todayPanel) {
      todayPanel.classList.add('home-today-schedule', 'full-span')
      var header = todayPanel.querySelector('.panel-header')
      var title = header && header.querySelector('h2')
      var action = header && header.querySelector('button')
      if (title && title.textContent !== '\uC624\uB298\uC758 \uC77C\uC815') title.textContent = '\uC624\uB298\uC758 \uC77C\uC815'
      if (action) {
        if (action.textContent !== '\uCE98\uB9B0\uB354') action.textContent = '\uCE98\uB9B0\uB354'
        if (!action.dataset.navReady) {
          action.dataset.navReady = 'true'
          action.addEventListener('click', function () { goMenu('\uCE98\uB9B0\uB354') })
        }
      }

      var list = todayPanel.querySelector('.task-list')
      if (list && !todayPanel.dataset.scheduleReady) {
        todayPanel.dataset.scheduleReady = 'true'
        list.innerHTML = ''
      }

      todayPanel.style.order = '-10'

      if (!todayPanel.dataset.navReady) {
        todayPanel.dataset.navReady = 'true'
        todayPanel.addEventListener('click', function (event) {
          if (event.target && event.target.closest && event.target.closest('button')) return
          goMenu('\uCE98\uB9B0\uB354')
        })
      }
    }

    var metricLinks = [
      ['\uC774\uBC88 \uB2EC \uC9C0\uCD9C', '\uAC00\uACC4\uBD80'],
      ['\uC5EC\uD589 \uB204\uC801', '\uC5EC\uD589'],
      ['\uC721\uC544 \uAE30\uB85D', '\uC721\uC544'],
      ['\uAC00\uC871 \uBA64\uBC84', '\uAC00\uC871\uADF8\uB8F9']
    ]
    document.querySelectorAll('.metric-grid .metric').forEach(function (metric) {
      if (metric.dataset.navReady) return
      var label = getCleanText(metric.querySelector('span'))
      var target = (metricLinks.find(function (item) { return item[0] === label }) || [])[1]
      if (!target) return
      metric.dataset.navReady = 'true'
      metric.setAttribute('role', 'button')
      metric.tabIndex = 0
      metric.addEventListener('click', function () { goMenu(target) })
      metric.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') goMenu(target)
      })
    })

    var summaryButtons = Array.from(document.querySelectorAll('.summary-actions button'))
    if (summaryButtons[0] && !summaryButtons[0].dataset.navReady) {
      summaryButtons[0].dataset.navReady = 'true'
      summaryButtons[0].addEventListener('click', function () { goMenu('\uAC00\uACC4\uBD80') })
    }
    if (summaryButtons[1] && !summaryButtons[1].dataset.navReady) {
      summaryButtons[1].dataset.navReady = 'true'
      summaryButtons[1].addEventListener('click', function () { goMenu('\uC77C\uAE30') })
    }

    document.querySelectorAll('.panel.wide .panel-header button').forEach(function (button) {
      if (getCleanText(button) !== '\uC804\uCCB4 \uBCF4\uAE30' || button.dataset.navReady) return
      button.dataset.navReady = 'true'
      button.addEventListener('click', function () { goMenu('\uAC00\uACC4\uBD80') })
    })
  }

  function hideBabyEmptySelectionPanel() {
    document.querySelectorAll('.panel').forEach(function (panel) {
      var title = getCleanText(panel.querySelector('.panel-header h2'))
      if (title === '\uC544\uC774 \uC120\uD0DD') {
        hidePatchElement(panel)
      }
    })
  }

  function enhanceBabyRecordMedia() {
    document.querySelectorAll('.baby-record-row').forEach(function (row) {
      var media = Array.from(row.querySelectorAll('img, video')).filter(function (item) {
        return !item.closest('.baby-record-media')
      })
      if (!media.length) return

      row.classList.add('has-media')
      var mediaWrap = row.querySelector('.baby-record-media')
      if (!mediaWrap) {
        mediaWrap = document.createElement('div')
        mediaWrap.className = 'baby-record-media'
        row.insertBefore(mediaWrap, row.firstChild)
      }

      media.slice(0, 3).forEach(function (item) {
        mediaWrap.appendChild(item)
      })
      if (media.length > 1) {
        mediaWrap.dataset.count = '+' + media.length
      }
    })
  }

  function cleanupBabyDetailButtons() {
    var detail = document.querySelector('.baby-detail')
    if (!detail) return

    var headerBack = document.querySelector('.panel-header .baby-header-back-button')
    var inlineBack = detail.querySelector('.back-button')
    if (headerBack && inlineBack) {
      hidePatchElement(inlineBack)
    }

    var mainHeader = Array.from(document.querySelectorAll('.panel-header')).find(function (header) {
      return getCleanText(header.querySelector('h2')) === '\uC721\uC544 \uAE30\uB85D'
    })
    if (mainHeader && !mainHeader.querySelector('.baby-header-back-button')) {
      var backButton = document.createElement('button')
      backButton.type = 'button'
      backButton.className = 'baby-header-back-button'
      backButton.textContent = '\uBAA9\uB85D'
      backButton.addEventListener('click', function () {
        var nav = findNavButton('\uC721\uC544') || findNavButtonContains('\uC721\uC544')
        if (nav) triggerNavButton(nav)
      })
      mainHeader.appendChild(backButton)
    }

    document.querySelectorAll('.growth-panel.insight-card .panel-header button, .pattern-panel.insight-card .panel-header button').forEach(function (button) {
      if (button.dataset.passiveInsightReady) return
      var badge = document.createElement('span')
      badge.className = 'passive-header-chip baby-insight-chip'
      badge.textContent = getCleanText(button) || '\uC0C1\uC138'
      badge.dataset.passiveInsightReady = 'true'
      button.replaceWith(badge)
    })
  }

  function getVisibleBabyProfile() {
    var band = document.querySelector('.baby-profile-band')
    if (!band) return null
    var name = getCleanText(band.querySelector('strong')) || '\uC544\uC774'
    var meta = getCleanText(band.querySelector('span'))
    var memo = getCleanText(band.querySelector('p'))
    var metric = getCleanText(band.querySelector('small'))
    var metaParts = meta.split('\u00B7').map(function (item) { return item.trim() }).filter(Boolean)
    var birthDate = metaParts.find(function (item) { return /^\d{4}-\d{2}-\d{2}$/.test(item) }) || todayText()
    var gender = metaParts[0] || null
    var heightMatch = metric.match(/(\d+(?:\.\d+)?)\s*cm/i)
    var weightMatch = metric.match(/(\d+(?:\.\d+)?)\s*kg/i)
    return {
      name: name,
      gender: gender,
      birthDate: birthDate,
      memo: memo,
      latestHeightCm: heightMatch ? Number(heightMatch[1]) : null,
      latestWeightKg: weightMatch ? Number(weightMatch[1]) : null
    }
  }

  function ensureApiBabyForDetail() {
    var detail = document.querySelector('.baby-detail')
    if (detail && detail.dataset.apiBabyId) return Promise.resolve(detail.dataset.apiBabyId)
    var profile = getVisibleBabyProfile()
    if (!profile) return Promise.reject(new Error('BABY_PROFILE_REQUIRED'))
    return fetchBabies().then(function (babies) {
      var found = babies.find(function (baby) {
        return String(baby.name || '').trim() === profile.name
      })
      if (found && found.id) return found.id
      return getCurrentFamilyId().then(function (familyId) {
        return postJson('/babies?familyId=' + encodeURIComponent(familyId), profile)
      }).then(function (baby) {
        return baby.id
      })
    })
  }

  function optionalDecimal(value) {
    var text = String(value || '').replace(/[^\d.]/g, '')
    var firstDot = text.indexOf('.')
    if (firstDot >= 0) {
      text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '')
    }
    return text ? Number(text) : null
  }

  function sanitizeDecimalText(value) {
    var text = String(value || '').replace(/[^\d.]/g, '')
    var firstDot = text.indexOf('.')
    if (firstDot < 0) return text
    return text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '')
  }

  function setBabyApiRecordBusy(form, busy) {
    if (!form) return
    form.querySelectorAll('button, input, textarea, select').forEach(function (field) {
      field.disabled = !!busy
    })
    var submit = form.querySelector('button[type="submit"]')
    if (submit) {
      if (!submit.dataset.originalText) submit.dataset.originalText = submit.textContent
      submit.textContent = busy ? '\uC800\uC7A5 \uC911' : submit.dataset.originalText
    }
  }

  function ensureBabyApiRecordForm() {
    var detail = document.querySelector('.baby-detail')
    if (!detail || detail.querySelector('.baby-api-record-card')) return

    var side = detail.querySelector('.baby-api-detail-side')
    var anchor = side || detail.querySelector('.record-filter-bar') || detail.querySelector('.baby-record-list') || detail.lastElementChild
    var card = document.createElement('section')
    card.className = 'baby-api-record-card'
    card.innerHTML = [
      '<header><div><span>\uC721\uC544 \uAE30\uB85D</span><strong>\uC0C8 \uAE30\uB85D \uCD94\uAC00</strong></div><small>\uC800\uC7A5 \uD6C4 \uAE30\uB85D\uC5D0 \uBC18\uC601\uB429\uB2C8\uB2E4.</small></header>',
      '<form class="baby-api-record-form">',
      '<div class="baby-api-form-grid">',
      '<label class="form-field"><span class="form-label">\uAE30\uB85D\uC885\uB958</span><input name="recordType" type="hidden" required value="\uC218\uC720" /><div class="custom-select baby-api-record-type-select"><button type="button" class="custom-select-trigger form-control" data-baby-record-type-trigger><span>\uC218\uC720</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="custom-select-list" hidden><button type="button" data-baby-record-type="\uC218\uC720">\uC218\uC720</button><button type="button" data-baby-record-type="\uB300\uBCC0">\uB300\uBCC0</button><button type="button" data-baby-record-type="\uC18C\uBCC0">\uC18C\uBCC0</button><button type="button" data-baby-record-type="\uC218\uBA74">\uC218\uBA74</button><button type="button" data-baby-record-type="\uC131\uC7A5">\uC131\uC7A5</button><button type="button" data-baby-record-type="\uBCD1\uC6D0">\uBCD1\uC6D0</button><button type="button" data-baby-record-type="\uBA54\uBAA8">\uBA54\uBAA8</button></div></div></label>',
      '<label class="date-picker-field baby-api-date-field form-field"><span class="form-label">\uB0A0\uC9DC</span><input name="recordDate" type="hidden" required value="' + todayText() + '" /><button type="button" class="date-picker-trigger baby-api-date-button form-control" data-baby-api-record-date-trigger><span>' + todayText().replace(/-/g, '.') + '</span><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2v4M16 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></label>',
      '<label class="form-field"><span class="form-label">\uC2DC\uAC04</span><input class="form-control" name="recordTime" type="text" inputmode="numeric" autocomplete="off" maxlength="5" value="' + currentTimeText() + '" /></label>',
      '<label class="form-field"><span class="form-label">\uC218\uC720\uB7C9(ml)</span><input class="form-control" name="amountMl" type="text" inputmode="numeric" /></label>',
      '<label class="form-field"><span class="form-label">\uD0A4(cm)</span><input class="form-control" name="heightCm" type="text" inputmode="decimal" autocomplete="off" /></label>',
      '<label class="form-field"><span class="form-label">\uBAB8\uBB34\uAC8C(kg)</span><input class="form-control" name="weightKg" type="text" inputmode="decimal" autocomplete="off" /></label>',
      '</div>',
      '<label class="baby-api-memo form-field"><span class="form-label">\uBA54\uBAA8</span><textarea class="form-control" name="memo" rows="3"></textarea></label>',
      '<label class="community-file-field baby-api-file-field"><span>\uC0AC\uC9C4/\uC601\uC0C1 \uCCA8\uBD80</span><b>\uD30C\uC77C \uC120\uD0DD</b><input name="files" type="file" accept="image/*,video/*" multiple /><small>' + mediaLimitText() + '</small></label>',
      '<div class="baby-api-record-actions"><button type="button" class="cancel-button" data-baby-api-clear>\uCD08\uAE30\uD654</button><button type="submit" class="save-button">\uC800\uC7A5</button></div>',
      '</form>'
    ].join('')

    if (side) {
      side.appendChild(card)
    } else if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(card, anchor)
    } else {
      detail.appendChild(card)
    }
    bindBabyApiRecordDateField(card)
    bindBabyApiRecordTypeSelect(card)
  }

  function bindBabyApiRecordTypeSelect(scope) {
    var select = scope && scope.querySelector('.baby-api-record-type-select')
    if (!select || select.dataset.ready === 'true') return
    select.dataset.ready = 'true'
    var trigger = select.querySelector('[data-baby-record-type-trigger]')
    var list = select.querySelector('.custom-select-list')
    var input = scope.querySelector('[name="recordType"]')
    if (!trigger || !list || !input) return
    trigger.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      var open = list.hidden
      document.querySelectorAll('.custom-select.open').forEach(function (item) {
        item.classList.remove('open')
        var itemList = item.querySelector('.custom-select-list')
        if (itemList) itemList.hidden = true
      })
      list.hidden = !open
      select.classList.toggle('open', open)
      trigger.classList.toggle('open', open)
    })
    list.querySelectorAll('[data-baby-record-type]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        input.value = button.dataset.babyRecordType || ''
        var label = trigger.querySelector('span')
        if (label) label.textContent = input.value || '\uC120\uD0DD'
        list.hidden = true
        select.classList.remove('open')
        trigger.classList.remove('open')
      })
    })
  }

  function bindBabyApiRecordDateField(scope) {
    var input = scope && scope.querySelector('[name="recordDate"]')
    var trigger = scope && scope.querySelector('[data-baby-api-record-date-trigger]')
    if (!input || !trigger || trigger.dataset.babyApiDateReady === 'true') return
    trigger.dataset.babyApiDateReady = 'true'
  }

  function handleBabyApiRecordDateTrigger(event, skipRecentPointer) {
    var trigger = event.target && event.target.closest && event.target.closest('[data-baby-api-record-date-trigger]')
    if (!trigger) return false
    if (skipRecentPointer && trigger.dataset.babyApiPointerAt && Date.now() - Number(trigger.dataset.babyApiPointerAt) < 600) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      return true
    }
    var form = trigger.closest('.baby-api-record-form')
    var input = form && form.querySelector('[name="recordDate"]')
    if (!input) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (event.type === 'pointerdown') trigger.dataset.babyApiPointerAt = String(Date.now())
    toggleCommonDatePopover(input, trigger)
    return true
  }

  function bindBabyGrowthDateField(scope) {
    var input = scope && scope.querySelector('.baby-growth-api-form [name="recordDate"]')
    var trigger = scope && scope.querySelector('[data-baby-growth-date-trigger]')
    if (!input || !trigger || trigger.dataset.babyGrowthDateReady === 'true') return
    trigger.dataset.babyGrowthDateReady = 'true'
  }

  function handleBabyGrowthDateTrigger(event, skipRecentPointer) {
    var trigger = event.target && event.target.closest && event.target.closest('[data-baby-growth-date-trigger]')
    if (!trigger) return false
    if (skipRecentPointer && trigger.dataset.babyGrowthPointerAt && Date.now() - Number(trigger.dataset.babyGrowthPointerAt) < 600) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation) event.stopImmediatePropagation()
      return true
    }
    var form = trigger.closest('.baby-growth-api-form')
    var input = form && form.querySelector('[name="recordDate"]')
    if (!input) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    if (event.type === 'pointerdown') trigger.dataset.babyGrowthPointerAt = String(Date.now())
    toggleCommonDatePopover(input, trigger)
    return true
  }

  document.addEventListener('pointerdown', function (event) {
    handleBabyApiRecordDateTrigger(event, false)
    handleBabyGrowthDateTrigger(event, false)
  }, true)

  document.addEventListener('click', function (event) {
    handleBabyApiRecordDateTrigger(event, true)
    handleBabyGrowthDateTrigger(event, true)
  }, true)

  document.addEventListener('pointerdown', closeBabyCommonDatePopoverOnOutsideEvent, true)
  document.addEventListener('focusin', closeBabyCommonDatePopoverOnOutsideEvent, true)

  function enhanceBabyEditMediaHelper() {
    document.querySelectorAll('.baby-record-row .edit-button').forEach(function (button) {
      if (button.dataset.mediaEditReady) return
      button.dataset.mediaEditReady = 'true'
      button.addEventListener('click', function () {
        window.setTimeout(function () {
          var photoInput = Array.from(document.querySelectorAll('.photo-input, label, div')).find(function (item) {
            var panel = item.closest('.panel, form, article')
            var text = getCleanText(panel)
            var itemText = getCleanText(item)
            return itemText.indexOf('\uC0AC\uC9C4') >= 0 && (text.indexOf('\uC721\uC544') >= 0 || text.indexOf('\uAE30\uB85D') >= 0 || text.indexOf('\uC0AC\uC9C4') >= 0)
          })
          if (!photoInput) return
          photoInput.classList.add('media-edit-target')
          if (!photoInput.querySelector('.media-edit-helper')) {
            var helper = document.createElement('small')
            helper.className = 'media-edit-helper'
            helper.textContent = '\uC0AC\uC9C4/\uC601\uC0C1\uC740 \uC218\uC815 \uC800\uC7A5 \uC804\uC5D0 \uC0C8 \uD30C\uC77C\uC744 \uC120\uD0DD\uD558\uBA74 \uAD50\uCCB4\uB429\uB2C8\uB2E4.'
            photoInput.appendChild(helper)
          }
          photoInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 180)
      }, true)
    })
  }

  function setGrowthMode(dialog, mode) {
    dialog.dataset.growthMode = mode
    dialog.querySelectorAll('.growth-tab-button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.growthMode === mode)
    })

    var desc = dialog.querySelector('header p')
    if (desc) {
      desc.textContent = mode === 'height'
        ? 'X\uCD95\uC740 \uB0A0\uC9DC, Y\uCD95\uC740 \uD0A4(cm)\uC785\uB2C8\uB2E4.'
        : 'X\uCD95\uC740 \uB0A0\uC9DC, Y\uCD95\uC740 \uBAB8\uBB34\uAC8C(kg)\uC785\uB2C8\uB2E4.'
    }

    dialog.querySelectorAll('.growth-history.detailed span').forEach(function (span) {
      if (!span.dataset.fullText) span.dataset.fullText = span.textContent.trim()
      var parts = span.dataset.fullText.split('\u00B7').map(function (item) { return item.trim() })
      var value = mode === 'height'
        ? (parts.find(function (item) { return item.indexOf('cm') >= 0 }) || '-')
        : (parts.find(function (item) { return item.indexOf('kg') >= 0 }) || '-')
      span.textContent = value
    })
  }

  function enhanceBabyGrowthTabs() {
    document.querySelectorAll('.insight-dialog').forEach(function (dialog) {
      var title = getCleanText(dialog.querySelector('h2'))
      if (title !== '\uC131\uC7A5\uACE1\uC120' || dialog.dataset.growthTabsReady) return
      dialog.dataset.growthTabsReady = 'true'

      var header = dialog.querySelector('header')
      if (!header) return

      var tabs = document.createElement('div')
      tabs.className = 'growth-tab-switch'

      var heightButton = document.createElement('button')
      heightButton.type = 'button'
      heightButton.className = 'growth-tab-button'
      heightButton.dataset.growthMode = 'height'
      heightButton.textContent = '\uD0A4'

      var weightButton = document.createElement('button')
      weightButton.type = 'button'
      weightButton.className = 'growth-tab-button'
      weightButton.dataset.growthMode = 'weight'
      weightButton.textContent = '\uBAB8\uBB34\uAC8C'

      heightButton.addEventListener('click', function () {
        setGrowthMode(dialog, 'height')
      })

      weightButton.addEventListener('click', function () {
        setGrowthMode(dialog, 'weight')
      })

      tabs.appendChild(heightButton)
      tabs.appendChild(weightButton)
      header.insertAdjacentElement('afterend', tabs)
      setGrowthMode(dialog, 'height')
    })
  }

