/**
 * Stage3W L4: Puppeteer smoke — login → Contabilità → Riconciliazione bancaria (LAB).
 * Asserts bank reconciliation shell visible; no silent fiscal write.
 * LAB-only. Never prints tokens/passwords.
 */
import puppeteer from 'puppeteer'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const UI = 'http://127.0.0.1:5173'
const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const EMAIL = 'sg-e2e-a@example.invalid'
const PASSWORD = 'SgE2eLabBrowser!20261011'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_L4_BROWSER_BANK_${stamp}.txt`)

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8' },
  ).trim()
}

function ensurePassword() {
  const q = PASSWORD.replace(/'/g, "''")
  psql(`
UPDATE auth.users SET
  encrypted_password=crypt('${q}', gen_salt('bf')),
  confirmation_token=coalesce(confirmation_token,''),
  recovery_token=coalesce(recovery_token,''),
  email_change_token_new=coalesce(email_change_token_new,''),
  email_change=coalesce(email_change,''),
  phone_change=coalesce(phone_change,''),
  phone_change_token=coalesce(phone_change_token,''),
  reauthentication_token=coalesce(reauthentication_token,''),
  email_change_token_current=coalesce(email_change_token_current,''),
  email_confirmed_at=coalesce(email_confirmed_at,now()),
  updated_at=now()
