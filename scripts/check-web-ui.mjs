import { chromium } from 'playwright'

const baseUrl = process.env.WEB_URL || 'http://127.0.0.1:5173/'
const fullFlow = process.env.WEB_UI_FULL === '1' || process.env.WEB_UI_MODE === 'register'

const text = {
  home: '\uD648',
  calendar: '\uCE98\uB9B0\uB354',
  ledger: '\uAC00\uACC4\uBD80',
  travel: '\uC5EC\uD589',
  baby: '\uC721\uC544',
  diary: '\uC77C\uAE30',
  family: '\uAC00\uC871\uADF8\uB8F9',
  community: '\uCEE4\uBBA4\uB2C8\uD2F0',
  admin: '\uAD00\uB9AC\uC790',
  register: '\uD68C\uC6D0\uAC00\uC785',
  login: '\uB85C\uADF8\uC778',
}

const menus = [
  text.home,
  text.calendar,
  text.ledger,
  text.travel,
  text.baby,
  text.diary,
  text.family,
  text.community,
  text.admin,
]

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 1180, height: 720 },
  { name: 'desktop', width: 1440, height: 900 },
].filter((viewport) => !process.env.VIEWPORT || viewport.name === process.env.VIEWPORT)

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

async function clickByText(page, targetText) {
  return page.evaluate((value) => {
    const normalizeText = (item) => String(item || '').replace(/\s+/g, ' ').trim()
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], a, .nav-item, .mobile-tab'))
    const target = nodes.find((node) => normalizeText(node.textContent).includes(value))
    if (!target) return false
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return true
  }, targetText)
}

async function fillAuthForm(page, suffix) {
  const email = `webqa-${Date.now()}-${suffix}@example.test`
  const password = `QaPass!${Date.now()}`
  const nickname = `WebQA ${suffix}`

  await clickByText(page, text.register)
  await page.waitForTimeout(300)
  await page.evaluate(({ email, password, nickname }) => {
    const inputs = Array.from(document.querySelectorAll('.auth-card input'))
    const emailInput = inputs.find((input) => input.type === 'email') || inputs[0]
    const passwordInput = inputs.find((input) => input.type === 'password') || inputs[inputs.length - 1]
    const nicknameInput = inputs.find((input) => input !== emailInput && input !== passwordInput)
    const setValue = (input, value) => {
      if (!input) return
      input.focus()
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    setValue(emailInput, email)
    setValue(nicknameInput, nickname)
    setValue(passwordInput, password)
  }, { email, password, nickname })

  const submitted = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.auth-card button'))
    const target = buttons.reverse().find((button) => /가입|register/i.test(String(button.textContent || '')))
    if (!target) return false
    target.click()
    return true
  })
  if (!submitted) throw new Error('register button missing')
  await page.waitForTimeout(1800)
}

async function openPage(page, viewportName) {
  console.log(`[${viewportName}] open ${baseUrl}`)
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(1200)
}

async function handleAuth(page, viewportName) {
  const hasAuth = await page.locator('.auth-card').count()
  if (!hasAuth) return false

  console.log(`[${viewportName}] auth screen detected`)
  const authText = await page.locator('.auth-card').evaluate((node) => String(node.textContent || '').replace(/\s+/g, ' ').trim(), undefined, { timeout: 5000 })
  if (!authText.includes(text.login) && !authText.includes(text.register)) {
    throw new Error(`${viewportName}: auth screen text is not readable`)
  }

  if (fullFlow) {
    await fillAuthForm(page, viewportName)
    const stillAuth = await page.locator('.auth-card').count()
    if (stillAuth) throw new Error(`${viewportName}: registration did not leave auth screen`)
  }
  return true
}

async function collectLayoutIssues(page, viewportName, menu) {
  return page.evaluate(({ viewportName, menu }) => {
    const viewportWidth = document.documentElement.clientWidth
    const sampleText = Array.from(document.querySelectorAll('h1, h2, h3, button, label span, input, textarea, small'))
      .slice(0, 260)
      .map((node) => node.value || node.placeholder || node.textContent || '')
      .join(' ')
    const brokenPatterns = /[\uFFFD]|(\?{2,})|(\u00C3[\u0080-\u00BF])|(\u00EC[\u0080-\u00BF])/
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
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(15000)

  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await openPage(page, viewport.name)
  await handleAuth(page, viewport.name)

  const results = []
  const hasAuth = await page.locator('.auth-card').count()
  if (!hasAuth) {
    for (const menu of menus) {
      console.log(`[${viewport.name}] menu ${menu}`)
      const clicked = await clickByText(page, menu)
      await page.waitForTimeout(500)
      const result = await collectLayoutIssues(page, viewport.name, menu)
      results.push({ ...result, missing: !clicked && menu !== text.home })
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

console.log(JSON.stringify({ baseUrl, fullFlow, failures, report }, null, 2))
if (failures.length) process.exitCode = 1
