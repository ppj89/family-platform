  function isFamilyGroupNavItem(nav) {
    return nav && getCleanText(nav).indexOf('\uAC00\uC871\uADF8\uB8F9') >= 0
  }

  function isRestaurantNavItem(nav) {
    return nav && getCleanText(nav) === '\uB9DB\uC9D1'
  }

  function isLedgerNavItem(nav) {
    return nav && getCleanText(nav) === '\uAC00\uACC4\uBD80'
  }

  function setNavActive(label) {
    document.querySelectorAll('.nav-item.active').forEach(function (item) {
      item.classList.remove('active')
    })
    var nav = findNavButton(label) || findNavButtonContains(label)
    if (nav) nav.classList.add('active')
  }

  function syncRestaurantMenuState() {
    if (!document.querySelector('.restaurant-grid, .restaurant-form')) return
    delete document.documentElement.dataset.patchPage
    var title = document.querySelector('.topbar h1')
    if (title && getCleanText(title) !== '\uB9DB\uC9D1') title.textContent = '\uB9DB\uC9D1'
    var caption = document.querySelector('.topbar h1') && document.querySelector('.topbar h1').previousElementSibling
    if (caption && caption.tagName === 'SPAN') caption.textContent = '\uB9DB\uC9D1'
    setNavActive('\uB9DB\uC9D1')
    var restaurantForm = document.querySelector('.restaurant-form')
    var formPanel = restaurantForm && restaurantForm.closest('.panel')
    if (formPanel) {
      Array.from(formPanel.querySelectorAll('.panel-header button, .panel-header .passive-header-chip, .panel-header [role="button"]')).forEach(function (item) {
        if (getCleanText(item) === '\uACF5\uC720') item.remove()
      })
    }
    normalizeRestaurantFormControls()
  }

  function normalizeMenuCaptions() {
    var title = document.querySelector('.topbar h1')
    var caption = title && title.previousElementSibling && title.previousElementSibling.tagName === 'SPAN'
      ? title.previousElementSibling
      : null
    if (!caption) return
    var pageTitle = getCleanText(title)
    if (pageTitle === '\uC77C\uAE30') caption.textContent = '\uC77C\uAE30'
    if (pageTitle === '\uB9DB\uC9D1') caption.textContent = '\uB9DB\uC9D1'
    document.querySelectorAll('.panel h2').forEach(function (heading) {
      var text = getCleanText(heading)
      if (text === '\uAC00\uC871 \uC77C\uAE30') heading.textContent = '\uC77C\uAE30'
      if (text === '\uAC00\uC871 \uB9DB\uC9D1') heading.textContent = '\uB9DB\uC9D1'
    })
  }

  function cleanupPatchRootsForCurrentMenu() {
    var title = getCleanText(document.querySelector('.topbar h1, h1'))
    if (title !== '\uAC00\uC871\uADF8\uB8F9') {
      document.querySelectorAll('.patch-family-group-root').forEach(function (root) {
        root.remove()
      })
    }
    if (title !== '\uCEE4\uBBA4\uB2C8\uD2F0') {
      document.querySelectorAll('.patch-community-root').forEach(function (root) {
        root.remove()
      })
    }
    if (title !== '\uAC00\uC871\uADF8\uB8F9' && title !== '\uCEE4\uBBA4\uB2C8\uD2F0') {
      delete document.documentElement.dataset.patchPage
      var content = document.querySelector('.content-grid')
      if (content) {
        content.classList.remove('community-grid')
        content.classList.remove('community-source-hidden')
        delete content.dataset.communityReady
      }
    }
  }

  function clearFamilyGroupPage() {
    if (document.documentElement.dataset.patchPage !== 'family-group') return
    delete document.documentElement.dataset.patchPage
    var content = document.querySelector('.content-grid')
    if (content) content.classList.remove('community-source-hidden')
    var root = document.querySelector('.patch-family-group-root')
    if (root) root.remove()
    document.querySelectorAll('.nav-item.active').forEach(function (item) {
      if (isFamilyGroupNavItem(item)) item.classList.remove('active')
    })
  }

  function clearCommunityPatchPage() {
    if (document.documentElement.dataset.patchPage !== 'community') return
    delete document.documentElement.dataset.patchPage
    var content = document.querySelector('.content-grid')
    if (content) {
      content.classList.remove('community-grid')
      content.classList.remove('community-source-hidden')
      delete content.dataset.communityReady
    }
    var root = document.querySelector('.patch-community-root')
    if (root) root.remove()
    document.querySelectorAll('.community-nav-item.active').forEach(function (item) {
      item.classList.remove('active')
    })
    resumePatchObserver()
  }

  function clearCustomPatchPageAfterReact(wasCommunity, wasFamilyGroup) {
    window.setTimeout(function () {
      if (wasCommunity) clearCommunityPatchPage()
      if (wasFamilyGroup) clearFamilyGroupPage()
    }, 260)
  }

  function clearCustomPatchPageNow() {
    clearCommunityPatchPage()
    clearFamilyGroupPage()
    document.querySelectorAll('.patch-community-root, .patch-family-group-root').forEach(function (root) {
      root.remove()
    })
    var content = document.querySelector('.content-grid')
    if (content) {
      content.classList.remove('community-grid')
      content.classList.remove('community-source-hidden')
      delete content.dataset.communityReady
    }
  }

  function openFamilyGroupPage() {
    pausePatchObserver()
    if (document.documentElement.dataset.patchPage === 'community') {
      delete document.documentElement.dataset.patchPage
      var communityRoot = document.querySelector('.patch-community-root')
      if (communityRoot) communityRoot.remove()
    }
    document.documentElement.dataset.patchPage = 'family-group'
    document.querySelectorAll('.nav-item.active').forEach(function (item) {
      item.classList.remove('active')
    })
    var nav = Array.from(document.querySelectorAll('.nav-item')).find(isFamilyGroupNavItem)
    if (nav) nav.classList.add('active')

    var eyebrow = document.querySelector('.topbar .eyebrow')
    var title = document.querySelector('.topbar h1')
    if (eyebrow) eyebrow.textContent = '\uAC00\uC871\uADF8\uB8F9 \u00B7 \uCD08\uB300 \u00B7 \uAD8C\uD55C'
    if (title) title.textContent = '\uAC00\uC871\uADF8\uB8F9'

    var workspace = document.querySelector('.workspace')
    var content = document.querySelector('.content-grid')
    if (!workspace) return
    if (content) content.classList.add('community-source-hidden')

    var root = document.querySelector('.patch-family-group-root')
    if (!root) {
      root = document.createElement('div')
      root.className = 'patch-family-group-root community-grid'
      workspace.appendChild(root)
    }
    root.innerHTML = '<section class="panel wide family-group-panel"><div class="api-empty-row"><strong>가족 정보를 불러오는 중입니다.</strong></div></section>'
    schedulePlaceholderSweep()
    loadFamilyGroupPage(root)
    resumePatchObserver()
  }

  function queueOpenFamilyGroupPage() {
    window.clearTimeout(window.__familyGroupOpenTimer)
    window.__familyGroupOpenTimer = window.setTimeout(function () {
      openFamilyGroupPage()
      window.setTimeout(openFamilyGroupPage, 140)
    }, 30)
  }

  function loadFamilyGroupPage(root) {
    Promise.all([
      apiRequest('/families'),
      apiRequest('/family-invitations').catch(function () { return [] })
    ]).then(function (results) {
      var list = Array.isArray(results[0]) ? results[0] : []
      var invitations = Array.isArray(results[1]) ? results[1] : []
      if (!list.length) {
        renderFamilyCreatePage(root, invitations)
        return
      }
      var family = list[0]
      localStorage.setItem(AUTH_FAMILY_STORAGE_KEY, String(family.id))
      return Promise.all([
        apiRequest('/families/' + encodeURIComponent(family.id) + '/members').catch(function () { return [] }),
        apiRequest('/families/' + encodeURIComponent(family.id) + '/invitations').catch(function () { return [] })
      ]).then(function (familyResults) {
        var members = Array.isArray(familyResults[0]) ? familyResults[0] : []
        var sentInvitations = Array.isArray(familyResults[1]) ? familyResults[1] : []
        renderFamilyManagePage(root, family, members, invitations, sentInvitations)
      }).catch(function () {
        renderFamilyManagePage(root, family, [], invitations, [])
      })
    }).catch(function (error) {
      var message = error && error.status === 401 ? '로그인 세션이 필요합니다.' : '가족 정보를 불러오지 못했습니다.'
      root.innerHTML = [
        '<section class="panel wide family-group-panel">',
        '<div class="api-empty-row"><strong>' + message + '</strong><small>로그인 상태를 확인한 뒤 다시 시도해주세요.</small></div>',
        '<button class="submit-action" type="button" data-family-retry>다시 불러오기</button>',
        '</section>'
      ].join('')
      var retry = root.querySelector('[data-family-retry]')
      if (retry) retry.addEventListener('click', function () { loadFamilyGroupPage(root) })
    })
  }

  function permissionText(member) {
    var permissions = []
    if (member.canRead) permissions.push('읽기')
    if (member.canCreate) permissions.push('쓰기')
    if (member.canUpdate) permissions.push('수정')
    if (member.canDelete) permissions.push('삭제')
    return permissions.length ? permissions.join('/') : '권한 없음'
  }

  function roleText(role) {
    return role === 'FAMILY_ADMIN' ? '가족관리자' : '가족구성원'
  }

  function currentFamilyMember(members) {
    var currentUser = readStoredAuthUser() || {}
    return (members || []).find(function (member) {
      return String(member.userId) === String(currentUser.id || '')
    }) || null
  }

  function canManageFamily(members) {
    var currentUser = readStoredAuthUser() || {}
    if (currentUser.platformAdmin) return true
    var member = currentFamilyMember(members)
    return !!(member && member.role === 'FAMILY_ADMIN')
  }

  function familyActionErrorMessage(error, fallback) {
    return apiActionErrorMessage(error, fallback)
  }

  function renderFamilyInvitationList(invitations) {
    if (!invitations || !invitations.length) return ''
    return [
      '<section class="family-invitation-panel">',
      '<header><strong>받은 가족 초대</strong><span>' + invitations.length + '건</span></header>',
      invitations.map(function (item) {
        return [
          '<article data-family-invitation-id="' + escapeHtml(item.id) + '">',
          '<div><strong>' + escapeHtml(item.familyName || '가족그룹') + '</strong>',
          '<span>' + escapeHtml(item.inviterName || '초대자') + ' · ' + escapeHtml(roleText(item.role)) + ' · ' + escapeHtml(permissionText(item)) + '</span></div>',
          '<div class="member-actions"><button type="button" data-family-invite-accept="' + escapeHtml(item.id) + '">수락</button><button type="button" class="danger-button" data-family-invite-reject="' + escapeHtml(item.id) + '">거절</button></div>',
          '</article>'
        ].join('')
      }).join(''),
      '</section>'
    ].join('')
  }

  function renderSentFamilyInvitationList(invitations) {
    if (!invitations || !invitations.length) return ''
    return [
      '<section class="family-invitation-panel sent-family-invitation-panel">',
      '<header><strong>\uBCF4\uB0B8 \uCD08\uB300</strong><span>' + invitations.length + '\uAC74</span></header>',
      invitations.map(function (item) {
        var invitee = item.inviteeName || item.inviteeEmail || '\uCD08\uB300\uB300\uC0C1'
        return [
          '<article data-family-sent-invitation-id="' + escapeHtml(item.id) + '">',
          '<div><strong>' + escapeHtml(invitee) + '</strong>',
          '<span>' + escapeHtml(roleText(item.role)) + ' \u00B7 ' + escapeHtml(permissionText(item)) + '</span></div>',
          '<div class="member-actions"><button type="button" class="danger-button" data-family-invite-cancel="' + escapeHtml(item.id) + '">\uCD08\uB300 \uCDE8\uC18C</button></div>',
          '</article>'
        ].join('')
      }).join(''),
      '</section>'
    ].join('')
  }

  function bindFamilyInvitationActions(root) {
    root.querySelectorAll('[data-family-invite-accept], [data-family-invite-reject]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.dataset.familyInviteAccept || button.dataset.familyInviteReject
        var accept = !!button.dataset.familyInviteAccept
        showPatchConfirm(accept ? '가족 초대를 수락할까요?' : '가족 초대를 거절할까요?', function () {
          apiRequest('/family-invitations/' + encodeURIComponent(id) + '/' + (accept ? 'accept' : 'reject'), { method: 'POST' }).then(function () {
            showPatchToast(accept ? '가족그룹에 참여했습니다.' : '초대를 거절했습니다.')
            loadFamilyGroupPage(root)
          }).catch(function (error) {
            showPatchToast(error && error.status === 409 ? '이미 다른 가족그룹에 속해 있습니다.' : '초대 처리에 실패했습니다.')
          })
        })
      })
    })
    root.querySelectorAll('[data-family-invite-cancel]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.dataset.familyInviteCancel
        showPatchConfirm('\uBCF4\uB0B8 \uCD08\uB300\uB97C \uCDE8\uC18C\uD560\uAE4C\uC694?', function () {
          apiRequest('/family-invitations/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
            showPatchToast('\uCD08\uB300\uB97C \uCDE8\uC18C\uD588\uC2B5\uB2C8\uB2E4.')
            loadFamilyGroupPage(root)
          }).catch(function (error) {
            showPatchToast(apiActionErrorMessage(error, '\uCD08\uB300 \uCDE8\uC18C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.'))
          })
        })
      })
    })
  }

  function renderFamilyManagePage(root, family, members, invitations, sentInvitations) {
    var currentUser = readStoredAuthUser() || {}
    var canManage = canManageFamily(members)
    window.__familyLastMembers = members || []
    var rows = members.length ? members.map(function (member) {
      var displayName = member.nickname || member.email || ('ID ' + member.userId)
      var isMe = String(member.userId) === String(currentUser.id || '')
      var action = canManage ? '<button type="button" data-family-edit-member="' + escapeHtml(member.id) + '">수정</button>' : ''
      if (isMe) action += '<button type="button" class="danger-button" data-family-leave="' + escapeHtml(member.id) + '">가족그룹 나가기</button>'
      else if (canManage) action += '<button type="button" class="danger-button" data-family-remove-member="' + escapeHtml(member.id) + '">내보내기</button>'
      return [
        '<article data-family-member-id="' + escapeHtml(member.id) + '">',
        '<div><strong>' + escapeHtml(displayName) + (isMe ? ' <em>나</em>' : '') + '</strong>',
        '<span>' + escapeHtml(roleText(member.role)) + ' · ' + escapeHtml(permissionText(member)) + (member.email ? ' · ' + escapeHtml(member.email) : '') + '</span></div>',
        '<div class="member-actions">' + action + '</div>',
        canManage ? [
          '<div class="family-member-edit" data-family-member-editor="' + escapeHtml(member.id) + '" hidden>',
          '<label><span>역할</span><select data-family-edit-role><option value="MEMBER"' + (member.role === 'MEMBER' ? ' selected' : '') + '>가족구성원</option><option value="FAMILY_ADMIN"' + (member.role === 'FAMILY_ADMIN' ? ' selected' : '') + '>가족관리자</option></select></label>',
          '<div class="permission-chips">',
          '<button type="button" class="' + (member.canRead && member.canCreate && member.canUpdate && member.canDelete ? 'active' : '') + '" data-family-edit-permission-all>전체</button>',
          '<button type="button" class="' + (member.canRead ? 'active' : '') + '" data-family-edit-permission="canRead">읽기</button>',
          '<button type="button" class="' + (member.canCreate ? 'active' : '') + '" data-family-edit-permission="canCreate">쓰기</button>',
          '<button type="button" class="' + (member.canUpdate ? 'active' : '') + '" data-family-edit-permission="canUpdate">수정</button>',
          '<button type="button" class="' + (member.canDelete ? 'active' : '') + '" data-family-edit-permission="canDelete">삭제</button>',
          '</div>',
          '<div class="member-actions"><button type="button" class="save-button" data-family-save-member="' + escapeHtml(member.id) + '">저장</button><button type="button" class="cancel-button" data-family-cancel-member="' + escapeHtml(member.id) + '">취소</button></div>',
          '</div>'
        ].join('') : '',
        '</article>'
      ].join('')
    }).join('') : '<div class="api-empty-row"><strong>등록된 구성원이 없습니다.</strong></div>'
    var inviteForm = canManage ? [
      '<form class="code-form invite-form family-invite-form">',
      '<div class="form-row">',
      '<label><span>초대할 사용자</span><input data-invite-user /></label>',
      '<label><span>역할</span><select data-invite-role><option value="MEMBER">가족구성원</option><option value="FAMILY_ADMIN">가족관리자</option></select></label>',
      '</div>',
      '<div class="permission-chips">',
      '<button type="button" data-invite-permission-all>전체</button>',
      '<button type="button" class="active" data-invite-permission="canRead">읽기</button>',
      '<button type="button" data-invite-permission="canCreate">쓰기</button>',
      '<button type="button" data-invite-permission="canUpdate">수정</button>',
      '<button type="button" data-invite-permission="canDelete">삭제</button>',
      '</div>',
      '<button class="submit-action" type="submit">초대 보내기</button>',
      '</form>'
    ].join('') : '<div class="api-empty-row family-member-readonly"><strong>가족구성원은 구성원 초대와 내보내기를 할 수 없습니다.</strong></div>'
    root.innerHTML = [
      '<section class="panel wide family-group-panel">',
      '<header class="panel-header"><h2>가족그룹</h2></header>',
      renderFamilyInvitationList(invitations || []),
      canManage ? renderSentFamilyInvitationList(sentInvitations || []) : '',
      '<div class="family-group-summary">',
      '<article><strong>' + escapeHtml(family.name || '-') + '</strong></article>',
      '<article><span>구성원</span><strong>' + members.length + '명</strong><small>읽기/쓰기/수정/삭제 권한 관리</small></article>',
      '</div>',
      inviteForm,
      '<div class="family-group-list">',
      rows,
      '</div>',
      '</section>'
    ].join('')
    schedulePlaceholderSweep(root)
    bindFamilyInviteForm(root, family, canManage)
    bindFamilyInvitationActions(root)
  }

  function syncFamilyPermissionAll(chips) {
    if (!chips) return
    var allButton = chips.querySelector('[data-family-edit-permission-all]')
    if (!allButton) return
    var permissionButtons = Array.from(chips.querySelectorAll('[data-family-edit-permission]'))
    allButton.classList.toggle('active', permissionButtons.length > 0 && permissionButtons.every(function (item) {
      return item.classList.contains('active')
    }))
  }

  function bindFamilyInviteForm(root, family, canManage) {
    var form = root.querySelector('.family-invite-form')
    if (form && family && family.id && canManage) {
      var permissions = { canRead: true, canCreate: false, canUpdate: false, canDelete: false }
      var inviteAllButton = form.querySelector('[data-invite-permission-all]')
      function syncInviteAllButton() {
        if (!inviteAllButton) return
        inviteAllButton.classList.toggle('active', permissions.canRead && permissions.canCreate && permissions.canUpdate && permissions.canDelete)
      }
      form.querySelectorAll('[data-invite-permission]').forEach(function (button) {
        button.addEventListener('click', function () {
          var key = button.dataset.invitePermission
          permissions[key] = !permissions[key]
          button.classList.toggle('active', !!permissions[key])
          syncInviteAllButton()
        })
      })
      if (inviteAllButton) {
        inviteAllButton.addEventListener('click', function () {
          var next = !(permissions.canRead && permissions.canCreate && permissions.canUpdate && permissions.canDelete)
          Object.keys(permissions).forEach(function (key) { permissions[key] = next })
          form.querySelectorAll('[data-invite-permission]').forEach(function (button) {
            button.classList.toggle('active', !!permissions[button.dataset.invitePermission])
          })
          syncInviteAllButton()
        })
        syncInviteAllButton()
      }
      form.addEventListener('submit', function (event) {
        event.preventDefault()
        var input = form.querySelector('[data-invite-user]')
        var invite = String((input && input.value || '').trim())
        if (!invite) {
          showPatchToast('초대할 사용자의 이메일이나 닉네임을 입력해주세요.')
          if (input) input.focus()
          return
        }
        var role = (form.querySelector('[data-invite-role]') || {}).value || 'MEMBER'
        var payload = Object.assign({ invite: invite, role: role }, permissions)
        var submit = form.querySelector('button[type="submit"]')
        if (submit) {
          submit.disabled = true
          submit.textContent = '초대 중'
        }
        postJson('/families/' + encodeURIComponent(family.id) + '/invitations', payload).then(function () {
          showPatchToast('초대를 보냈습니다. 상대방이 수락하면 구성원으로 추가됩니다.')
          if (input) input.value = ''
          loadFamilyGroupPage(root)
        }).catch(function (error) {
          showPatchToast(apiActionErrorMessage(error, '초대에 실패했습니다.'))
        }).finally(function () {
          if (submit) {
            submit.disabled = false
            submit.textContent = '초대 보내기'
          }
        })
      })
    }
    root.querySelectorAll('[data-family-leave], [data-family-remove-member]').forEach(function (button) {
      button.addEventListener('click', function () {
        var memberId = button.dataset.familyLeave || button.dataset.familyRemoveMember
        var leaving = !!button.dataset.familyLeave
        showPatchConfirm(leaving ? '가족그룹에서 나갈까요?' : '구성원을 내보낼까요?', function () {
          apiRequest('/families/' + encodeURIComponent(family.id) + '/members/' + encodeURIComponent(memberId), { method: 'DELETE' }).then(function () {
            if (leaving) localStorage.removeItem(AUTH_FAMILY_STORAGE_KEY)
            showPatchToast(leaving ? '가족그룹에서 나갔습니다.' : '구성원을 내보냈습니다.')
            loadFamilyGroupPage(root)
          }).catch(function (error) {
            showPatchToast(familyActionErrorMessage(error, '처리에 실패했습니다.'))
          })
        })
      })
    })
    root.querySelectorAll('[data-family-edit-member]').forEach(function (button) {
      button.addEventListener('click', function () {
        var editor = root.querySelector('[data-family-member-editor="' + button.dataset.familyEditMember + '"]')
        if (!editor) return
        root.querySelectorAll('.family-member-edit').forEach(function (item) {
          if (item !== editor) item.hidden = true
        })
        editor.hidden = false
        editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    })
    root.querySelectorAll('[data-family-cancel-member]').forEach(function (button) {
      button.addEventListener('click', function () {
        var editor = root.querySelector('[data-family-member-editor="' + button.dataset.familyCancelMember + '"]')
        if (editor) editor.hidden = true
      })
    })
    root.querySelectorAll('[data-family-edit-permission]').forEach(function (button) {
      button.addEventListener('click', function () {
        button.classList.toggle('active')
        syncFamilyPermissionAll(button.closest('.permission-chips'))
      })
    })
    root.querySelectorAll('[data-family-edit-permission-all]').forEach(function (button) {
      button.addEventListener('click', function () {
        var chips = button.closest('.permission-chips')
        if (!chips) return
        var permissionButtons = Array.from(chips.querySelectorAll('[data-family-edit-permission]'))
        var next = !permissionButtons.every(function (item) { return item.classList.contains('active') })
        permissionButtons.forEach(function (item) { item.classList.toggle('active', next) })
        syncFamilyPermissionAll(chips)
      })
    })
    root.querySelectorAll('.permission-chips').forEach(syncFamilyPermissionAll)
    root.querySelectorAll('[data-family-save-member]').forEach(function (button) {
      button.addEventListener('click', function () {
        var memberId = button.dataset.familySaveMember
        var member = (Array.isArray(window.__familyLastMembers) ? window.__familyLastMembers : []).find(function (item) {
          return String(item.id) === String(memberId)
        })
        var editor = root.querySelector('[data-family-member-editor="' + memberId + '"]')
        if (!member || !editor) return
        var role = (editor.querySelector('[data-family-edit-role]') || {}).value || 'MEMBER'
        var adminCount = (Array.isArray(window.__familyLastMembers) ? window.__familyLastMembers : []).filter(function (item) {
          return item.role === 'FAMILY_ADMIN'
        }).length
        if (member.role === 'FAMILY_ADMIN' && role !== 'FAMILY_ADMIN' && adminCount <= 1) {
          showPatchToast('가족관리자는 최소 1명 필요합니다.')
          return
        }
        var payload = {
          userId: member.userId,
          role: role,
          canRead: !!editor.querySelector('[data-family-edit-permission="canRead"].active'),
          canCreate: !!editor.querySelector('[data-family-edit-permission="canCreate"].active'),
          canUpdate: !!editor.querySelector('[data-family-edit-permission="canUpdate"].active'),
          canDelete: !!editor.querySelector('[data-family-edit-permission="canDelete"].active')
        }
        showPatchConfirm('구성원 권한을 저장할까요?', function () {
          button.disabled = true
          apiRequest('/families/' + encodeURIComponent(family.id) + '/members/' + encodeURIComponent(memberId), {
            method: 'PUT',
            body: JSON.stringify(payload)
          }).then(function () {
            showPatchToast('권한을 저장했습니다.')
            loadFamilyGroupPage(root)
          }).catch(function (error) {
            showPatchToast(familyActionErrorMessage(error, '권한 저장에 실패했습니다.'))
          }).finally(function () {
            button.disabled = false
          })
        })
      })
    })
  }

  function renderFamilyCreatePage(root, invitations) {
    root.innerHTML = [
      '<section class="panel wide family-group-panel">',
      '<header class="panel-header"><h2>가족그룹 생성</h2></header>',
      renderFamilyInvitationList(invitations || []),
      '<form class="code-form family-create-form">',
      '<label><span>가족명</span><input data-family-name maxlength="40" /></label>',
      '<button class="submit-action" type="submit">가족그룹 생성</button>',
      '</form>',
      '<div class="api-empty-row"><strong>연결된 가족그룹이 없습니다.</strong></div>',
      '</section>'
    ].join('')
    schedulePlaceholderSweep(root)
    bindFamilyInvitationActions(root)
    var form = root.querySelector('.family-create-form')
    var input = root.querySelector('[data-family-name]')
    if (input) input.focus()
    if (!form) return
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      var name = String((input || {}).value || '').trim()
      if (!name) {
        showPatchToast('가족명을 입력해주세요.')
        if (input) input.focus()
        return
      }
      var submit = form.querySelector('button[type="submit"]')
      if (submit) {
        submit.disabled = true
        submit.textContent = '생성 중'
      }
      postJson('/families', { name: name }).then(function (family) {
        localStorage.setItem(AUTH_FAMILY_STORAGE_KEY, String(family.id))
        showPatchToast('가족그룹을 생성했습니다.')
        loadFamilyGroupPage(root)
      }).catch(function (error) {
        showPatchToast(error && error.status === 409 ? '이미 가족그룹에 속해 있습니다.' : '가족그룹 생성에 실패했습니다.')
        if (submit) {
          submit.disabled = false
          submit.textContent = '가족그룹 생성'
        }
      })
    })
  }

