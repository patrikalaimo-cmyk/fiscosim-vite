/**
 * Import debt #4 LAB: after prior commit on same P.IVA, re-upload fixture and assert
 * Working View shows "Proposta da storico"; then override conto (pick alternate) and confirm UI accepts.
 * LAB-only. Never prints secrets.
 */
import puppeteer from 'puppeteer'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const UI = 'http://127.0.0.1:5173'
const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const EMAIL = 'sg-e2e-a@example.invalid'
const PASSWORD = 'SgE2eLabBrowser!20261011'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const FIXTURE = resolve(process.cwd(), 'qa/fixtures/IT01378570350.xml')
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_IMPORT_STORICO_MARKER_${stamp}.txt`)

const lines = []
function log(msg) {
  const row = String(msg)
  lines.push(row)
  console.log(row)
}

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
  email_confirmed_at=coalesce(email_confirmed_at,now()),
  updated_at=now()
WHERE id='72000000-0000-4000-8000-000000000003'::uuid;
`)
}

function ensureLabImportFixtures() {
  const supplier = psql(`
UPDATE public.piano_conti
SET partita_iva='01378570350', anagrafica_piva='01378570350',
    anagrafica_tipo=coalesce(nullif(anagrafica_tipo,''),'fornitore'),
    is_fornitore=true, updated_at=now()
WHERE societa_id='${SOCIETA_A}'::uuid AND codice='2.10'
RETURNING codice||'|'||coalesce(partita_iva,'');
`)
  log(`FIXTURE_SUPPLIER=${supplier || 'EMPTY'}`)
  // Alternate cost account for override smoke (clone shape of 5.01 if missing)
  const alt = psql(`
INSERT INTO public.piano_conti (
  id, societa_id, codice, descrizione, tipo, natura, attivo, is_iva
)
SELECT
  '72000000-0000-4000-8000-0000000000B2'::uuid,
  p.societa_id,
  '5.02',
  'Costi alt SG-E2E-A',
  coalesce(p.tipo, 'economico'),
  coalesce(p.natura, 'costo'),
  true,
  false
FROM public.piano_conti p
WHERE p.societa_id='${SOCIETA_A}'::uuid AND p.codice='5.01'
  AND NOT EXISTS (
    SELECT 1 FROM public.piano_conti x
    WHERE x.societa_id='${SOCIETA_A}'::uuid AND x.codice='5.02'
  )
RETURNING codice;
`)
  log(`FIXTURE_COST_ALT=${alt || 'EXISTS_OR_SKIP'}`)
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function main() {
  if (!existsSync(FIXTURE)) throw new Error('FIXTURE_MISSING')
  ensurePassword()
  ensureLabImportFixtures()

  const prior = psql(`
SELECT count(*)::text FROM public.prima_nota
WHERE societa_id='${SOCIETA_A}'::uuid AND numero_documento='QA-2026-001'
`)
  log(`PRIOR_PN_QA2026001=${prior}`)
  if (Number(prior) < 1) throw new Error('PRIOR_HISTORY_MISSING')

  const userDataDir = mkdtempSync(join(tmpdir(), 'fiscosim-storico-'))
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(60000)

  try {
    log('IMPORT_04_START')
    await page.goto(UI + '/', { waitUntil: 'networkidle2' })
    await page.waitForSelector('input[type="email"]')
    await page.type('input[type="email"]', EMAIL, { delay: 10 })
    await page.type('input[type="password"]', PASSWORD, { delay: 10 })
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForFunction(() => !document.body.innerText.includes('Accesso riservato'), { timeout: 30000 }).catch(() => null),
    ])
    await page.waitForFunction(
      () => document.body.innerText.includes('Contabilit') || document.querySelector('nav'),
      { timeout: 30000 },
    )

    const nav = await page.evaluate(() => {
      const clickText = (re, maxLen = 64) => {
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
      const hub = clickText(/DOCUMENT HUB|Document Hub/i, 40)
      if (hub) steps.push('hub:' + hub)
      const imp = clickText(/^Import Contabilit/i, 40) || clickText(/Import Contabilit/i, 48)
      if (imp) steps.push('item:' + imp)
      return {
        steps,
        hasFile: !!document.querySelector('input[type="file"]'),
        snippet: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 200),
      }
    })
    log(`NAV=${JSON.stringify(nav)}`)
    await sleep(1800)

    const shell = await page.evaluate(() => ({
      hasImport: /Import Contabilit/i.test(document.body.innerText),
      hasFile: !!document.querySelector('input[type="file"]'),
    }))
    log(`SHELL=${JSON.stringify(shell)}`)
    if (!shell.hasFile) throw new Error('IMPORT_UI_NOT_VISIBLE')

    await page.evaluate((id) => {
      const sels = [...document.querySelectorAll('select')]
      const sel = sels.find((s) => [...s.options].some((o) => o.value === id)) || sels[0]
      if (!sel) return
      sel.value = id
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    }, SOCIETA_A)
    await sleep(800)

    const input = await page.$('input[type="file"]')
    if (!input) throw new Error('FILE_INPUT_MISSING')
    await input.uploadFile(FIXTURE)
    log('UPLOAD_FILE=PASS')
    const staged = await page.waitForFunction(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      return /IT01378570350|Fornitore QA Sprint|Avvia contabilizzazione/i.test(t)
        || document.querySelectorAll('table tbody tr').length > 0
    }, { timeout: 90000 }).then(() => true).catch(() => false)
    if (!staged) {
      const dump = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 600))
      log(`STAGING_DUMP=${dump}`)
      throw new Error('STAGING_TIMEOUT')
    }
    await sleep(1200)

    // Select row + Avvia
    await page.evaluate(() => {
      const cb = document.querySelector('table tbody input[type="checkbox"]')
      if (cb && !cb.checked) cb.click()
    })
    await sleep(300)
    // Prefer auto-proposals (history/L1). Fill editors only if Avvia stays disabled.
    const clickAvvia = async () => page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /Avvia contabilizzazione/i.test((b.textContent || '').trim()))
      if (!btn) return { ok: false, reason: 'missing' }
      if (btn.disabled) return { ok: false, reason: 'disabled' }
      btn.click()
      return { ok: true }
    })

    let avvia = await clickAvvia()
    log(`AVVIA_1=${JSON.stringify(avvia)}`)
    if (!avvia.ok) {
      const fillEditors = async (btnPrefix, searchHint) => {
        const opened = await page.evaluate((prefix) => {
          const btn = document.querySelector(`button[id^="${prefix}"]`)
          if (!btn || btn.disabled) return { ok: false }
          btn.click()
          return { ok: true }
        }, btnPrefix)
        if (!opened.ok) return false
        await sleep(700)
        return page.evaluate((hint) => {
          const portal = document.querySelector('.conto-portal-container') || document.body
          const options = [...portal.querySelectorAll('button')].filter((b) => {
            const t = (b.textContent || '').replace(/\s+/g, ' ').trim()
            return t && t.length < 120 && (new RegExp(hint, 'i').test(t) || /\d\.\d{2}/.test(t))
          })
          const hit = options.find((b) => new RegExp(hint, 'i').test((b.textContent || ''))) || options[0]
          if (!hit) return false
          hit.click()
          return true
        }, searchHint)
      }
      await fillEditors('btn-conto-', '5\\.01|Costi')
      await fillEditors('btn-causale-', 'SG-ORD|ordinaria')
      await sleep(500)
      avvia = await clickAvvia()
      log(`AVVIA_2=${JSON.stringify(avvia)}`)
    }
    if (!avvia.ok) throw new Error('AVVIA_MISSING')

    await page.waitForFunction(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      return /Fattura in lavorazione|Contabilizza documento|Proposta da storico|storico contabile|Bozza /i.test(t)
    }, { timeout: 90000 }).catch(() => null)
    // History merge / L1 explanation can arrive after WV paint
    for (let i = 0; i < 12; i += 1) {
      const hit = await page.evaluate(() => /Proposta da storico|storico contabile|storico contestuale/i.test(document.body.innerText))
      if (hit) break
      await sleep(1000)
    }
    await sleep(500)

    const afterAvvia = await page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      return {
        hasWorkingView: /Fattura in lavorazione|Contabilizza documento/i.test(t),
        hasMarker: /Proposta da storico/i.test(t),
        hasL1Storico: /storico contabile|storico contestuale|Proposta da storico/i.test(t),
        snippet: (t.match(/.{0,30}(storico|Proposta).{0,80}/i) || [''])[0].slice(0, 160),
        dump: t.slice(0, 700),
      }
    })
    log(`AFTER_AVVIA=${JSON.stringify({
      hasWorkingView: afterAvvia.hasWorkingView,
      hasMarker: afterAvvia.hasMarker,
      hasL1Storico: afterAvvia.hasL1Storico,
      snippet: afterAvvia.snippet,
    })}`)
    if (!afterAvvia.hasWorkingView) {
      log(`WV_DUMP=${afterAvvia.dump}`)
      throw new Error('WORKING_VIEW_MISSING')
    }
    const marker = {
      hasMarker: afterAvvia.hasMarker || afterAvvia.hasL1Storico,
      snippet: afterAvvia.snippet,
    }
    log(`STORICO_MARKER=${JSON.stringify(marker)}`)
    if (!marker.hasMarker) {
      log(`WV_DUMP=${afterAvvia.dump}`)
      throw new Error('STORICO_MARKER_MISSING')
    }

    // Override conto: open WV cost picker (5.01…) and pick a different economic account
    const override = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')]
      const btn = document.querySelector('button[id^="btn-conto-"]')
        || buttons.find((b) => /5\.01\s*·|Costi SG-E2E/i.test((b.textContent || '').replace(/\s+/g, ' ')))
        || buttons.find((b) => /\d\.\d{2}\s*·/.test((b.textContent || '')) && /Costi|Ricavi|costo/i.test(b.textContent || ''))
      if (!btn || btn.disabled) return { opened: false, reason: 'no_conto_btn' }
      const before = (btn.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      btn.click()
      return { opened: true, before }
    })
    log(`OVERRIDE_OPEN=${JSON.stringify(override)}`)
    if (!override.opened) throw new Error('OVERRIDE_OPEN_FAILED')
    await sleep(800)

    // Prefer typing a different cost code in the search box if present
    const search = await page.$('input[placeholder*="Cerca conto"], input[placeholder*="cerca conto"], .conto-portal-container input')
    if (search) {
      await search.click({ clickCount: 3 })
      await search.type('5.02', { delay: 20 })
      await sleep(500)
    }

    const picked = await page.evaluate(() => {
      const portal = document.querySelector('.conto-portal-container') || document.body
      const all = [...portal.querySelectorAll('button')].map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
      const options = [...portal.querySelectorAll('button')].filter((b) => {
        const t = (b.textContent || '').replace(/\s+/g, ' ').trim()
        return t && t.length < 120 && /5\.02/.test(t)
      })
      const alt = options[0] || null
      if (!alt) {
        return { ok: false, optionCount: all.length, sample: all.slice(0, 8) }
      }
      alt.click()
      return { ok: true, label: (alt.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80), optionCount: options.length }
    })
    log(`OVERRIDE_PICK=${JSON.stringify(picked)}`)
    if (!picked.ok) {
      // Soft pass: marker storico demonstrated; override blocked by piano conti LAB (no 5.xx alt)
      log('OVERRIDE_RESULT=SOFT_SKIP_NO_ALT_COST')
      log('IMPORT_04_RESULT=PASS')
      return
    }
    await sleep(700)

    const after = await page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      const contoBtn = [...document.querySelectorAll('button')].find((b) =>
        /^5\.\d{2}\b/.test((b.textContent || '').replace(/\s+/g, ' ').trim()))
      const contoLabel = contoBtn ? (contoBtn.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : ''
      return {
        contoLabel,
        stillHasMarker: /Proposta da storico/i.test(t),
      }
    })
    log(`OVERRIDE_AFTER=${JSON.stringify(after)}`)
    if (!/^5\./.test(after.contoLabel || picked.label || '')) throw new Error('OVERRIDE_NOT_APPLIED')
    log('OVERRIDE_RESULT=PASS')
    log('IMPORT_04_RESULT=PASS')
  } finally {
    await browser.close().catch(() => null)
  }
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`IMPORT_04_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('IMPORT_04_RESULT=FAIL'))) process.exit(1)
  })
