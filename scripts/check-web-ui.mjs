import { chromium } from 'playwright'

const baseUrl = process.env.WEB_URL || 'http://127.0.0.1:5173/'

const labels = {
  home: '\uD648',
  calendar: '\uCE98\uB9B0\uB354',
  ledger: '\uAC00\uACC4\uBD80',
  travel: '\uC5EC\uD589',
  baby: '\uC721\uC544',
  diary: '\uC77C\uAE30',
  family: '\uAC00\uC871\uADF8\uB8F9',
  community: '\uCEE4\uBBA4\uB2C8\uD2F0',
  admin: '\uAD00\uB9AC\uC790',
}

const menus = Object.values(labels)
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 1180, height: 720 },
  { name: 'desktop', width: 1440, height: 900 },
].filter((viewport) => !process.env.VIEWPORT || viewport.name === process.env.VIEWPORT)

function textIncludes(text, target) {
  return String(text || '').replace(/\s+/g, ' ').trim().includes(target)
}

async function clickByText(page, text) {
  return page.evaluate((targetText) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const targets = Array.from(document.querySelectorAll('button, [role="button"], a'))
    const target = targets.find((item) => normalize(item.textContent).includes(targetText))
    if (!target) return false
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return true
  }, text)
}

async function openPage(page, viewportName) {
  console.log(`[${viewportName}] open ${baseUrl}`)
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 })
  await page.waitForTimeout(1200)
}

async function bypassLoginIfNeeded(page, viewportName) {
  const hasAuth = await page.locator('.auth-card').count()
  if (!hasAuth) return

  console.log(`[${viewportName}] auth screen detected`)
  const authText = await page.locator('.auth-card').evaluate((node) => String(node.textContent || '').slice(0, 500), undefined, { timeout: 5000 })
  if (!textIncludes(authText, labels.home) && !textIncludes(authText, '\uD68C\uC6D0\uAC00\uC785')) {
    throw new Error(`${viewportName}: auth screen text is not readable`)
  }
}

async function collectLayoutIssues(page, viewportName, menu) {
  return page.evaluate(({ viewportName, menu }) => {
    const viewportWidth = document.documentElement.clientWidth
    const sampleText = Array.from(document.querySelectorAll('h1, h2, h3, button, label span, input, textarea, small'))
      .slice(0, 220)
      .map((node) => node.value || node.placeholder || node.textContent || '')
      .join(' ')
    const brokenPatterns = /濡|媛|쨌|�|\?대|\?뚯/
    const overflow = Array.from(document.querySelectorAll('body *'))
      .filter((node) => {
        const rect = node.getBoundingClientRect()
        if (rect.width < 20 || rect.height < 20) return false
        return rect.left < -2 || rect.right > viewportWidth + 2
      })
      .slice(0, 8)
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        className: String(node.className || '').slice(0, 80),
        text: String(node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70),
        left: Math.round(node.getBoundingClientRect().left),
        right: Math.round(node.getBoundingClientRect().right),
      }))

    const activeNav = Array.from(document.querySelectorAll('.nav-item.active, .mobile-tab.active, .bottom-nav .active'))
      .map((node) => String(node.textContent || '').replace(/\s+/g, ' ').trim())

    return {
      viewportName,
      menu,
      title: String(document.querySelector('.topbar h1')?.textContent || '').trim(),
      hasAuth: !!document.querySelector('.auth-card'),
      hasBrokenText: brokenPatterns.test(sampleText),
      activeNav,
      overflow,
    }
  }, { viewportName, menu })
}

async function runViewport(browser, viewport) {
  console.log(`[${viewport.name}] start ${viewport.width}x${viewport.height}`)
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } })
  page.setDefaultTimeout(8000)
  page.setDefaultNavigationTimeout(10000)

  const consoleErrors = []
  await openPage(page, viewport.name)
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await bypassLoginIfNeeded(page, viewport.name)

  const results = []
  const hasAuth = await page.locator('.auth-card').count()
  if (!hasAuth) {
    for (const menu of menus) {
      console.log(`[${viewport.name}] menu ${menu}`)
      const clicked = await clickByText(page, menu)
      await page.waitForTimeout(450)
      const result = await collectLayoutIssues(page, viewport.name, menu)
      results.push({ ...result, missing: !clicked && menu !== labels.home })
    }
  } else {
    results.push(await collectLayoutIssues(page, viewport.name, 'auth'))
  }

  await page.screenshot({ path: `debug-web-ui-${viewport.name}.png`, fullPage: true })
  await page.close()
  return { viewport: viewport.name, consoleErrors, results }
}

const browser = await chromium.launch({ headless: true })
const report = []
try {
  for (const viewport of viewports) {
    report.push(await runViewport(browser, viewport))
  }
} finally {
  await browser.close()
}

const failures = []
for (const item of report) {
  for (const error of item.consoleErrors) {
    failures.push(`${item.viewport}: console error: ${error}`)
  }
  for (const result of item.results) {
    if (result.missing) failures.push(`${result.viewportName}/${result.menu}: menu button missing`)
    if (result.hasBrokenText) failures.push(`${result.viewportName}/${result.menu}: broken text detected`)
    if (result.overflow.length) failures.push(`${result.viewportName}/${result.menu}: horizontal overflow ${JSON.stringify(result.overflow[0])}`)
  }
}

console.log(JSON.stringify({ baseUrl, failures, report }, null, 2))
if (failures.length) process.exitCode = 1
