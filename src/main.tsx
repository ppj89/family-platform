import './index.css'

declare global {
  interface Window {
    FAMILY_PLATFORM_API_BASE_URL?: string
    __familyEmptyRootSince?: number
    __familyEmptyRootRecoverCount?: number
    __familyPatchLoading?: boolean
  }
}

window.FAMILY_PLATFORM_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const legacyCssPath = '/legacy/assets/index-CkWNYWFk.css'
const legacyOverridesCssPath = '/legacy-overrides.css?v=20260620-61'
const legacyPatchScriptPath = '/legacy-patch.js?v=20260620-61'
const legacyScriptPath = '/legacy/assets/index-DFjbaB-2.js?v=20260614-11'

const root = document.getElementById('root')

if (!document.querySelector(`link[href="${legacyCssPath}"]`)) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = legacyCssPath
  document.head.appendChild(link)
}

if (!document.querySelector(`link[href="${legacyOverridesCssPath}"]`)) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = legacyOverridesCssPath
  document.head.appendChild(link)
}

function hasLegacyApp() {
  return Boolean(root?.children.length || document.querySelector('.auth-card, .app-shell'))
}

function clearTransientQuery() {
  if (!window.location.search || !/[?&](loggedOut|recover)=/.test(window.location.search)) return
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('loggedOut')
    url.searchParams.delete('recover')
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash)
  } catch {
    window.history.replaceState({}, document.title, window.location.pathname)
  }
}

clearTransientQuery()

function loadPatchScript() {
  if (window.__familyPatchLoading || document.querySelector('script[data-family-patch="true"]')) return
  window.__familyPatchLoading = true
  const script = document.createElement('script')
  script.src = legacyPatchScriptPath
  script.dataset.familyPatch = 'true'
  script.addEventListener('load', () => {
    window.__familyPatchLoading = false
  }, { once: true })
  script.addEventListener('error', () => {
    window.__familyPatchLoading = false
  }, { once: true })
  document.body.appendChild(script)
}

function loadLegacyScript(src = legacyScriptPath) {
  const script = document.createElement('script')
  script.type = 'module'
  script.src = src
  script.dataset.familyLegacy = 'true'
  script.addEventListener('load', () => {
    window.setTimeout(loadPatchScript, 0)
  }, { once: true })
  script.addEventListener('error', () => {
    loadPatchScript()
  }, { once: true })
  document.body.appendChild(script)
}

if (!document.querySelector('script[data-family-legacy="true"]')) {
  loadLegacyScript()
} else {
  loadPatchScript()
}

window.setTimeout(loadPatchScript, 4000)

window.setInterval(() => {
  if (hasLegacyApp()) {
    window.__familyEmptyRootSince = undefined
    try {
      window.sessionStorage.removeItem('family-platform-recover-count')
      window.sessionStorage.removeItem('family-platform-recover-at')
    } catch {
      // Ignore storage access issues while cleaning recovery state.
    }
    clearTransientQuery()
    return
  }
  window.__familyEmptyRootSince = window.__familyEmptyRootSince || Date.now()
  let storedRecoverCount = 0
  try {
    storedRecoverCount = Number(window.sessionStorage.getItem('family-platform-recover-count') || '0') || 0
  } catch {
    storedRecoverCount = window.__familyEmptyRootRecoverCount || 0
  }
  if (Date.now() - window.__familyEmptyRootSince < 700 || storedRecoverCount >= 2) return
  window.__familyEmptyRootRecoverCount = (window.__familyEmptyRootRecoverCount || 0) + 1
  const url = new URL(window.location.href)
  url.searchParams.delete('recover')
  url.searchParams.delete('recoverNav')
  url.searchParams.delete('loggedOut')
  try {
    window.sessionStorage.setItem('family-platform-recover-count', String(storedRecoverCount + 1))
    window.sessionStorage.setItem('family-platform-recover-at', String(Date.now()))
  } catch {
    // Ignore storage access issues during emergency recovery.
  }
  window.location.replace(url.toString())
}, 500)