WHERE id='72000000-0000-4000-8000-000000000003'::uuid;
INSERT INTO auth.identities (id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at)
SELECT u.id,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email',u.id::text,now(),now(),now()
FROM auth.users u
WHERE u.id='72000000-0000-4000-8000-000000000003'::uuid
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id=u.id AND i.provider='email');
`)
}

const lines = []
function log(msg) {
  const row = String(msg)
  lines.push(row)
  console.log(row)
}

async function main() {
  ensurePassword()
  log('L4_BANK_START puppeteer Riconciliazione bancaria smoke')
  log(`UI=${UI}`)

  const userDataDir = mkdtempSync(join(tmpdir(), 'fiscosim-l4-bank-'))
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(45000)
  const mutating = []
  page.on('request', (req) => {
    try {
      const m = req.method()
      const u = req.url()
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(m) && /\/api\/|\/rest\/v1\//.test(u)) {
        mutating.push({ method: m, url: u.slice(0, 160) })
      }
    } catch { /* ignore */ }
  })

  try {
    await page.goto(`${UI}/`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('input[type="email"]')
    await page.type('input[type="email"]', EMAIL, { delay: 12 })
    await page.type('input[type="password"]', PASSWORD, { delay: 12 })
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForFunction(() => !document.body.innerText.includes('Accesso riservato'), { timeout: 30000 }).catch(() => null),
    ])
    await page.waitForFunction(
      () => document.body.innerText.includes('Contabilit') || document.body.innerText.includes('Dashboard') || document.querySelector('nav'),
      { timeout: 30000 },
    )
    log('LOGIN_UI=PASS')

    const navSection = await page.evaluate(() => {
      const clickText = (re, maxLen = 48) => {
        const nodes = [...document.querySelectorAll('button, a, [role="button"], .sb-item, .sb-parent, .sb-child')]
        const hit = nodes.find((el) => {
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
          return re.test(t) && t.length <= maxLen
        })
        if (!hit) return null
        hit.click()
        return (hit.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
      }
      const steps = []
      const section = clickText(/^CONTABILIT/i, 40) || clickText(/CONTABILIT/i, 40)
      if (section) steps.push(`section:${section}`)
      return { steps }
    })
    log(`NAV_SECTION=${JSON.stringify(navSection.steps)}`)
    await new Promise((r) => setTimeout(r, 500))

    const navPrima = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('button, a, .sb-child, .sb-item')]
      const hit = nodes.find((el) => {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
        return /^Prima Nota$/i.test(t) || (/Prima Nota/i.test(t) && t.length < 24)
      })
      if (!hit) {
        return {
          ok: false,
          labels: nodes.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40),
        }
      }
      hit.click()
      return { ok: true, label: (hit.textContent || '').replace(/\s+/g, ' ').trim() }
    })
    log(`NAV_PRIMA=${JSON.stringify(navPrima)}`)
    if (!navPrima.ok) throw new Error('NAV_PRIMA_NOTA_FAILED')

    await page.waitForFunction(
      () => !!document.querySelector('.cont-layout, .cont-sidebar, .cont-module-shell'),
      { timeout: 30000 },
    )
    await new Promise((r) => setTimeout(r, 1000))

    const societaUi = await page.evaluate((id) => {
      const sel = document.querySelector('.cont-sidebar-societa select') || document.querySelector('aside select')
      if (!sel) return { ok: false, reason: 'NO_SELECT' }
      if (id && [...sel.options].some((o) => o.value === id)) {
        sel.value = id
        sel.dispatchEvent(new Event('change', { bubbles: true }))
      }
      return {
        ok: true,
        value: sel.value,
        label: sel.options?.[sel.selectedIndex]?.text || '',
      }
    }, SOCIETA_A)
    log(`SOCIETA_UI=${JSON.stringify(societaUi)}`)
    await new Promise((r) => setTimeout(r, 800))

    const navBank = await page.evaluate(() => {
      const root = document.querySelector('.cont-sidebar, .cont-layout, aside.cont-sidebar')
        || document.querySelector('[aria-label="Sottomenu contabilità"]')
      const scope = root || document
      const items = [...scope.querySelectorAll('.cont-sidebar-item, button, a, [role="button"]')]
      const hit = items.find((el) => {
        if (!el.closest('.cont-layout, .cont-sidebar, [aria-label="Sottomenu contabilità"]')) return false
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
        return /^Riconciliazione bancaria$/i.test(t) || (/Riconciliazione bancaria/i.test(t) && t.length < 40)
      })
      if (!hit) {
        return {
          ok: false,
          labels: [...document.querySelectorAll('.cont-sidebar-item, .cont-sidebar button, .cont-sidebar a')]
            .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
            .filter((t) => t && t.length < 64)
            .slice(0, 40),
        }
      }
      hit.click()
      return { ok: true, label: (hit.textContent || '').replace(/\s+/g, ' ').trim() }
    })
    log(`NAV_BANK=${JSON.stringify(navBank)}`)
    if (!navBank.ok) throw new Error('NAV_BANK_FAILED')
    await new Promise((r) => setTimeout(r, 1500))

    const ui = await page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      return {
        hasTitle: /Riconciliazione bancaria/i.test(t),
        hasMovimenti: /Moviment|Importo|Controparte|Working View|Conferma|Da abbinare|Pronta/i.test(t),
        hasImportOrDemo: /Import|Demo|estratto|CSV|PDF|Prova Working View/i.test(t),
        hasErrorCrash: /Something went wrong|TypeError|Cannot read/i.test(t),
      }
    })
    log(`BANK_UI=${JSON.stringify(ui)}`)
    if (!ui.hasTitle && !ui.hasMovimenti) throw new Error('BANK_UI_NOT_VISIBLE')
    if (ui.hasErrorCrash) throw new Error('BANK_UI_CRASH')

    const writeDuringSmoke = mutating.filter((m) => !/\/auth\/v1\//.test(m.url))
    log(`MUTATING_API_COUNT=${writeDuringSmoke.length}`)
    log(`MUTATING_SAMPLE=${JSON.stringify(writeDuringSmoke.slice(0, 5))}`)
    const fiscalWrites = writeDuringSmoke.filter((m) => /fiscal-journal-post|general-journal-post/i.test(m.url))
    log(`FISCAL_WRITE_COUNT=${fiscalWrites.length}`)
    if (fiscalWrites.length) throw new Error('UNEXPECTED_FISCAL_WRITE_DURING_BANK_SMOKE')

    log('L4_BANK_RESULT=PASS')
  } finally {
    await browser.close().catch(() => null)
  }
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`L4_BANK_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('L4_BANK_RESULT=FAIL'))) process.exit(1)
  })
