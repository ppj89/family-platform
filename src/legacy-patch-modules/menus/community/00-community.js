  var communityState = {
    activeTab: 'notice',
    view: 'list',
    selectedPostId: null,
    composing: false,
    editingPostId: null,
    loadingTabs: {},
    loadedTabs: {},
    best: { daily: [], weekly: [], monthly: [] },
    bestLoading: false,
    bestLoadedAt: 0,
    notice: [],
    free: [],
    inquiry: []
  }

  function isAdminRole() {
    if (readStoredAuthUser()) return true
    var role = getCleanText(document.querySelector('.user-chip strong'))
    return role.indexOf('\uAD00\uB9AC\uC790') >= 0 || role.indexOf('admin') >= 0
  }

  function ensureCommunityMenu() {
    var navList = document.querySelector('.nav-list')
    if (!navList) return
    if (document.querySelector('.auth-card')) return

    if (document.documentElement.dataset.patchPage !== 'community') {
      var staleContent = document.querySelector('.content-grid.community-grid')
      if (staleContent) {
        staleContent.classList.remove('community-grid')
        staleContent.classList.remove('community-source-hidden')
        delete staleContent.dataset.communityReady
      }
      var staleRoot = document.querySelector('.patch-community-root')
      if (staleRoot) staleRoot.remove()
    }

    var existing = document.querySelector('.community-nav-item') || findNavButtonContains('\uCEE4\uBBA4\uB2C8\uD2F0')
    if (!isAdminRole()) {
      if (existing) existing.remove()
      if (document.documentElement.dataset.patchPage === 'community') {
        delete document.documentElement.dataset.patchPage
      }
      return
    }

    if (!existing) {
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'nav-item community-nav-item'
      button.innerHTML = '<span class="community-nav-icon" aria-hidden="true"></span><span>\uCEE4\uBBA4\uB2C8\uD2F0</span>'
      var anchor = findNavButton('\uAD00\uB9AC\uC790') || findNavButton('\uB9DB\uC9D1')
      if (anchor && anchor.parentElement === navList) {
        navList.insertBefore(button, anchor)
      } else {
        navList.appendChild(button)
      }
      existing = button
    } else {
      existing.classList.add('community-nav-item')
    }

    var icon = existing.querySelector('.community-nav-icon')
    if (icon) {
      icon.setAttribute('aria-hidden', 'true')
      icon.textContent = ''
    }

    if (!existing.dataset.communityWired) {
      existing.dataset.communityWired = 'true'
      var communityHandler = function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation) event.stopImmediatePropagation()
        queueOpenCommunityPage(true)
      }
      existing.addEventListener('click', communityHandler, true)
      existing.onclick = communityHandler
    }

    if (document.documentElement.dataset.patchPage === 'community') {
      existing.classList.add('active')
      renderCommunityPage(false)
    }
  }

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!nav || isCommunityNavItem(nav) || isFamilyGroupNavItem(nav)) return
    var wasCommunity = document.documentElement.dataset.patchPage === 'community'
    var wasFamilyGroup = document.documentElement.dataset.patchPage === 'family-group'
    if (wasCommunity || wasFamilyGroup) {
      var label = getCleanText(nav)
      clearCustomPatchPageNow()
      ;[450, 1100, 1800].forEach(function (delay) {
        window.setTimeout(function () {
          cleanupPatchRootsForCurrentMenu()
          if (!label || document.querySelector('.auth-card')) return
          if (document.documentElement.dataset.patchPage) return
          var currentTitle = getCleanText(document.querySelector('.topbar h1, h1'))
          if (currentTitle === label) return
          var target = findNavButton(label)
          if (target) triggerNavButton(target)
        }, delay)
      })
      window.setTimeout(function () {
        if (!label || document.querySelector('.auth-card')) return
        if (document.documentElement.dataset.patchPage) return
        var currentTitle = getCleanText(document.querySelector('.topbar h1, h1'))
        if (currentTitle === label) return
        if (label === '\uC721\uC544') {
          openRecoveredBabyPage()
          return
        }
        try {
          var reloadState = JSON.parse(sessionStorage.getItem('family-platform-nav-reload-state') || '{}')
          if (reloadState.label === label && Date.now() - Number(reloadState.at || 0) < 10000) return
          sessionStorage.setItem('family-platform-nav-reload-state', JSON.stringify({ label: label, at: Date.now() }))
        } catch {}
        setPendingNavLabel(label)
        try {
          var url = new URL(window.location.href)
          url.searchParams.set('recoverNav', label)
          url.searchParams.set('navRecoverAt', String(Date.now()))
          window.location.replace(url.toString())
        } catch {
          window.location.reload()
        }
      }, 2200)
    }
  }, true)

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!isRestaurantNavItem(nav)) return
    clearCustomPatchPageNow()
    window.setTimeout(function () {
      cleanupPatchRootsForCurrentMenu()
      renderRestaurantPageFromApi()
      syncRestaurantMenuState()
    }, 0)
    window.setTimeout(function () {
      cleanupPatchRootsForCurrentMenu()
      renderRestaurantPageFromApi()
      syncRestaurantMenuState()
    }, 350)
    window.setTimeout(function () {
      cleanupPatchRootsForCurrentMenu()
      renderRestaurantPageFromApi()
      syncRestaurantMenuState()
    }, 900)
  }, true)

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!isLedgerNavItem(nav)) return
    ;[0, 350, 900, 1600].forEach(function (delay) {
      window.setTimeout(function () {
        renderLedgerPageFromApi(true)
      }, delay)
    })
  }, true)

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!isCommunityNavItem(nav)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    clearFamilyGroupPage()
    queueOpenCommunityPage(true)
  }, true)

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest && event.target.closest('button,a,[role="button"],.nav-item')
    if (!target || target.closest('.auth-card')) return
    if (getCleanText(target) !== '\uCEE4\uBBA4\uB2C8\uD2F0') return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    clearFamilyGroupPage()
    queueOpenCommunityPage(true)
  }, true)

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest && event.target.closest('.nav-item')
    if (!isFamilyGroupNavItem(nav)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.stopImmediatePropagation) event.stopImmediatePropagation()
    queueOpenFamilyGroupPage()
  }, true)

  function openCommunityPage(force) {
    pausePatchObserver()
    try {
      document.documentElement.dataset.patchPage = 'community'
      document.querySelectorAll('.nav-item.active').forEach(function (item) {
        item.classList.remove('active')
      })
      var nav = findNavButtonContains('\uCEE4\uBBA4\uB2C8\uD2F0')
      if (!nav) nav = document.querySelector('.community-nav-item')
      if (nav) nav.classList.add('active')
      renderCommunityPage(force)
    } finally {
      resumePatchObserver()
    }
  }

  function communityTabLabel(tab) {
    if (tab === 'free') return '\uC790\uC720\uAC8C\uC2DC\uD310'
    if (tab === 'inquiry') return '\uBB38\uC758\uC0AC\uD56D'
    return '\uACF5\uC9C0\uC0AC\uD56D'
  }

  function communityItems(tab) {
    return communityState[tab] || communityState.notice
  }

  function formatCommunityInstant(value) {
    if (!value) return { date: '', time: '' }
    var date = new Date(value)
    if (Number.isNaN(date.getTime())) return { date: String(value).slice(0, 10), time: '' }
    return {
      date: formatDisplayDate(date),
      time: String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
    }
  }

  function communityFileFromUrl(url) {
    var name = String(url || '').split('/').pop() || '\uCCA8\uBD80\uD30C\uC77C'
    return { name: name, size: '', url: url, contentType: '' }
  }

  function communityMediaUrls(files) {
    return (files || []).map(function (file) { return file.url || '' }).filter(Boolean)
  }

  function normalizeCommunityComment(item) {
    var when = formatCommunityInstant(item.createdAt || item.updatedAt)
    return {
      id: String(item.id),
      serverId: item.id,
      author: item.authorName || '\uC0AC\uC6A9\uC790',
      time: (when.date && when.time) ? (when.date + ' ' + when.time) : communityNowText(),
      text: item.body || ''
    }
  }

  function normalizeCommunityPost(item, detailComments) {
    var when = formatCommunityInstant(item.createdAt || item.updatedAt)
    return {
      id: String(item.id),
      serverId: item.id,
      title: item.title || '',
      body: item.body || '',
      author: item.authorName || '\uC0AC\uC6A9\uC790',
      date: when.date,
      time: when.time,
      files: (item.mediaUrls || []).map(communityFileFromUrl),
      views: Number(item.viewCount || item.views || 0),
      periodViews: Number(item.periodViewCount || item.periodViews || 0),
      comments: (detailComments || []).map(normalizeCommunityComment)
    }
  }

  function replaceCommunityPost(tab, post) {
    var list = communityItems(tab)
    var index = list.findIndex(function (item) { return item.id === post.id || item.serverId === post.serverId })
    if (index >= 0) list[index] = post
    else list.unshift(post)
  }

  function loadCommunityList(tab, force) {
    if (!getStoredAuthToken()) return Promise.resolve([])
    if (!force && communityState.loadedTabs[tab]) return Promise.resolve(communityItems(tab))
    if (communityState.loadingTabs[tab]) return communityState.loadingTabs[tab]
    var path = '/community/posts?boardType=' + encodeURIComponent(tab)
    communityState.loadingTabs[tab] = apiRequest(path).then(function (items) {
      communityState[tab] = (Array.isArray(items) ? items : []).map(function (item) {
        return normalizeCommunityPost(item, [])
      })
      communityState.loadedTabs[tab] = true
      return communityState[tab]
    }).catch(function () {
      return communityItems(tab)
    }).finally(function () {
      delete communityState.loadingTabs[tab]
    })
    return communityState.loadingTabs[tab]
  }

  function loadCommunityDetail(tab, postId) {
    var post = findCommunityPost(tab, postId)
    if (!post || !post.serverId) return Promise.resolve(post)
    return apiRequest('/community/posts/' + encodeURIComponent(post.serverId)).then(function (detail) {
      var next = normalizeCommunityPost(detail.post || {}, detail.comments || [])
      replaceCommunityPost(tab, next)
      if (tab === 'free') loadCommunityBestPosts(true)
      return next
    }).catch(function () {
      return post
    })
  }

  function loadCommunityBestPosts(force) {
    if (!getStoredAuthToken()) return Promise.resolve(communityState.best)
    if (communityState.bestLoading) return Promise.resolve(communityState.best)
    if (!force && communityState.bestLoadedAt && Date.now() - communityState.bestLoadedAt < 30000) {
      return Promise.resolve(communityState.best)
    }
    communityState.bestLoading = true
    var periods = ['daily', 'weekly', 'monthly']
    return Promise.all(periods.map(function (period) {
      return apiRequest('/community/posts/best?boardType=free&period=' + period).then(function (items) {
        return (Array.isArray(items) ? items : []).map(function (item) {
          return normalizeCommunityPost(item, [])
        })
      }).catch(function () {
        return []
      })
    })).then(function (results) {
      communityState.best = {
        daily: results[0],
        weekly: results[1],
        monthly: results[2]
      }
      communityState.bestLoadedAt = Date.now()
      if (document.documentElement.dataset.patchPage === 'community' && communityState.activeTab === 'free' && communityState.view === 'list') {
        renderCommunityPage(true)
      }
      return communityState.best
    }).finally(function () {
      communityState.bestLoading = false
    })
  }

  function communityPostPayload(tab, title, body, files) {
    return getCurrentFamilyId().catch(function () {
      return null
    }).then(function (familyId) {
      return {
        boardType: tab,
        familyId: tab === 'inquiry' ? familyId : null,
        title: title,
        body: body,
        mediaUrls: communityMediaUrls(files)
      }
    })
  }

  function communityNowText() {
    var now = new Date()
    return formatDisplayDate(now) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  }

  function formatMediaBytes(bytes) {
    if (!bytes) return '0MB'
    return (bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + 'MB'
  }

  function mediaLimitText() {
    return '\uC0AC\uC9C4 ' + formatMediaBytes(MEDIA_MAX_IMAGE_BYTES) + ', \uC601\uC0C1 ' + formatMediaBytes(MEDIA_MAX_VIDEO_BYTES) +
      ', \uCD5C\uB300 ' + MEDIA_MAX_FILES + '\uAC1C, \uD569\uACC4 ' + formatMediaBytes(MEDIA_MAX_TOTAL_BYTES) + '\uAE4C\uC9C0'
  }

  function validateMediaFiles(input) {
    if (!input || !input.files || !input.files.length) return true
    var files = Array.from(input.files)
    var total = files.reduce(function (sum, file) { return sum + (file.size || 0) }, 0)
    var invalid = files.find(function (file) {
      if ((file.type || '').indexOf('video/') === 0) return file.size > MEDIA_MAX_VIDEO_BYTES
      return file.size > MEDIA_MAX_IMAGE_BYTES
    })
    if (files.length > MEDIA_MAX_FILES) {
      input.value = ''
      showPatchToast('\uCCA8\uBD80\uD30C\uC77C\uC740 \uD55C \uBC88\uC5D0 ' + MEDIA_MAX_FILES + '\uAC1C\uAE4C\uC9C0\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4.')
      return false
    }
    if (invalid) {
      input.value = ''
      showPatchToast('\uD30C\uC77C \uC6A9\uB7C9\uC774 \uD07D\uB2C8\uB2E4. ' + mediaLimitText() + '\uB85C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.')
      return false
    }
    if (total > MEDIA_MAX_TOTAL_BYTES) {
      input.value = ''
      showPatchToast('\uCCA8\uBD80 \uD569\uACC4 \uC6A9\uB7C9\uC774 \uD07D\uB2C8\uB2E4. \uD569\uACC4 ' + formatMediaBytes(MEDIA_MAX_TOTAL_BYTES) + '\uAE4C\uC9C0\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4.')
      return false
    }
    return true
  }

  function enhanceMediaUploadLimits() {
    document.querySelectorAll('input[type="file"]').forEach(function (input) {
      if (input.dataset.mediaLimitReady) return
      input.dataset.mediaLimitReady = 'true'
      input.addEventListener('change', function () {
        validateMediaFiles(input)
      }, true)
    })
    document.querySelectorAll('.community-file-field small, .media-edit-helper').forEach(function (hint) {
      if (hint.dataset.mediaPolicyHint) return
      hint.dataset.mediaPolicyHint = 'true'
      hint.title = mediaLimitText()
    })
  }

  function findCommunityPost(tab, id) {
    return communityItems(tab).find(function (item) {
      return item.id === id
    }) || null
  }

  function getCommunityFileNames(input) {
    if (!input || !input.files || !input.files.length) return []
    if (!validateMediaFiles(input)) return []
    return Array.from(input.files).map(function (file) {
      return { name: file.name, size: formatMediaBytes(file.size || 0), contentType: file.type || '' }
    })
  }

  function uploadMediaFile(file, familyId) {
    var token = getStoredAuthToken()
    if (!token) return Promise.reject(new Error('LOGIN_REQUIRED'))

    var formData = new FormData()
    formData.append('file', file)
    if (familyId) formData.append('familyId', String(familyId))

    return fetch(API_BASE_URL + '/media', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: formData
    }).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (message) {
          throw new Error(message || ('API ' + response.status))
        })
      }
      return response.json()
    }).then(function (item) {
      return {
        name: item.originalFileName || file.name,
        size: formatMediaBytes(item.size || file.size || 0),
        url: item.url || '',
        contentType: item.contentType || file.type || ''
      }
    })
  }

  function uploadMediaFiles(input) {
    if (!input || !input.files || !input.files.length) return Promise.resolve([])
    if (!validateMediaFiles(input)) return Promise.reject(new Error('INVALID_MEDIA'))
    var files = Array.from(input.files)
    return getCurrentFamilyId().catch(function () {
      return null
    }).then(function (familyId) {
      return Promise.all(files.map(function (file) {
        return uploadMediaFile(file, familyId)
      }))
    })
  }

  function uploadCommunityFiles(input) {
    return uploadMediaFiles(input)
  }

  function setCommunityFormBusy(form, busy) {
    if (!form) return
    form.querySelectorAll('button, input, textarea').forEach(function (field) {
      field.disabled = !!busy
    })
    var submit = form.querySelector('button[type="submit"]')
    if (submit) {
      if (!submit.dataset.originalText) submit.dataset.originalText = submit.textContent
      submit.textContent = busy ? '\uC5C5\uB85C\uB4DC \uC911' : submit.dataset.originalText
    }
  }

  function showPatchConfirm(message, onConfirm) {
    var old = document.querySelector('.patch-confirm-backdrop')
    if (old) old.remove()
    var backdrop = document.createElement('div')
    backdrop.className = 'patch-confirm-backdrop'
    backdrop.innerHTML = [
      '<section class="patch-confirm-dialog">',
      '<h2>\uD655\uC778</h2>',
      '<p>' + escapeHtml(message) + '</p>',
      '<div><button type="button" class="cancel-button" data-patch-confirm-cancel>\uCDE8\uC18C</button><button type="button" data-patch-confirm-ok>\uD655\uC778</button></div>',
      '</section>'
    ].join('')
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop || event.target.closest('[data-patch-confirm-cancel]')) backdrop.remove()
      if (event.target.closest('[data-patch-confirm-ok]')) {
        backdrop.remove()
        onConfirm()
      }
    })
    document.body.appendChild(backdrop)
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
    })
  }

  function renderCommunityPage(force) {
    if (document.documentElement.dataset.patchPage !== 'community') return
    var workspace = document.querySelector('.workspace')
    var content = document.querySelector('.content-grid')
    if (!workspace) return
    if (!content) {
      content = document.createElement('div')
      content.className = 'content-grid community-source-hidden'
      workspace.appendChild(content)
    }

    var eyebrow = document.querySelector('.topbar .eyebrow')
    var title = document.querySelector('.topbar h1')
    if (eyebrow) eyebrow.textContent = '\uACF5\uC9C0, \uC790\uC720\uAC8C\uC2DC\uD310, \uBB38\uC758'
    if (title) title.textContent = '\uCEE4\uBBA4\uB2C8\uD2F0'

    var root = document.querySelector('.patch-community-root')
    if (!root) {
      root = document.createElement('div')
      root.className = 'patch-community-root community-grid'
      content.insertAdjacentElement('afterend', root)
    }

    content.classList.add('community-source-hidden')
    if (!force && root.dataset.communityReady === communityState.activeTab) return
    root.dataset.communityReady = communityState.activeTab

    var tab = communityState.activeTab
    var admin = isAdminRole()
    var bodyHtml = renderCommunityBoard(tab, admin)
    root.innerHTML = [
      '<section class="panel wide community-panel">',
      '<div class="community-hero">',
      '<div><span>Community</span><h2>\uAC00\uC871\uC744 \uB118\uC5B4 \uD568\uAED8 \uB098\uB204\uB294 \uACF5\uAC04</h2><p>\uC790\uC720\uAC8C\uC2DC\uD310\uC740 \uC804\uCCB4 \uC0AC\uC6A9\uC790\uC640 \uACF5\uC720\uD558\uACE0, \uACF5\uC9C0\uC0AC\uD56D\uACFC \uBB38\uC758\uC0AC\uD56D\uC740 \uAD00\uB9AC\uC790 \uAD8C\uD55C\uC73C\uB85C \uC791\uC131\uD569\uB2C8\uB2E4.</p></div>',
      '<strong>\uBA54\uB274 \uB178\uCD9C\uAD8C\uD55C<br><b>\uAD00\uB9AC\uC790</b></strong>',
      '</div>',
      '<div class="community-tabs">',
      ['notice', 'free', 'inquiry'].map(function (key) {
        return '<button type="button" class="' + (tab === key ? 'active' : '') + '" data-community-tab="' + key + '">' + communityTabLabel(key) + '</button>'
      }).join(''),
      '</div>',
      bodyHtml,
      '</section>'
    ].join('')

    wireCommunityPage()
    if (tab === 'free' && communityState.view === 'list') loadCommunityBestPosts(false)
  }

  function renderCommunityComposer(tab, admin) {
    var adminOnly = tab !== 'free'
    if (adminOnly && !admin) {
      return '<div class="community-locked">\uAD00\uB9AC\uC790\uB9CC \uC791\uC131\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</div>'
    }
    var label = adminOnly ? '\uAD00\uB9AC\uC790 \uC791\uC131' : '\uC0C8 \uAE00 \uC791\uC131'
    return [
      '<form class="community-composer" data-community-compose="' + tab + '">',
      '<div class="community-composer-title"><strong>' + label + '</strong><span>' + (adminOnly ? '\uAD00\uB9AC\uC790 \uAD8C\uD55C' : '\uC804\uCCB4 \uACF5\uAC1C') + '</span></div>',
      '<input name="title" />',
      '<textarea name="body" rows="3"></textarea>',
      '<button type="submit">\uB4F1\uB85D</button>',
      '</form>'
    ].join('')
  }

  function renderCommunityFreeBoard() {
    if (communityState.view === 'detail' && communityState.selectedPostId) {
      return renderCommunityFreeDetail()
    }
    return [
      '<div class="community-board-toolbar">',
      '<div><strong>\uC790\uC720\uAC8C\uC2DC\uD310</strong></div>',
      '<button type="button" data-community-compose-toggle>' + (communityState.composing ? '\uC791\uC131 \uB2EB\uAE30' : '\uAE00\uC4F0\uAE30') + '</button>',
      '</div>',
      communityState.composing ? renderCommunityFreeEditor(null) : '',
      '<div class="community-free-list">',
      communityItems('free').map(function (post) {
        return [
          '<button type="button" class="community-free-row" data-community-open-post="' + escapeHtml(post.id) + '">',
          '<strong>' + escapeHtml(post.title) + '</strong>',
          '<span>' + escapeHtml(post.author) + ' · ' + escapeHtml(post.date || '') + ' ' + escapeHtml(post.time || '') + ' · \uB313\uAE00 ' + ((post.comments || []).length) + '</span>',
          '</button>'
        ].join('')
      }).join(''),
      '</div>'
    ].join('')
  }

  function renderCommunityFreeEditor(post) {
    var editing = !!post
    return [
      '<form class="community-composer community-free-editor" data-community-compose="free" data-edit-post="' + (editing ? escapeHtml(post.id) : '') + '">',
      '<div class="community-composer-title"><strong>' + (editing ? '\uAE00 \uC218\uC815' : '\uC0C8 \uAE00 \uC791\uC131') + '</strong><span>\uC0AC\uC9C4 \uCCA8\uBD80 \uAC00\uB2A5</span></div>',
      '<input name="title" value="' + escapeHtml(post ? post.title : '') + '" />',
      '<textarea name="body" rows="5">' + escapeHtml(post ? post.body : '') + '</textarea>',
      '<label class="community-file-field"><span>\uC0AC\uC9C4/\uC601\uC0C1 \uCCA8\uBD80</span><input name="files" type="file" accept="image/*,video/*" multiple /><small>' + ((post && post.files && post.files.length) ? post.files.map(function (file) { return escapeHtml(file.name) }).join(', ') : mediaLimitText()) + '</small></label>',
      '<div class="community-editor-actions"><button type="button" class="cancel-button" data-community-cancel-edit>\uCDE8\uC18C</button><button type="submit">' + (editing ? '\uC800\uC7A5' : '\uB4F1\uB85D') + '</button></div>',
      '</form>'
    ].join('')
  }

  function renderCommunityFreeDetail() {
    var post = findCommunityPost('free', communityState.selectedPostId)
    if (!post) {
      communityState.view = 'list'
      communityState.selectedPostId = null
      return renderCommunityFreeBoard()
    }
    return [
      '<div class="community-detail">',
      '<div class="community-detail-top"><button type="button" data-community-back-list>\uBAA9\uB85D</button><div><button type="button" data-community-edit-post="' + escapeHtml(post.id) + '">\uC218\uC815</button><button type="button" class="danger-button" data-community-delete-post="' + escapeHtml(post.id) + '">\uC0AD\uC81C</button></div></div>',
      communityState.editingPostId === post.id ? renderCommunityFreeEditor(post) : [
        '<article class="community-detail-article">',
        '<h3>' + escapeHtml(post.title) + '</h3>',
        '<span>' + escapeHtml(post.author) + ' · ' + escapeHtml(post.date || '') + ' ' + escapeHtml(post.time || '') + '</span>',
        '<p>' + escapeHtml(post.body) + '</p>',
        renderCommunityFiles(post.files || []),
        '</article>'
      ].join(''),
      '<section class="community-detail-comments"><strong>\uB313\uAE00 ' + ((post.comments || []).length) + '</strong>',
      renderCommunityComments(post),
      '</section>',
      '</div>'
    ].join('')
  }

  function renderCommunityFiles(files) {
    if (!files || !files.length) return ''
    return '<div class="community-files">' + files.map(function (file) {
      return '<a href="#" download="' + escapeHtml(file.name) + '" data-community-download="' + escapeHtml(file.name) + '"><span>' + escapeHtml(file.name) + '</span><small>' + escapeHtml(file.size || '') + ' · \uB2E4\uC6B4\uB85C\uB4DC</small></a>'
    }).join('') + '</div>'
  }

  function renderCommunityPosts(tab) {
    return communityItems(tab).map(function (post) {
      var comments = post.comments || []
      return [
        '<article class="community-post" data-post-id="' + escapeHtml(post.id) + '">',
        '<div class="community-post-head"><div><span>' + communityTabLabel(tab) + '</span><h3>' + escapeHtml(post.title) + '</h3></div><small>' + escapeHtml(post.date) + '</small></div>',
        '<p>' + escapeHtml(post.body) + '</p>',
        '<div class="community-post-meta"><span>' + escapeHtml(post.author) + '</span><span>' + (tab === 'free' ? '\uC804\uCCB4 \uACF5\uAC1C' : '\uAD00\uB9AC\uC790') + '</span><span>\uB313\uAE00 ' + comments.length + '</span></div>',
        tab === 'free' ? renderCommunityComments(post) : '',
        '</article>'
      ].join('')
    }).join('')
  }

  function renderCommunityComments(post) {
    var comments = post.comments || []
    return [
      '<div class="community-comments">',
      comments.map(function (comment) {
        return '<div class="community-comment" data-comment-id="' + escapeHtml(comment.id || '') + '"><div><strong>' + escapeHtml(comment.author) + '</strong><small>' + escapeHtml(comment.time || '') + '</small></div><span>' + escapeHtml(comment.text) + '</span><div class="community-comment-actions"><button type="button" data-edit-comment="' + escapeHtml(comment.id || '') + '">\uC218\uC815</button><button type="button" data-delete-comment="' + escapeHtml(comment.id || '') + '">\uC0AD\uC81C</button></div></div>'
      }).join(''),
      '<form class="community-comment-form" data-comment-post="' + escapeHtml(post.id) + '">',
      '<input name="comment" />',
      '<button type="submit">\uB4F1\uB85D</button>',
      '</form>',
      '</div>'
    ].join('')
  }

  function renderCommunityThumb(post) {
    var hasFile = post.files && post.files.length
    var first = hasFile ? post.files[0] : null
    var isVideo = first && String(first.contentType || first.name || '').toLowerCase().indexOf('video') >= 0
    return '<span class="community-list-thumb ' + (hasFile ? 'has-file' : '') + '">' + (hasFile ? (isVideo ? '\uC601\uC0C1' : '\uC0AC\uC9C4') : '') + '</span>'
  }

  function renderCommunityFiles(files) {
    if (!files || !files.length) return ''
    return '<div class="community-files">' + files.map(function (file) {
      var url = file.url || '#'
      return '<a href="' + escapeHtml(url) + '" download="' + escapeHtml(file.name) + '" data-community-download="' + escapeHtml(file.name) + '"><span>' + escapeHtml(file.name) + '</span><small>' + escapeHtml(file.size || '') + ' · \uB2E4\uC6B4\uB85C\uB4DC</small></a>'
    }).join('') + '</div>'
  }

  function formatCommunityNumber(value) {
    return String(Number(value || 0).toLocaleString('ko-KR'))
  }

  function renderCommunityBestPanel() {
    var labels = {
      daily: '\uC77C\uC77C\uBCA0\uC2A4\uD2B8',
      weekly: '\uC8FC\uAC04\uBCA0\uC2A4\uD2B8',
      monthly: '\uC6D4\uAC04\uBCA0\uC2A4\uD2B8'
    }
    return '<div class="community-best-grid">' + ['daily', 'weekly', 'monthly'].map(function (period) {
      var rows = communityState.best[period] || []
      return [
        '<section class="community-best-card">',
        '<div class="community-best-head"><strong>' + labels[period] + '</strong><span>TOP 10</span></div>',
        '<div class="community-best-list">',
        rows.length ? rows.map(function (post, index) {
          return [
            '<button type="button" class="community-best-row" data-community-open-post="' + escapeHtml(post.id) + '">',
            '<b>' + (index + 1) + '</b>',
            '<span>' + escapeHtml(post.title) + '</span>',
            '<small>\uC870\uD68C ' + formatCommunityNumber(post.periodViews || post.views || 0) + '</small>',
            '</button>'
          ].join('')
        }).join('') : '<p>\uC544\uC9C1 \uC870\uD68C \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>',
        '</div>',
        '</section>'
      ].join('')
    }).join('') + '</div>'
  }

  function renderCommunityBoard(tab, admin) {
    if (tab !== 'free' && !admin) return '<div class="community-locked">\uAD00\uB9AC\uC790\uB9CC \uC791\uC131\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</div>'
    if (communityState.view === 'detail' && communityState.selectedPostId) return renderCommunityDetail(tab)
    return [
      '<div class="community-board-toolbar">',
      '<div><strong>' + communityTabLabel(tab) + '</strong></div>',
      '<button type="button" data-community-compose-toggle>' + (communityState.composing ? '\uC791\uC131 \uB2EB\uAE30' : '\uAE00\uC4F0\uAE30') + '</button>',
      '</div>',
      communityState.composing ? renderCommunityEditor(tab, null) : '',
      tab === 'free' ? renderCommunityBestPanel() : '',
      '<div class="community-free-list">',
      communityItems(tab).length ? communityItems(tab).map(function (post) {
        var meta = [
          post.author || '-',
          [post.date || '', post.time || ''].filter(Boolean).join(' '),
          '\uC870\uD68C ' + formatCommunityNumber(post.views || 0),
          '\uB313\uAE00 ' + ((post.comments || []).length)
        ].filter(Boolean).join(' / ')
        return [
          '<button type="button" class="community-free-row" data-community-open-post="' + escapeHtml(post.id) + '">',
          renderCommunityThumb(post),
          '<div class="community-row-title"><strong>' + escapeHtml(post.title) + '</strong></div>',
          '<span class="community-row-meta">' + escapeHtml(meta) + '</span>',
          '</button>'
        ].join('')
      }).join('') : '<div class="api-empty-row"><strong>\uB4F1\uB85D\uB41C \uAE00\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</strong></div>',
      '</div>'
    ].join('')
  }

  function renderCommunityEditor(tab, post) {
    var editing = !!post
    return [
      '<form class="community-composer community-free-editor" data-community-compose="' + tab + '" data-edit-post="' + (editing ? escapeHtml(post.id) : '') + '">',
      '<div class="community-composer-title"><strong>' + (editing ? '\uAE00 \uC218\uC815' : '\uC0C8 \uAE00 \uC791\uC131') + '</strong><span>\uC0AC\uC9C4 \uCCA8\uBD80 \uAC00\uB2A5</span></div>',
      '<input name="title" value="' + escapeHtml(post ? post.title : '') + '" />',
      '<textarea name="body" rows="5">' + escapeHtml(post ? post.body : '') + '</textarea>',
      '<label class="community-file-field"><span>\uC0AC\uC9C4/\uC601\uC0C1 \uCCA8\uBD80</span><b>\uD30C\uC77C \uC120\uD0DD</b><input name="files" type="file" accept="image/*,video/*" multiple /><small>' + ((post && post.files && post.files.length) ? post.files.map(function (file) { return escapeHtml(file.name) }).join(', ') : mediaLimitText()) + '</small></label>',
      '<div class="community-editor-actions"><button type="button" class="cancel-button" data-community-cancel-edit>\uCDE8\uC18C</button><button type="submit">' + (editing ? '\uC800\uC7A5' : '\uB4F1\uB85D') + '</button></div>',
      '</form>'
    ].join('')
  }

  function renderCommunityFreeEditor(post) {
    return renderCommunityEditor('free', post)
  }

  function renderCommunityFreeBoard() {
    return renderCommunityBoard('free', true)
  }

  function renderCommunityDetail(tab) {
    var post = findCommunityPost(tab, communityState.selectedPostId)
    if (!post) {
      communityState.view = 'list'
      communityState.selectedPostId = null
      return renderCommunityBoard(tab, true)
    }
    return [
      '<div class="community-detail">',
      '<div class="community-detail-top"><button type="button" data-community-back-list>\uBAA9\uB85D</button><div><button type="button" data-community-edit-post="' + escapeHtml(post.id) + '">\uC218\uC815</button><button type="button" class="danger-button" data-community-delete-post="' + escapeHtml(post.id) + '">\uC0AD\uC81C</button></div></div>',
      communityState.editingPostId === post.id ? renderCommunityEditor(tab, post) : [
        '<article class="community-detail-article">',
        '<h3>' + escapeHtml(post.title) + '</h3>',
        '<span>' + escapeHtml(post.author) + ' / ' + escapeHtml(post.date || '') + ' ' + escapeHtml(post.time || '') + ' / \uC870\uD68C ' + formatCommunityNumber(post.views || 0) + '</span>',
        '<p>' + escapeHtml(post.body) + '</p>',
        renderCommunityFiles(post.files || []),
        '</article>'
      ].join(''),
      '<section class="community-detail-comments"><strong>\uB313\uAE00 ' + ((post.comments || []).length) + '</strong>',
      renderCommunityComments(post),
      '</section>',
      '</div>'
    ].join('')
  }

  function renderCommunityFreeDetail() {
    return renderCommunityDetail('free')
  }

  function wireCommunityPage() {
    document.querySelectorAll('[data-community-tab]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        communityState.activeTab = button.dataset.communityTab || 'notice'
        communityState.view = 'list'
        communityState.selectedPostId = null
        communityState.composing = false
        communityState.editingPostId = null
        renderCommunityPage(true)
      })
    })

    document.querySelectorAll('[data-community-compose-toggle]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        communityState.composing = !communityState.composing
        communityState.editingPostId = null
        renderCommunityPage(true)
      })
    })

    document.querySelectorAll('[data-community-open-post]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        var tab = communityState.activeTab || 'free'
        communityState.view = 'detail'
        communityState.selectedPostId = button.dataset.communityOpenPost
        communityState.composing = false
        communityState.editingPostId = null
        renderCommunityPage(true)
        loadCommunityDetail(tab, communityState.selectedPostId).then(function () {
          if (communityState.view === 'detail') renderCommunityPage(true)
        })
      })
    })

    document.querySelectorAll('[data-community-back-list]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        communityState.view = 'list'
        communityState.selectedPostId = null
        communityState.editingPostId = null
        renderCommunityPage(true)
      })
    })

    document.querySelectorAll('[data-community-edit-post]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        communityState.editingPostId = button.dataset.communityEditPost
        renderCommunityPage(true)
      })
    })

    document.querySelectorAll('[data-community-delete-post]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        showPatchConfirm('\uAE00\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
          var tab = communityState.activeTab || 'free'
          var post = findCommunityPost(tab, button.dataset.communityDeletePost)
          var removeLocal = function () {
            communityState[tab] = communityItems(tab).filter(function (item) {
              return item.id !== button.dataset.communityDeletePost
            })
            communityState.view = 'list'
            communityState.selectedPostId = null
            communityState.editingPostId = null
            showPatchToast('\uAE00\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
            renderCommunityPage(true)
          }
          if (!post || !post.serverId) {
            removeLocal()
            return
          }
          apiRequest('/community/posts/' + encodeURIComponent(post.serverId), { method: 'DELETE' }).then(removeLocal).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uAE00 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      })
    })

    document.querySelectorAll('[data-community-cancel-edit]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        communityState.composing = false
        communityState.editingPostId = null
        renderCommunityPage(true)
      })
    })

    document.querySelectorAll('[data-community-download]').forEach(function (link) {
      if (link.dataset.wired) return
      link.dataset.wired = 'true'
      link.addEventListener('click', function (event) {
        var href = link.getAttribute('href') || ''
        if (href && href !== '#') return
        event.preventDefault()
        showPatchToast('\uCCA8\uBD80\uD30C\uC77C\uC744 \uBA3C\uC800 \uC5C5\uB85C\uB4DC\uD574\uC8FC\uC138\uC694.')
      })
    })

    document.querySelectorAll('.community-file-field input[type="file"]').forEach(function (input) {
      if (input.dataset.wired) return
      input.dataset.wired = 'true'
      input.addEventListener('change', function () {
        var label = input.closest('.community-file-field')
        var small = label && label.querySelector('small')
        var files = getCommunityFileNames(input)
        if (small) small.textContent = files.length ? files.map(function (file) { return file.name }).join(', ') : '\uC120\uD0DD\uB41C \uD30C\uC77C \uC5C6\uC74C'
      })
    })

    document.querySelectorAll('[data-community-compose]').forEach(function (form) {
      if (form.dataset.wired) return
      form.dataset.wired = 'true'
      form.addEventListener('submit', function (event) {
        event.preventDefault()
        var tab = form.dataset.communityCompose || 'free'
        var title = form.elements.title.value.trim()
        var body = form.elements.body.value.trim()
        if (!title) {
          form.elements.title.focus()
          showPatchToast('\uC81C\uBAA9\uC740 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
          return
        }
        if (!body) {
          form.elements.body.focus()
          showPatchToast('\uB0B4\uC6A9\uC740 \uD544\uC218\uC785\uB825\uC785\uB2C8\uB2E4.')
          return
        }
        var editId = form.dataset.editPost
        setCommunityFormBusy(form, true)
        uploadCommunityFiles(form.elements.files).then(function (uploadedFiles) {
          if (editId) {
            var targetPost = findCommunityPost(tab, editId)
            if (!targetPost) return
            var nextFiles = uploadedFiles.length ? uploadedFiles : (targetPost.files || [])
            return communityPostPayload(tab, title, body, nextFiles).then(function (payload) {
              if (!targetPost.serverId) {
                targetPost.title = title
                targetPost.body = body
                targetPost.files = nextFiles
                return targetPost
              }
              return apiRequest('/community/posts/' + encodeURIComponent(targetPost.serverId), {
                method: 'PUT',
                body: JSON.stringify(payload)
              }).then(function (saved) {
                return normalizeCommunityPost(saved, targetPost.comments || [])
              })
            }).then(function (savedPost) {
              replaceCommunityPost(tab, savedPost)
              communityState.editingPostId = null
              showPatchToast('\uAE00\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.')
              renderCommunityPage(true)
            })
          }
          return communityPostPayload(tab, title, body, uploadedFiles).then(function (payload) {
            return apiRequest('/community/posts', {
              method: 'POST',
              body: JSON.stringify(payload)
            }).then(function (saved) {
              return normalizeCommunityPost(saved, [])
            })
          }).then(function (newPost) {
            communityItems(tab).unshift(newPost)
            communityState.composing = false
            showPatchToast('\uAC8C\uC2DC\uAE00\uC744 \uB4F1\uB85D\uD588\uC2B5\uB2C8\uB2E4.')
            renderCommunityPage(true)
          })
        }).catch(function (error) {
          if (String(error && error.message || '').indexOf('INVALID_MEDIA') < 0) {
            showPatchToast(apiActionErrorMessage(error, '\uAC8C\uC2DC\uAE00 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          }
        }).finally(function () {
          setCommunityFormBusy(form, false)
        })
      })
    })

    document.querySelectorAll('[data-edit-comment]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        var post = findCommunityPost(communityState.activeTab || 'free', communityState.selectedPostId)
        var comment = post && (post.comments || []).find(function (item) {
          return item.id === button.dataset.editComment
        })
        if (!comment) return
        var next = window.prompt('\uB313\uAE00\uC744 \uC218\uC815\uD574\uC8FC\uC138\uC694.', comment.text)
        if (next === null) return
        if (!next.trim()) {
          showPatchToast('\uB313\uAE00\uC740 \uBE44\uC6CC\uB458 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.')
          return
        }
        var applyComment = function (saved) {
          var nextComment = saved ? normalizeCommunityComment(saved) : null
          comment.text = nextComment ? nextComment.text : next.trim()
          comment.time = nextComment ? nextComment.time : communityNowText()
          showPatchToast('\uB313\uAE00\uC744 \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.')
          renderCommunityPage(true)
        }
        if (!comment.serverId) {
          applyComment(null)
          return
        }
        apiRequest('/community/comments/' + encodeURIComponent(comment.serverId), {
          method: 'PUT',
          body: JSON.stringify({ body: next.trim() })
        }).then(applyComment).catch(function (error) {
          showPatchToast(apiActionErrorMessage(error, '\uB313\uAE00 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
        })
      })
    })

    document.querySelectorAll('[data-delete-comment]').forEach(function (button) {
      if (button.dataset.wired) return
      button.dataset.wired = 'true'
      button.addEventListener('click', function () {
        showPatchConfirm('\uB313\uAE00\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?', function () {
          var post = findCommunityPost(communityState.activeTab || 'free', communityState.selectedPostId)
          if (!post) return
          var comment = (post.comments || []).find(function (item) {
            return item.id === button.dataset.deleteComment
          })
          var removeComment = function () {
            post.comments = (post.comments || []).filter(function (item) {
              return item.id !== button.dataset.deleteComment
            })
            showPatchToast('\uB313\uAE00\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.')
            renderCommunityPage(true)
          }
          if (!comment || !comment.serverId) {
            removeComment()
            return
          }
          apiRequest('/community/comments/' + encodeURIComponent(comment.serverId), { method: 'DELETE' }).then(removeComment).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uB313\uAE00 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      })
    })

    document.querySelectorAll('[data-comment-post]').forEach(function (form) {
      if (form.dataset.wired) return
      form.dataset.wired = 'true'
      form.addEventListener('submit', function (event) {
        event.preventDefault()
        var input = form.elements.comment
        var text = input.value.trim()
        if (!text) {
          input.focus()
          showPatchToast('\uB313\uAE00\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.')
          return
        }
        var post = communityItems(communityState.activeTab || 'free').find(function (item) {
          return item.id === form.dataset.commentPost
        })
        if (!post) return
        var addComment = function (comment) {
          post.comments = post.comments || []
          post.comments.push(comment)
          showPatchToast('\uB313\uAE00\uC744 \uB4F1\uB85D\uD588\uC2B5\uB2C8\uB2E4.')
          renderCommunityPage(true)
        }
        if (!post.serverId) {
          addComment({ id: 'comment-' + Date.now(), author: '\uB098', time: communityNowText(), text: text })
          return
        }
        apiRequest('/community/posts/' + encodeURIComponent(post.serverId) + '/comments', {
          method: 'POST',
          body: JSON.stringify({ body: text })
        }).then(function (saved) {
          addComment(normalizeCommunityComment(saved))
        }).catch(function () {
          showPatchToast('\uB313\uAE00 \uB4F1\uB85D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
        })
      })
    })
  }

