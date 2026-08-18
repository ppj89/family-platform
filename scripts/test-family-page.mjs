import { chromium } from 'playwright'

const webUrl = process.env.FAMILY_E2E_WEB_URL || 'http://127.0.0.1:5180'
const apiUrl = process.env.FAMILY_E2E_API_URL || 'http://127.0.0.1:18080/api'
const token = process.env.FAMILY_E2E_TOKEN
const user = process.env.FAMILY_E2E_USER
const failFamilyList = process.env.FAMILY_E2E_FAIL_FAMILY_LIST === '1'

if (!token || !user) {
  throw new Error('FAMILY_E2E_TOKEN and FAMILY_E2E_USER are required')
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const apiRequests = []

await page.route('**/api/**', async (route) => {
  try {
    const request = route.request()
    const requestUrl = new URL(request.url())
    if (failFamilyList && requestUrl.pathname === '/api/families') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"test family list failure"}' })
      return
    }
    const targetUrl = `${apiUrl}${requestUrl.pathname.replace(/^\/api/, '')}${requestUrl.search}`
    const response = await route.fetch({ url: targetUrl })
    await route.fulfill({ response })
  } catch (error) {
    if (!String(error).includes('Request context disposed')) throw error
  }
})
page.on('request', (request) => {
  if (new URL(request.url()).pathname.startsWith('/api/')) {
    apiRequests.push(`${request.method()} ${new URL(request.url()).pathname}`)
  }
})

await page.addInitScript(({ authToken, authUser }) => {
  window.localStorage.setItem('family-platform-access-token', authToken)
  window.localStorage.setItem('family-platform-user', authUser)
}, { authToken: token, authUser: user })

await page.goto(webUrl, { waitUntil: 'networkidle' })
await page.getByText('\uadf8\ub8f9\uad00\ub9ac', { exact: true }).first().click()
await page.getByRole('heading', { name: '\uad6c\uc131\uc6d0', exact: true }).waitFor()

const permissionButton = page.getByRole('button', { name: '\uad8c\ud55c', exact: true }).first()
await permissionButton.click()
const permissionDialog = page.getByRole('dialog', { name: '\uad8c\ud55c \uc218\uc815' })
await permissionDialog.waitFor()
await permissionDialog.getByRole('button', { name: '\ucde8\uc18c', exact: true }).click()
await permissionDialog.waitFor({ state: 'detached' })

if (!apiRequests.some((request) => request === 'GET /api/families')) {
  throw new Error(`Family list request was not made: ${apiRequests.join(', ')}`)
}
if (!apiRequests.some((request) => /^GET \/api\/families\/\d+\/members$/.test(request))) {
  throw new Error(`Family member request was not made: ${apiRequests.join(', ')}`)
}

if (failFamilyList) {
  console.log('Family page fallback and permission dialog verified after a family-list failure.')
} else {
  console.log(`Family page API flow and permission dialog verified: ${apiRequests.filter((request) => request.includes('/famil')).join(', ')}`)
}
await page.waitForTimeout(250)
await browser.close()
