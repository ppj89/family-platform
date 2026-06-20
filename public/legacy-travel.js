(function () {
  var API_BASE_URL = window.FAMILY_PLATFORM_API_BASE_URL || localStorage.getItem('family-platform-api-base-url') || '/api'
  var AUTH_TOKEN_STORAGE_KEY = 'family-platform-access-token'
  var AUTH_FAMILY_STORAGE_KEY = 'family-platform-current-family-id'
  var API_TRIP_ID_KEY = 'family-platform-api-default-trip-id'

  function text(node) {
    return node ? String(node.textContent || '').replace(/\s+/g, ' ').trim() : ''
  }

  function isTravelPage() {
    return text(document.querySelector('.topbar h1')) === '여행'
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
    })
  }

  function todayText() {
    var now = new Date()
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-')
  }

  function currentTimeText() {
    var now = new Date()
    return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  }

  function formatClockText(value, fallback) {
    var digits = String(value || '').replace(/[^\d]/g, '').slice(0, 4)
    if (!digits) return fallback || ''
    if (digits.length <= 2) return digits.padStart(2, '0') + ':00'
    return digits.slice(0, 2).padStart(2, '0') + ':' + digits.slice(2, 4).padEnd(2, '0')
  }

  function periodText(trip) {
    return (trip && trip.startDate ? trip.startDate : '') +
      (trip && trip.endDate && trip.endDate !== trip.startDate ? ' ~ ' + trip.endDate : '')
  }

  function toast(message) {
    if (window.__familyTravelToastTimer) window.clearTimeout(window.__familyTravelToastTimer)
    var old = document.querySelector('.toast-message')
    if (old) old.remove()
    var node = document.createElement('div')
    node.className = 'toast-message'
    node.innerHTML = '<span>' + escapeHtml(message) + '</span>'
    document.body.appendChild(node)
    window.__familyTravelToastTimer = window.setTimeout(function () {
      node.remove()
    }, 2600)
  }

  function errorMessage(error, fallback) {
    var message = String(error && error.message ? error.message : '')
    if (error && error.status === 401) return '로그인이 필요합니다.'
    if (error && error.status === 403) return '권한이 없습니다.'
    if (error && error.status === 404) return '대상을 찾지 못했습니다.'
    if (message) return fallback + ' (' + message + ')'
    return fallback
  }

  function parseCoordinates(value) {
    var match = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
    if (!match) return null
    var latitude = Number(match[1])
    var longitude = Number(match[2])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
    return { latitude: latitude, longitude: longitude }
  }

  function token() {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ''
  }

  function apiRequest(path, options) {
    var auth = token()
    var headers = Object.assign({
      Accept: 'application/json'
    }, (options && options.headers) || {})
    if (auth) headers.Authorization = 'Bearer ' + auth
    if (options && options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
    return fetch(API_BASE_URL + path, Object.assign({}, options || {}, { headers: headers })).then(function (response) {
      if (!response.ok) {
        var error = new Error(response.statusText || 'API request failed')
        error.status = response.status
        throw error
      }
      if (response.status === 204) return null
      return response.json().catch(function () { return null })
    })
  }

  function getFamilyId(force) {
    var cached = Number(localStorage.getItem(AUTH_FAMILY_STORAGE_KEY) || '')
    if (!force && Number.isFinite(cached) && cached > 0) return Promise.resolve(cached)
    return apiRequest('/families').then(function (families) {
      var family = Array.isArray(families) ? families[0] : null
      if (!family || !family.id) return 0
      localStorage.setItem(AUTH_FAMILY_STORAGE_KEY, String(family.id))
      return family.id
    }).catch(function () {
      return 0
    })
  }

  function readTrips(forceFamily) {
    if (!token()) return Promise.resolve([])
    return getFamilyId(forceFamily).then(function (familyId) {
      return apiRequest('/trips?familyId=' + encodeURIComponent(familyId)).catch(function (error) {
        if (!forceFamily && familyId > 0 && (error.status === 403 || error.status === 404)) {
          localStorage.removeItem(AUTH_FAMILY_STORAGE_KEY)
          return readTrips(true)
        }
        throw error
      })
    })
  }

  function createTrip(payload) {
    return getFamilyId(false).then(function (familyId) {
      return apiRequest('/trips?familyId=' + encodeURIComponent(familyId), {
        method: 'POST',
        body: JSON.stringify(payload)
      })
    })
  }

  function updateTrip(id, payload) {
    return apiRequest('/trips/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify(payload)
    })
  }

  function deleteTrip(id) {
    return apiRequest('/trips/' + encodeURIComponent(id), { method: 'DELETE' })
  }

  function readRecords(tripIds) {
    var ids = (tripIds || []).filter(Boolean)
    if (!ids.length) return Promise.resolve([])
    return Promise.all(ids.map(function (id) {
      return apiRequest('/trips/' + encodeURIComponent(id) + '/records?_=' + encodeURIComponent(Date.now())).catch(function () {
        return []
      })
    })).then(function (groups) {
      return groups.reduce(function (all, group) { return all.concat(Array.isArray(group) ? group : []) }, [])
    })
  }

  function createRecord(tripId, payload) {
    return apiRequest('/trips/' + encodeURIComponent(tripId) + '/records', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }

  function updateRecord(recordId, payload) {
    return apiRequest('/travel-records/' + encodeURIComponent(recordId), {
      method: 'PUT',
      body: JSON.stringify(payload)
    })
  }

  function deleteRecord(recordId) {
    return apiRequest('/travel-records/' + encodeURIComponent(recordId), { method: 'DELETE' })
  }

  function searchTravelPlaces(query, limit) {
    var keyword = String(query || '').trim()
    if (!keyword || keyword.length < 2 || !token()) return Promise.resolve([])
    return apiRequest('/places/search?q=' + encodeURIComponent(keyword) + '&limit=' + encodeURIComponent(limit || 6)).then(function (items) {
      return Array.isArray(items) ? items : []
    }).catch(function () {
      return []
    })
  }

  function placeLabel(item) {
    return String(item && (item.name || item.address) || '').trim()
  }

  function placeDetail(item) {
    return String(item && item.address || '').trim()
  }

  function setLocationCandidate(input, item) {
    if (!input || !item) return
    var label = placeLabel(item)
    var detail = placeDetail(item)
    input.value = label || detail
    input.dataset.latitude = String(item.latitude || '')
    input.dataset.longitude = String(item.longitude || '')
    input.dataset.placeAddress = detail
  }

  function getLocationCoordinates(form) {
    var input = form && form.querySelector('[name="location"]')
    if (!input) return null
    var latitude = Number(input.dataset.latitude)
    var longitude = Number(input.dataset.longitude)
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
      return { latitude: latitude, longitude: longitude }
    }
    return parseCoordinates(input.value)
  }

  function resolveLocationForSubmit(form, location) {
    var existing = getLocationCoordinates(form)
    if (existing || !String(location || '').trim()) return Promise.resolve(existing)
    return searchTravelPlaces(location, 1).then(function (items) {
      var first = items[0]
      if (!first) return null
      setLocationCandidate(form.querySelector('[name="location"]'), first)
      return { latitude: Number(first.latitude), longitude: Number(first.longitude) }
    })
  }

  function ensureLocationSearch(form) {
    var input = form && form.querySelector('[name="location"]')
    if (!input || input.dataset.placeSearchReady === 'true') return
    input.dataset.placeSearchReady = 'true'
    input.setAttribute('autocomplete', 'off')
    var candidates = document.createElement('div')
    candidates.className = 'location-candidates travel-location-candidates'
    candidates.hidden = true
    input.closest('label').insertAdjacentElement('afterend', candidates)
    var timer = null

    function hideCandidates() {
      candidates.hidden = true
      candidates.innerHTML = ''
    }

    function renderCandidates(query, items) {
      if (String(input.value || '').trim() !== query) return
      if (!items.length) {
        candidates.innerHTML = '<span>검색 결과가 없습니다. 장소명을 조금 더 자세히 입력해주세요.</span>'
        candidates.hidden = false
        return
      }
      candidates.innerHTML = '<span>위치를 선택해주세요.</span>' + items.map(function (item, index) {
        return '<button type="button" data-place-index="' + index + '">' +
          '<b>' + escapeHtml(placeLabel(item)) + '</b>' +
          '<small>' + escapeHtml(placeDetail(item)) + '</small>' +
          '</button>'
      }).join('')
      candidates.hidden = false
      candidates.querySelectorAll('button[data-place-index]').forEach(function (button) {
        button.addEventListener('mousedown', function (event) { event.preventDefault() })
        button.addEventListener('click', function () {
          setLocationCandidate(input, items[Number(button.dataset.placeIndex)])
          hideCandidates()
        })
      })
    }

    input.addEventListener('input', function () {
      delete input.dataset.latitude
      delete input.dataset.longitude
      delete input.dataset.placeAddress
      window.clearTimeout(timer)
      var query = String(input.value || '').trim()
      if (query.length < 2) {
        hideCandidates()
        return
      }
      timer = window.setTimeout(function () {
        candidates.innerHTML = '<span>위치를 검색하는 중입니다.</span>'
        candidates.hidden = false
        searchTravelPlaces(query, 6).then(function (items) {
          renderCandidates(query, items)
        })
      }, 280)
    })
    input.addEventListener('blur', function () {
      window.setTimeout(hideCandidates, 220)
    })
  }

  function groupTrips(trips) {
    var map = new Map()
    ;(trips || []).forEach(function (trip) {
      var key = [trip.title || '여행', trip.startDate || '', trip.endDate || ''].join('|')
      if (!map.has(key)) {
        map.set(key, Object.assign({}, trip, { tripIds: [trip.id] }))
        return
      }
      var grouped = map.get(key)
      grouped.tripIds.push(trip.id)
    })
    return Array.from(map.values()).sort(function (a, b) {
      return String(b.startDate || '').localeCompare(String(a.startDate || '')) ||
        String(b.id || '').localeCompare(String(a.id || ''))
    })
  }

  function sortRecords(records) {
    return (records || []).slice().sort(function (a, b) {
      var aOrder = a && a.sortOrder != null ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER
      var bOrder = b && b.sortOrder != null ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER
      if (aOrder !== bOrder) return aOrder - bOrder
      return String((a && a.recordDate) || '').localeCompare(String((b && b.recordDate) || '')) ||
        String((a && a.recordTime) || '').localeCompare(String((b && b.recordTime) || '')) ||
        String((a && a.createdAt) || '').localeCompare(String((b && b.createdAt) || ''))
    })
  }

  function panel() {
    return document.querySelector('.trip-manager')
  }

  function setCount(count) {
    var chip = document.querySelector('.panel-header .passive-header-chip, .panel.wide.full-span .panel-header button')
    if (chip) chip.textContent = Number(count || 0).toLocaleString('ko-KR') + '개'
  }

  function shellHeader(title, count, actions) {
    return '<header class="travel-separated-header panel-header">' +
      '<h2>' + escapeHtml(title || '여행') + '</h2>' +
      '<div class="travel-separated-header-actions">' +
      '<span class="passive-header-chip">' + escapeHtml(String(count || 0)) + '개</span>' +
      (actions || '') +
      '</div></header>'
  }

  function renderList(trips) {
    var root = panel()
    if (!root || !isTravelPage()) return
    var groupedTrips = groupTrips(trips)
    setCount(groupedTrips.length)
    root.classList.add('travel-separated-panel')
    root.dataset.travelSeparatedMounted = 'true'
    root.dataset.travelSeparatedView = 'list'
    root.innerHTML = shellHeader('여행', groupedTrips.length, '<button type="button" class="primary-action" data-travel-new>신규입력</button>') +
      '<div class="travel-separated-list">' +
      (groupedTrips.length ? groupedTrips.map(function (trip) {
        return '<article class="travel-separated-card" data-travel-trip-id="' + escapeHtml(trip.id) + '">' +
          '<button type="button" class="travel-separated-card-main" data-travel-open="' + escapeHtml(trip.id) + '">' +
          '<span><strong>' + escapeHtml(trip.title || '여행') + '</strong><span>' + escapeHtml(periodText(trip)) + '</span></span>' +
          '<small>상세 보기</small>' +
          '</button>' +
          '<div class="travel-separated-card-actions">' +
          '<button type="button" class="save-button" data-travel-edit-card="' + escapeHtml(trip.id) + '">수정</button>' +
          '<button type="button" class="danger-button" data-travel-delete-card="' + escapeHtml(trip.id) + '">삭제</button>' +
          '</div>' +
          '</article>'
      }).join('') : '<p class="empty-note">등록된 여행이 없습니다.</p>') +
      '</div>'
    root.querySelector('[data-travel-new]').addEventListener('click', function () {
      renderTripForm()
    })
    root.querySelectorAll('[data-travel-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        var trip = groupedTrips.find(function (item) { return String(item.id) === String(button.dataset.travelOpen) })
        if (trip) renderDetail(trip)
      })
    })
    root.querySelectorAll('[data-travel-edit-card]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        var trip = groupedTrips.find(function (item) { return String(item.id) === String(button.dataset.travelEditCard) })
        if (trip) openTripEditDialog(trip, loadList)
      })
    })
    root.querySelectorAll('[data-travel-delete-card]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        var trip = groupedTrips.find(function (item) { return String(item.id) === String(button.dataset.travelDeleteCard) })
        if (!trip || !window.confirm('여행을 삭제할까요?')) return
        deleteTrip(trip.id).then(function () {
          toast('여행을 삭제했습니다.')
          loadList()
        }).catch(function (error) {
          toast(errorMessage(error, '여행 삭제에 실패했습니다.'))
        })
      })
    })
  }

  function loadList() {
    var root = panel()
    if (!root || !isTravelPage()) return Promise.resolve([])
    root.classList.add('travel-separated-panel')
    root.dataset.travelSeparatedMounted = 'true'
    root.dataset.travelSeparatedView = 'loading'
    root.innerHTML = shellHeader('여행', 0, '<button type="button" class="primary-action" data-travel-new>신규입력</button>') +
      '<p class="empty-note">여행 목록을 불러오는 중입니다.</p>'
    return readTrips(false).then(function (trips) {
      renderList(trips)
      return trips
    }).catch(function (error) {
      root.innerHTML = shellHeader('여행', 0, '<button type="button" class="primary-action" data-travel-new>신규입력</button>') +
        '<p class="empty-note">' + escapeHtml(errorMessage(error, '여행 목록을 불러오지 못했습니다.')) + '</p>'
      var button = root.querySelector('[data-travel-new]')
      if (button) button.addEventListener('click', function () { renderTripForm() })
      return []
    })
  }

  function tripPayload(form) {
    var title = form.querySelector('[name="title"]').value.trim()
    var startDate = form.querySelector('[name="startDate"]').value || todayText()
    var endDate = form.querySelector('[name="endDate"]').value || startDate
    return {
      title: title,
      startDate: startDate,
      endDate: endDate,
      description: startDate === endDate ? startDate : startDate + ' ~ ' + endDate
    }
  }

  function renderTripForm(trip) {
    var root = panel()
    if (!root) return
    var editing = Boolean(trip && trip.id)
    root.dataset.travelSeparatedMounted = 'true'
    root.dataset.travelSeparatedView = editing ? 'trip-edit' : 'trip-new'
    root.innerHTML = shellHeader(editing ? '여행 수정' : '여행 등록', 0, '<button type="button" class="cancel-button" data-travel-list>목록</button>') +
      '<form class="travel-separated-form" data-travel-trip-form>' +
      '<label><span>여행명 <em class="required-mark">*</em></span><input name="title" value="' + escapeHtml((trip && trip.title) || '') + '" /></label>' +
      '<label><span>시작일</span><input name="startDate" type="date" value="' + escapeHtml((trip && trip.startDate) || todayText()) + '" /></label>' +
      '<label><span>종료일</span><input name="endDate" type="date" value="' + escapeHtml((trip && trip.endDate) || (trip && trip.startDate) || todayText()) + '" /></label>' +
      '<div class="travel-separated-form-actions"><button type="button" class="cancel-button" data-travel-list>취소</button><button type="submit" class="submit-action">' + (editing ? '저장' : '추가') + '</button></div>' +
      '</form>'
    root.querySelectorAll('[data-travel-list]').forEach(function (button) {
      button.addEventListener('click', function () { loadList() })
    })
    var form = root.querySelector('[data-travel-trip-form]')
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      var payload = tripPayload(form)
      if (!payload.title) {
        toast('여행명을 입력해주세요.')
        form.querySelector('[name="title"]').focus()
        return
      }
      if (payload.endDate < payload.startDate) {
        toast('종료일은 시작일보다 이전일 수 없습니다.')
        return
      }
      var button = form.querySelector('button[type="submit"]')
      button.disabled = true
      ;(editing ? updateTrip(trip.id, payload) : createTrip(payload)).then(function (saved) {
        if (saved && saved.id) localStorage.setItem(API_TRIP_ID_KEY, String(saved.id))
        toast(editing ? '여행을 수정했습니다.' : '여행을 추가했습니다.')
        loadList()
      }).catch(function (error) {
        toast(errorMessage(error, editing ? '여행 수정에 실패했습니다.' : '여행 추가에 실패했습니다.'))
      }).finally(function () {
        button.disabled = false
      })
    })
  }

  function openTripEditDialog(trip, afterSave) {
    var old = document.querySelector('.travel-edit-backdrop')
    if (old) old.remove()
    var backdrop = document.createElement('div')
    backdrop.className = 'travel-edit-backdrop'
    backdrop.innerHTML = '<section class="travel-edit-dialog" role="dialog" aria-modal="true">' +
      '<header><h3>여행 수정</h3><button type="button" class="cancel-button" data-travel-edit-close>닫기</button></header>' +
      '<form class="travel-separated-form" data-travel-edit-form>' +
      '<label><span>여행명 <em class="required-mark">*</em></span><input name="title" value="' + escapeHtml((trip && trip.title) || '') + '" /></label>' +
      '<label><span>시작일</span><input name="startDate" type="date" value="' + escapeHtml((trip && trip.startDate) || todayText()) + '" /></label>' +
      '<label><span>종료일</span><input name="endDate" type="date" value="' + escapeHtml((trip && trip.endDate) || (trip && trip.startDate) || todayText()) + '" /></label>' +
      '<div class="travel-separated-form-actions"><button type="button" class="cancel-button" data-travel-edit-close>취소</button><button type="submit" class="submit-action">저장</button></div>' +
      '</form></section>'
    document.body.appendChild(backdrop)
    backdrop.querySelectorAll('[data-travel-edit-close]').forEach(function (button) {
      button.addEventListener('click', function () { backdrop.remove() })
    })
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) backdrop.remove()
    })
    var form = backdrop.querySelector('[data-travel-edit-form]')
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      var payload = tripPayload(form)
      if (!payload.title) {
        toast('여행명을 입력해주세요.')
        form.querySelector('[name="title"]').focus()
        return
      }
      if (payload.endDate < payload.startDate) {
        toast('종료일은 시작일보다 이전일 수 없습니다.')
        return
      }
      var submit = form.querySelector('button[type="submit"]')
      submit.disabled = true
      updateTrip(trip.id, payload).then(function (saved) {
        toast('여행을 수정했습니다.')
        backdrop.remove()
        if (afterSave) afterSave(Object.assign({}, trip, saved || payload, payload))
      }).catch(function (error) {
        toast(errorMessage(error, '여행 수정에 실패했습니다.'))
      }).finally(function () {
        submit.disabled = false
      })
    })
    var first = form.querySelector('[name="title"]')
    if (first) first.focus()
  }

  function recordPayload(form) {
    var sortOrderValue = form.querySelector('[name="sortOrder"]').value.trim()
    var coords = getLocationCoordinates(form)
    return {
      sortOrder: sortOrderValue ? Number(sortOrderValue) : null,
      title: form.querySelector('[name="title"]').value.trim(),
      category: '기타',
      amount: Number(String(form.querySelector('[name="amount"]').value || '').replace(/[^\d]/g, '')) || 0,
      note: form.querySelector('[name="note"]').value.trim(),
      location: form.querySelector('[name="location"]').value.trim(),
      latitude: coords ? Number(coords.latitude || 0) : 0,
      longitude: coords ? Number(coords.longitude || 0) : 0,
      recordDate: form.querySelector('[name="recordDate"]').value || todayText(),
      recordTime: formatClockText(form.querySelector('[name="recordTime"]').value, currentTimeText()),
      mediaUrls: []
    }
  }

  function fillRecordForm(form, record) {
    form.dataset.editRecordId = String(record.id || '')
    form.querySelector('[name="sortOrder"]').value = record.sortOrder == null ? '' : String(record.sortOrder)
    form.querySelector('[name="title"]').value = record.title || ''
    var location = form.querySelector('[name="location"]')
    location.value = record.location || ''
    location.dataset.latitude = record.latitude || ''
    location.dataset.longitude = record.longitude || ''
    form.querySelector('[name="amount"]').value = record.amount ? String(record.amount) : ''
    form.querySelector('[name="recordDate"]').value = record.recordDate || todayText()
    form.querySelector('[name="recordTime"]').value = formatClockText(record.recordTime || '', currentTimeText())
    form.querySelector('[name="note"]').value = record.note || ''
    var submit = form.querySelector('button[type="submit"]')
    if (submit) submit.textContent = '저장'
    form.querySelector('[name="title"]').focus()
  }

  function clearRecordForm(form) {
    delete form.dataset.editRecordId
    form.querySelector('[name="sortOrder"]').value = ''
    form.querySelector('[name="title"]').value = ''
    var location = form.querySelector('[name="location"]')
    location.value = ''
    delete location.dataset.latitude
    delete location.dataset.longitude
    delete location.dataset.placeAddress
    form.querySelector('[name="amount"]').value = ''
    form.querySelector('[name="recordDate"]').value = todayText()
    form.querySelector('[name="recordTime"]').value = currentTimeText()
    form.querySelector('[name="note"]').value = ''
    var submit = form.querySelector('button[type="submit"]')
    if (submit) submit.textContent = '기록 추가'
  }

  function renderDetail(trip) {
    var root = panel()
    if (!root || !trip) return
    localStorage.setItem(API_TRIP_ID_KEY, String(trip.id))
    root.dataset.travelSeparatedMounted = 'true'
    root.dataset.travelSeparatedView = 'detail'
    root.innerHTML = '<section class="travel-separated-detail">' +
      '<header class="travel-separated-detail-header">' +
      '<div><h3>' + escapeHtml(trip.title || '여행') + '</h3><span>' + escapeHtml(periodText(trip)) + '</span></div>' +
      '<div class="travel-separated-header-actions">' +
      '<button type="button" class="cancel-button" data-travel-list>목록</button>' +
      '<button type="button" class="save-button" data-travel-edit>수정</button>' +
      '<button type="button" class="danger-button" data-travel-delete>삭제</button>' +
      '</div></header>' +
      '<section class="travel-separated-course"><h4>여행 코스</h4><div class="route-map" data-travel-route-map><div class="route-map-grid"></div><div class="route-map-empty">등록된 코스를 불러오는 중입니다.</div></div></section>' +
      '<form class="travel-separated-form" data-travel-record-form>' +
      '<label><span>순서</span><input name="sortOrder" inputmode="numeric" /></label>' +
      '<label><span>제목 <em class="required-mark">*</em></span><input name="title" /></label>' +
      '<label><span>위치</span><input name="location" /></label>' +
      '<label><span>사용금액</span><input name="amount" inputmode="numeric" /></label>' +
      '<label><span>날짜</span><input name="recordDate" type="date" value="' + todayText() + '" /></label>' +
      '<label><span>시간</span><input name="recordTime" type="text" inputmode="numeric" maxlength="5" value="' + currentTimeText() + '" /></label>' +
      '<label class="wide-field"><span>메모</span><textarea name="note" rows="4"></textarea></label>' +
      '<div class="travel-separated-form-actions"><button type="button" class="cancel-button" data-record-cancel>취소</button><button type="submit" class="submit-action">기록 추가</button></div>' +
      '</form>' +
      '<div class="travel-separated-record-list"><p class="empty-note">여행 기록을 불러오는 중입니다.</p></div>' +
      '</section>'
    root.querySelector('[data-travel-list]').addEventListener('click', function () { loadList() })
    root.querySelector('[data-travel-edit]').addEventListener('click', function () {
      openTripEditDialog(trip, function (updated) {
        renderDetail(Object.assign({}, trip, updated, { tripIds: trip.tripIds || [trip.id] }))
      })
    })
    root.querySelector('[data-travel-delete]').addEventListener('click', function () {
      if (!window.confirm('여행을 삭제할까요?')) return
      deleteTrip(trip.id).then(function () {
        toast('여행을 삭제했습니다.')
        loadList()
      }).catch(function (error) {
        toast(errorMessage(error, '여행 삭제에 실패했습니다.'))
      })
    })
    var form = root.querySelector('[data-travel-record-form]')
    ensureLocationSearch(form)
    form.querySelector('[data-record-cancel]').addEventListener('click', function () { clearRecordForm(form) })
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      var basePayload = recordPayload(form)
      if (!basePayload.title) {
        toast('제목을 입력해주세요.')
        form.querySelector('[name="title"]').focus()
        return
      }
      var recordId = form.dataset.editRecordId
      var button = form.querySelector('button[type="submit"]')
      button.disabled = true
      resolveLocationForSubmit(form, basePayload.location).then(function (coords) {
        var payload = Object.assign({}, basePayload, {
          latitude: coords ? Number(coords.latitude || 0) : Number(basePayload.latitude || 0),
          longitude: coords ? Number(coords.longitude || 0) : Number(basePayload.longitude || 0)
        })
        return recordId ? updateRecord(recordId, payload) : createRecord(trip.id, payload)
      }).then(function () {
        toast(recordId ? '여행 기록을 수정했습니다.' : '여행 기록을 추가했습니다.')
        clearRecordForm(form)
        loadRecords(trip)
      }).catch(function (error) {
        toast(errorMessage(error, recordId ? '여행 기록 수정에 실패했습니다.' : '여행 기록 추가에 실패했습니다.'))
      }).finally(function () {
        button.disabled = false
      })
    })
    loadRecords(trip)
  }

  function loadRecords(trip) {
    var root = panel()
    var list = root && root.querySelector('.travel-separated-record-list')
    if (!list) return
    readRecords(trip.tripIds || [trip.id]).then(function (records) {
      var sorted = sortRecords(records)
      renderRouteMap(sorted)
      if (!sorted.length) {
        list.innerHTML = '<p class="empty-note">등록된 여행 기록이 없습니다.</p>'
        return
      }
      list.innerHTML = sorted.map(function (record, index) {
        var orderText = record.sortOrder != null ? String(record.sortOrder) : String(index + 1)
        return '<article class="travel-separated-record api-travel-record-card" data-record-id="' + escapeHtml(record.id) + '">' +
          '<div><strong>' + escapeHtml(orderText + '. ' + (record.title || '여행 기록')) + '</strong>' +
          '<span>' + escapeHtml([record.recordDate || '', record.recordTime || '', record.location || ''].filter(Boolean).join(' · ')) + '</span>' +
          '<p>' + escapeHtml(record.note || '') + '</p></div>' +
          '<div class="travel-separated-record-actions">' +
          '<button type="button" class="save-button" data-record-edit="' + escapeHtml(record.id) + '">수정</button>' +
          '<button type="button" class="danger-button" data-record-delete="' + escapeHtml(record.id) + '">삭제</button>' +
          '</div></article>'
      }).join('')
      list.querySelectorAll('[data-record-edit]').forEach(function (button) {
        button.addEventListener('click', function () {
          var record = sorted.find(function (item) { return String(item.id) === String(button.dataset.recordEdit) })
          var form = panel().querySelector('[data-travel-record-form]')
          if (record && form) fillRecordForm(form, record)
        })
      })
      list.querySelectorAll('[data-record-delete]').forEach(function (button) {
        button.addEventListener('click', function () {
          if (!window.confirm('여행 기록을 삭제할까요?')) return
          deleteRecord(button.dataset.recordDelete).then(function () {
            toast('여행 기록을 삭제했습니다.')
            loadRecords(trip)
          }).catch(function (error) {
            toast(errorMessage(error, '여행 기록 삭제에 실패했습니다.'))
          })
        })
      })
    }).catch(function (error) {
      list.innerHTML = '<p class="empty-note">' + escapeHtml(errorMessage(error, '여행 기록을 불러오지 못했습니다.')) + '</p>'
    })
  }

  function routePointPosition(record, index, total) {
    var latitude = Number(record && record.latitude)
    var longitude = Number(record && record.longitude)
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
      var x = ((longitude + 180) / 360) * 100
      var y = ((90 - latitude) / 180) * 100
      return {
        x: Math.max(8, Math.min(92, x)),
        y: Math.max(12, Math.min(58, y))
      }
    }
    if (total <= 1) return { x: 50, y: 34 }
    var rate = index / (total - 1)
    return {
      x: 12 + rate * 76,
      y: 24 + Math.sin(rate * Math.PI) * 24
    }
  }

  function renderRouteMap(records) {
    var map = document.querySelector('[data-travel-route-map]')
    if (!map) return
    var items = sortRecords(records).filter(function (record) {
      return record && (record.title || record.location || record.latitude || record.longitude)
    })
    if (!items.length) {
      map.innerHTML = '<div class="route-map-grid"></div><div class="route-map-empty">여행 상세 기록을 추가하면 코스가 표시됩니다.</div>'
      return
    }
    var points = items.map(routePointPosition)
    var polyline = points.map(function (point) {
      return point.x + ',' + point.y
    }).join(' ')
    map.innerHTML = '<div class="route-map-grid"></div>' +
      '<svg class="route-map-line" viewBox="0 0 100 70" preserveAspectRatio="none"><polyline points="' + escapeHtml(polyline) + '"></polyline></svg>' +
      items.map(function (record, index) {
        var point = points[index]
        var label = record.title || record.location || '코스'
        return '<button type="button" class="route-marker" style="left:' + point.x + '%;top:' + point.y + '%" title="' + escapeHtml(label) + '">' +
          '<b>' + (index + 1) + '</b>' +
          '</button>'
      }).join('') +
      '<div class="route-sequence">' + items.map(function (record, index) {
        var location = record.location || ''
        var meta = [record.recordDate || '', record.recordTime || '', location].filter(Boolean).join(' · ')
        return '<div class="route-sequence-item">' +
          '<b>' + (index + 1) + '</b><span>' + escapeHtml(record.title || location || '코스') + '</span>' +
          '<small>' + escapeHtml(meta) + '</small>' +
          (index < items.length - 1 ? '<i></i>' : '') +
          '</div>'
      }).join('') + '</div>'
  }

  function hasSeparatedTravelView(root) {
    return Boolean(root && root.querySelector(
      '.travel-separated-list, .travel-separated-detail, [data-travel-trip-form], .travel-separated-record-list'
    ))
  }

  function hasLegacyTravelView(root) {
    return Boolean(root && root.querySelector(
      '.trip-add-row, .api-trip-card, .api-trip-detail, .api-travel-record-form, .travel-form, .trip-list, .travel-summary, .server-travel-list'
    ))
  }

  function mountTravelPage() {
    if (!isTravelPage()) return
    var root = panel()
    if (!root) return
    var legacyView = hasLegacyTravelView(root)
    if (!legacyView && (hasSeparatedTravelView(root) || root.dataset.travelSeparatedView === 'loading')) return
    loadList()
  }

  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('.nav-item')) {
      window.setTimeout(mountTravelPage, 500)
      window.setTimeout(mountTravelPage, 1200)
    }
  }, true)

  window.__familyTravelRender = mountTravelPage
  window.setInterval(mountTravelPage, 800)
  window.setTimeout(mountTravelPage, 0)
  window.setTimeout(mountTravelPage, 800)
})()
