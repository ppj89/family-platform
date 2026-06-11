import './index.css'

declare global {
  interface Window {
    FAMILY_PLATFORM_API_BASE_URL?: string
  }
}

window.FAMILY_PLATFORM_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const legacyCssPath = '/legacy/assets/index-CkWNYWFk.css'
const legacyOverridesCssPath = '/legacy-overrides.css?v=20260611-13'
const legacyPatchScriptPath = '/legacy-patch.js?v=20260611-13'
const legacyScriptPath = '/legacy/assets/index-DFjbaB-2.js?v=20260610-07'

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

if (!document.querySelector(`script[src="${legacyScriptPath}"]`)) {
  const script = document.createElement('script')
  script.type = 'module'
  script.src = legacyScriptPath
  document.body.appendChild(script)
}

if (!document.querySelector(`script[src="${legacyPatchScriptPath}"]`)) {
  const script = document.createElement('script')
  script.src = legacyPatchScriptPath
  document.body.appendChild(script)
}
