import './index.css'

declare global {
  interface Window {
    FAMILY_PLATFORM_API_BASE_URL?: string
    __familyLegacyRetryStarted?: boolean
    __familyPatchLoading?: boolean
  }
}

window.FAMILY_PLATFORM_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const legacyCssPath = '/legacy/assets/index-CkWNYWFk.css'
const legacyOverridesCssPath = '/legacy-overrides.css?v=20260616-06'
const legacyPatchScriptPath = '/legacy-patch.js?v=20260616-06'
const legacyScriptPath = '/legacy/assets/index-DFjbaB-2.js?v=20260614-11'

const root = document.getElementById('root')
if (root) {
  root.innerHTML = ''
}

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

window.setTimeout(() => {
  if (hasLegacyApp() || window.__familyLegacyRetryStarted) return
  window.__familyLegacyRetryStarted = true
  loadLegacyScript(`${legacyScriptPath}&retry=${Date.now()}`)
}, 2500)

window.setTimeout(loadPatchScript, 4000)
