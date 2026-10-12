/**
 * Stage3W L4: Puppeteer — login → Import Contabilità → upload QA XML → staging/WV probe.
 * Attempts Avvia contabilizzazione + Contabilizza documento when UI unblocks.
 * LAB-only (127.0.0.1). Never prints tokens/passwords.
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
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_L4_BROWSER_IMPORT_UPLOAD_${stamp}.txt`)

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

/** LAB-only: bind QA supplier P.IVA + seed causale IVA 22% for Working View commit. */
function ensureLabImportFixtures() {
  const supplier = psql(`
UPDATE public.piano_conti
SET partita_iva='01378570350',
    anagrafica_piva='01378570350',
    anagrafica_tipo=coalesce(nullif(anagrafica_tipo,''),'fornitore'),
    is_fornitore=true,
    updated_at=now()
WHERE societa_id='${SOCIETA_A}'::uuid
  AND codice='2.10'
RETURNING codice||'|'||coalesce(partita_iva,'')||'|'||coalesce(is_fornitore::text,'');
`)
  const causale = psql(`
UPDATE public.causali_contabili
SET tipo_causale='docivanormale',
    tipo='fattura_fornitore',
    richiede_iva=true,
    codice_registro_iva=coalesce(nullif(codice_registro_iva,''),'01'),
    segno_registro_iva=coalesce(nullif(segno_registro_iva,''),'+'),
    updated_at=now()
WHERE societa_id='${SOCIETA_A}'::uuid
  AND codice='SG-ORD'
RETURNING codice||'|'||coalesce(tipo_causale,'')||'|'||coalesce(tipo,'')||'|'||coalesce(richiede_iva::text,'');
`)
  const iva = psql(`
INSERT INTO public.causali_iva (
  id, societa_id, codice, descrizione, aliquota, tipo, regime, detraibile,
  percentuale_detraibilita, include_liquidazione, include_dichiarazione, attivo,
  is_default_per_aliquota, regime_iva, tipo_trattamento,
  operazione_passiva, op_passive_spesometro, op_passive_liquidazione
) VALUES (
  '72000000-0000-4000-8000-0000000000A1'::uuid,
  '${SOCIETA_A}'::uuid,
  'SG-IVA22',
  'IVA acquisti 22% SG-E2E LAB',
  22,
  'acquisto',
  'normale',
  true,
  100,
  true,
  true,
  true,
  true,
  'Imponibile',
  'Normale',
  true,
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  societa_id=EXCLUDED.societa_id,
  codice=EXCLUDED.codice,
  descrizione=EXCLUDED.descrizione,
  aliquota=EXCLUDED.aliquota,
  detraibile=EXCLUDED.detraibile,
  percentuale_detraibilita=EXCLUDED.percentuale_detraibilita,
  attivo=true,
  is_default_per_aliquota=true,
  updated_at=now()
RETURNING codice||'|'||aliquota::text||'|'||societa_id::text;
`)
  return { supplier, causale, iva }
}

const lines = []
function log(msg) {
  const row = String(msg)
  lines.push(row)
  console.log(row)
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function main() {
  if (!existsSync(FIXTURE)) throw new Error(`FIXTURE_MISSING ${FIXTURE}`)
  ensurePassword()
  const fixtures = ensureLabImportFixtures()
  log(`QA_SUPPLIER_SEED=${fixtures.supplier || 'EMPTY'}`)
  log(`QA_CAUSALE_SEED=${fixtures.causale || 'EMPTY'}`)
  log(`QA_IVA_SEED=${fixtures.iva || 'EMPTY'}`)
  if (!/01378570350/.test(fixtures.supplier || '')) throw new Error('QA_SUPPLIER_SEED_FAILED')
  if (!/docivanormale/.test(fixtures.causale || '')) throw new Error('QA_CAUSALE_SEED_FAILED')
  if (!/SG-IVA22/.test(fixtures.iva || '')) throw new Error('QA_IVA_SEED_FAILED')
  log('L4_IMPORT_UPLOAD_START puppeteer Import upload/commit probe')
  log(`UI=${UI}`)
  log(`FIXTURE=${FIXTURE}`)
  log(`SOCIETA=${SOCIETA_A}`)

  const userDataDir = mkdtempSync(join(tmpdir(), 'fiscosim-l4-imp-up-'))
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(60000)
  page.on('dialog', async (dialog) => {
    try {
      await dialog.accept()
    } catch { /* ignore */ }
  })

  const mutating = []
  const consoleMsgs = []
  page.on('console', (msg) => {
    try {
      const text = String(msg.text() || '').slice(0, 240)
      if (/COMMIT|bloccato|ERROR|Error|fiscal|FISCAL|TipoError|warning/i.test(text)) {
        consoleMsgs.push(`${msg.type()}:${text}`)
      }
    } catch { /* ignore */ }
  })
  page.on('pageerror', (err) => {
    consoleMsgs.push(`pageerror:${String(err?.message || err).slice(0, 240)}`)
  })
  page.on('request', (req) => {
    try {
      const m = req.method()
      const u = req.url()
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(m) && /\/api\/|\/rest\/v1\//.test(u)) {
        mutating.push({ method: m, url: u.slice(0, 180) })
      }
    } catch { /* ignore */ }
  })

  let uploadOk = false
  let stagingOk = false
  let workingViewOk = false
  let commitAttempted = false
  let commitEnabled = false
  let fiscalWriteCount = 0

  try {
    await page.goto(UI + '/', { waitUntil: 'networkidle2' })
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

    const nav = await page.evaluate(() => {
      const clickText = (re, maxLen = 64) => {
        const nodes = [...document.querySelectorAll('button, a, [role="button"], .sb-item, .sb-parent, .sb-child')]
        const hit = nodes.find((el) => {
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
          return re.test(t) && t.length <= maxLen
        })
        if (!hit) return null
        hit.click()
        return (hit.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      }
      const steps = []
      const hub = clickText(/DOCUMENT HUB|Document Hub/i, 40)
      if (hub) steps.push('hub:' + hub)
      const section = clickText(/^DOCUMENT/i, 40)
      if (section && !hub) steps.push('section:' + section)
      const imp = clickText(/^Import Contabilit/i, 40) || clickText(/Import Contabilit/i, 48)
      if (imp) steps.push('item:' + imp)
      return {
        steps,
        snippet: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 280),
      }
    })
    log(`NAV=${JSON.stringify(nav.steps)}`)
    await sleep(1800)

    const shell = await page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      return {
        hasImportTitle: /Import Contabilit/i.test(t),
        hasFileInput: !!document.querySelector('input[type="file"]'),
        hasSocietaSelect: !!document.querySelector('header select, select'),
      }
    })
    log(`IMPORT_SHELL=${JSON.stringify(shell)}`)
    if (!shell.hasImportTitle || !shell.hasFileInput) throw new Error('IMPORT_UI_NOT_VISIBLE')

    const societaUi = await page.evaluate((id) => {
      const sels = [...document.querySelectorAll('select')]
      const sel = sels.find((s) => [...s.options].some((o) => o.value === id)) || sels[0]
      if (!sel) return { ok: false }
      sel.value = id
      sel.dispatchEvent(new Event('change', { bubbles: true }))
      const opt = [...sel.options].find((o) => o.value === id)
      return { ok: !!opt, value: sel.value, label: opt?.textContent?.trim()?.slice(0, 80) || '' }
    }, SOCIETA_A)
    log(`SOCIETA_UI=${JSON.stringify(societaUi)}`)
    if (!societaUi.ok || societaUi.value !== SOCIETA_A) throw new Error('SOCIETA_SELECT_FAILED')
    await sleep(800)

    const fileInput = await page.$('input[type="file"]')
    if (!fileInput) throw new Error('FILE_INPUT_MISSING')
    await fileInput.uploadFile(FIXTURE)
    log('UPLOAD_FILE=PASS')
    uploadOk = true

    // Wait for analyze busy to finish and staging/report to appear
    await page.waitForFunction(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      const busy = /Preparazione file|Analisi|Elaborazione|Caricamento/i.test(t)
        && !/Documenti|Working|Avvia contabilizzazione|Fornitore QA/i.test(t)
      const hasStaging = /Avvia contabilizzazione|IT01378570350|Fornitore QA Sprint/i.test(t)
        || document.querySelectorAll('table tbody tr').length > 0
      return !busy && hasStaging
    }, { timeout: 90000 }).catch(() => null)
    await sleep(1500)

    const staging = await page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      const rows = document.querySelectorAll('table tbody tr').length
      const checks = [...document.querySelectorAll('table tbody input[type="checkbox"]')].length
      return {
        rows,
        checks,
        hasFixtureName: /IT01378570350|Fornitore QA Sprint/i.test(t),
        hasAvvia: /Avvia contabilizzazione/i.test(t),
        hasError: /Errore|Something went wrong|TypeError|Cannot read/i.test(t)
          && !/nessun errore/i.test(t),
        banner: (t.match(/.{0,40}(banner|Errore|Seleziona|pronta|pronto).{0,80}/i) || [''])[0].slice(0, 120),
        snippet: t.slice(0, 500),
      }
    })
    log(`STAGING=${JSON.stringify({
      rows: staging.rows,
      checks: staging.checks,
      hasFixtureName: staging.hasFixtureName,
      hasAvvia: staging.hasAvvia,
      hasError: staging.hasError,
      banner: staging.banner,
    })}`)
    if (staging.rows < 1 && !staging.hasFixtureName) throw new Error('STAGING_EMPTY_AFTER_UPLOAD')
    stagingOk = true

    // If anagrafica still blocks, open detail and link existing Fornitore 2.10
    const completeProbe = await page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      const m = t.match(/COMPLETE\s+(\d+)/i)
      return { complete: m ? Number(m[1]) : null, hasAnagrafiche: /Anagrafiche|Controparti/i.test(t) }
    })
    log(`COMPLETE_PROBE=${JSON.stringify(completeProbe)}`)

    if (completeProbe.complete === 0) {
      const openAna = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')]
        const hit = btns.find((b) => /Apri dettaglio/i.test((b.textContent || '').trim()))
        if (!hit) return { ok: false, reason: 'missing' }
        hit.click()
        return { ok: true }
      })
      log(`ANAGRAFICHE_OPEN=${JSON.stringify(openAna)}`)
      await sleep(1000)

      const linkExisting = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('table tbody tr')]
        const anaRow = rows.find((r) => /01378570350|Fornitore QA/i.test(r.innerText || ''))
        if (!anaRow) {
          return { ok: false, reason: 'row_missing', tables: document.querySelectorAll('table').length }
        }
        const selects = [...anaRow.querySelectorAll('select')]
        const modeSel = selects.find((s) => [...s.options].some((o) => o.value === 'existing' || /esistente/i.test(o.textContent || '')))
        if (modeSel) {
          modeSel.value = 'existing'
          modeSel.dispatchEvent(new Event('change', { bubbles: true }))
        }
        return { ok: true, modeSet: !!modeSel, selects: selects.length }
      })
      log(`ANAGRAFICHE_MODE=${JSON.stringify(linkExisting)}`)
      await sleep(600)

      // Pick first existing account option from portal/picker if present
      const pickAccount = await page.evaluate(() => {
        const pickers = [...document.querySelectorAll('button, [role="option"]')]
        const hit = pickers.find((el) => /2\.10|Fornitore SG-E2E/i.test((el.textContent || '').trim()))
        if (hit) {
          hit.click()
          return { ok: true, via: 'button', label: (hit.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) }
        }
        const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => /2\.10|Fornitore/i.test(o.textContent || '')))
        if (sel) {
          const opt = [...sel.options].find((o) => /2\.10|Fornitore/i.test(o.textContent || ''))
          if (opt) {
            sel.value = opt.value
            sel.dispatchEvent(new Event('change', { bubbles: true }))
            return { ok: true, via: 'select', label: opt.textContent.trim().slice(0, 60) }
          }
        }
        return { ok: false }
      })
      log(`ANAGRAFICHE_ACCOUNT=${JSON.stringify(pickAccount)}`)
      await sleep(400)

      const confirmAna = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')]
        const single = btns.find((b) => /^Conferma$/i.test((b.textContent || '').trim()) && !b.disabled)
        const all = btns.find((b) => /Conferma completati|Conferma tutti/i.test((b.textContent || '').trim()) && !b.disabled)
        const hit = single || all
        if (!hit) return { ok: false, labels: btns.map((b) => (b.textContent || '').trim()).filter(Boolean).slice(0, 20) }
        hit.click()
        return { ok: true, label: (hit.textContent || '').trim().slice(0, 40) }
      })
      log(`ANAGRAFICHE_CONFIRM=${JSON.stringify(confirmAna)}`)
      await sleep(1500)
    }

    // Fill Working Table conto + causale if editors available (best-effort)
    const fillEditors = async (btnPrefix, searchHint) => {
      const opened = await page.evaluate((prefix) => {
        const btn = document.querySelector(`button[id^="${prefix}"]`)
        if (!btn || btn.disabled) return { ok: false }
        btn.click()
        return { ok: true, id: btn.id, label: (btn.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) }
      }, btnPrefix)
      log(`EDITOR_OPEN_${btnPrefix}=${JSON.stringify(opened)}`)
      if (!opened.ok) return false
      await sleep(700)
      const picked = await page.evaluate((hint) => {
        const portal = document.querySelector('.conto-portal-container') || document.body
        const options = [...portal.querySelectorAll('button')].filter((b) => {
          const t = (b.textContent || '').replace(/\s+/g, ' ').trim()
          return t && t.length < 120 && (new RegExp(hint, 'i').test(t) || /\d\.\d{2}/.test(t))
        })
        const hit = options.find((b) => new RegExp(hint, 'i').test((b.textContent || ''))) || options[0]
        if (!hit) return { ok: false, optionCount: options.length }
        hit.click()
        return { ok: true, label: (hit.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) }
      }, searchHint)
      log(`EDITOR_PICK_${btnPrefix}=${JSON.stringify(picked)}`)
      await sleep(400)
      return !!picked.ok
    }

    await fillEditors('btn-conto-', '5\\.01|Costi')
    await fillEditors('btn-causale-', 'SG-ORD|ordinaria')

    // Select first staging checkbox
    const selected = await page.evaluate(() => {
      const cb = document.querySelector('table tbody input[type="checkbox"]')
      if (!cb) return { ok: false }
      if (!cb.checked) cb.click()
      return { ok: true, checked: !!cb.checked }
    })
    log(`ROW_SELECT=${JSON.stringify(selected)}`)
    await sleep(400)

    // Try open Working View via Avvia contabilizzazione
    const avvia = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')]
      const hit = btns.find((b) => /Avvia contabilizzazione/i.test((b.textContent || '').trim()))
      if (!hit) return { ok: false, reason: 'missing' }
      if (hit.disabled) return { ok: false, reason: 'disabled' }
      hit.click()
      return { ok: true }
    })
    log(`AVVIA_CLICK=${JSON.stringify(avvia)}`)
    await sleep(2500)

    const afterAvvia = await page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      const statusBlock = (() => {
        const m = t.match(/(Contabilizzazione bloccata|Bozza da verificare|Bozza coerente)[\s\S]{0,420}/i)
        return m ? m[0].replace(/\s+/g, ' ').slice(0, 360) : ''
      })()
      return {
        hasWorkingView: /Fattura in lavorazione|Contabilizza documento|Predisposizione/i.test(t),
        hasCommitBtn: /Contabilizza documento/i.test(t),
        banner: (() => {
          const m = t.match(/.{0,20}(Apertura predisposizione|non è pronta|Errore bloccante|Seleziona almeno|Nuova anagrafica).{0,100}/i)
          return m ? m[0].slice(0, 160) : ''
        })(),
        commitDisabled: (() => {
          const btn = [...document.querySelectorAll('button')].find((b) => /Contabilizza documento/i.test((b.textContent || '').trim()))
          return btn ? !!btn.disabled : null
        })(),
        statusBlock,
        hasIvaTab: /IVA|Registro/i.test(t),
      }
    })
    log(`AFTER_AVVIA=${JSON.stringify({
      hasWorkingView: afterAvvia.hasWorkingView,
      hasCommitBtn: afterAvvia.hasCommitBtn,
      commitDisabled: afterAvvia.commitDisabled,
      banner: afterAvvia.banner,
      statusBlock: afterAvvia.statusBlock,
    })}`)
    workingViewOk = !!afterAvvia.hasWorkingView
    commitEnabled = afterAvvia.commitDisabled === false

    // Best-effort: open IVA tab and pick first causale IVA if selectors exist
    if (workingViewOk && !commitEnabled) {
      const ivaTab = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('button, [role="tab"]')]
        const hit = tabs.find((el) => /^IVA$/i.test((el.textContent || '').trim()) || /Scheda IVA|Registro IVA/i.test((el.textContent || '').trim()))
        if (!hit) return { ok: false }
        hit.click()
        return { ok: true, label: (hit.textContent || '').trim().slice(0, 40) }
      })
      log(`IVA_TAB=${JSON.stringify(ivaTab)}`)
      await sleep(800)

      const fillIva = await page.evaluate(() => {
        const sels = [...document.querySelectorAll('select')]
        let filled = 0
        const labels = []
        for (const sel of sels) {
          const opt = [...sel.options].find((o) =>
            /SG-IVA22|22/.test(o.textContent || '') || (o.value && o.value !== '' && !/seleziona|scegli|mancante/i.test(o.textContent || '')),
          )
          if (opt) {
            sel.value = opt.value
            sel.dispatchEvent(new Event('change', { bubbles: true }))
            filled += 1
            labels.push((opt.textContent || '').trim().slice(0, 40))
          }
        }
        // Custom pickers / buttons
        const btns = [...document.querySelectorAll('button')]
        const causaleBtn = btns.find((b) => /Causale IVA|Seleziona causale|SG-IVA22|mancante/i.test((b.textContent || '').trim()))
        if (causaleBtn) causaleBtn.click()
        return { selectCount: sels.length, filled, labels, openedPicker: !!causaleBtn }
      })
      log(`IVA_FILL=${JSON.stringify(fillIva)}`)
      await sleep(700)
      if (fillIva.openedPicker) {
        const pick = await page.evaluate(() => {
          const hit = [...document.querySelectorAll('button, [role="option"], li')].find((el) =>
            /SG-IVA22|IVA acquisti 22/i.test((el.textContent || '').trim()),
          )
          if (!hit) return { ok: false }
          hit.click()
          return { ok: true, label: (hit.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) }
        })
        log(`IVA_PICK=${JSON.stringify(pick)}`)
        await sleep(700)
      }

      const recheck = await page.evaluate(() => {
        const t = document.body.innerText.replace(/\s+/g, ' ')
        const btn = [...document.querySelectorAll('button')].find((b) => /Contabilizza documento/i.test((b.textContent || '').trim()))
        const statusBlock = (() => {
          const m = t.match(/(Contabilizzazione bloccata|Bozza da verificare|Bozza coerente)[\s\S]{0,420}/i)
          return m ? m[0].replace(/\s+/g, ' ').slice(0, 360) : ''
        })()
        return {
          commitDisabled: btn ? !!btn.disabled : null,
          statusBlock,
        }
      })
      log(`AFTER_IVA_FILL=${JSON.stringify(recheck)}`)
      commitEnabled = recheck.commitDisabled === false
    }

    if (workingViewOk && !commitEnabled) {
      // already handled above
    }

    // Fix IVA PN row if accountId missing (placeholder "IVA · Imposta...")
    if (workingViewOk) {
      const openIvaPicker = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')]
        const ivaBtn = buttons.find((b) => /IVA\s*·|Imposta sul valore aggiunto/i.test((b.textContent || '').replace(/\s+/g, ' ')))
        if (!ivaBtn) return { ok: false, reason: 'iva_btn_missing' }
        ivaBtn.click()
        return { ok: true, label: (ivaBtn.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) }
      })
      log(`OPEN_IVA_PICKER=${JSON.stringify(openIvaPicker)}`)
      await sleep(500)
      if (openIvaPicker.ok) {
        const search = await page.$('input[placeholder*="Cerca conto"]')
        if (search) {
          await search.click({ clickCount: 3 })
          await search.type('2.02', { delay: 20 })
          await sleep(400)
        }
        const pick = await page.evaluate(() => {
          const opt = [...document.querySelectorAll('button')].find((b) => {
            const t = (b.textContent || '').replace(/\s+/g, ' ').trim()
            return /^2\.02\b|2\.02\s+IVA credito/i.test(t) || (t.includes('2.02') && /IVA credito/i.test(t))
          })
          if (!opt) {
            return {
              ok: false,
              options: [...document.querySelectorAll('button')]
                .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim())
                .filter((t) => /2\.|IVA/i.test(t))
                .slice(0, 12),
            }
          }
          opt.click()
          return { ok: true, label: (opt.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) }
        })
        log(`FIX_IVA_ACCOUNT=${JSON.stringify(pick)}`)
        await sleep(600)
      }

      const recheckCommit = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => /Contabilizza documento/i.test((b.textContent || '').trim()))
        const t = document.body.innerText.replace(/\s+/g, ' ')
        const statusBlock = (() => {
          const m = t.match(/(Contabilizzazione bloccata|Bozza da verificare|Bozza coerente)[\s\S]{0,200}/i)
          return m ? m[0].replace(/\s+/g, ' ').slice(0, 200) : ''
        })()
        return { commitDisabled: btn ? !!btn.disabled : null, statusBlock }
      })
      log(`AFTER_FIX_IVA=${JSON.stringify(recheckCommit)}`)
      commitEnabled = recheckCommit.commitDisabled === false
    }

    if (workingViewOk && commitEnabled) {
      page.removeAllListeners('dialog')
      page.on('dialog', async (dialog) => {
        log(`DIALOG=${dialog.type()}:${String(dialog.message() || '').slice(0, 120)}`)
        try { await dialog.accept() } catch { /* ignore */ }
      })

      const commitClick = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => /Contabilizza documento/i.test((b.textContent || '').trim()) && !b.disabled)
        if (!btn) return { ok: false }
        btn.click()
        return { ok: true }
      })
      log(`COMMIT_CLICK=${JSON.stringify(commitClick)}`)
      commitAttempted = !!commitClick.ok
      await sleep(8000)
      const postCommit = await page.evaluate(() => {
        const t = document.body.innerText.replace(/\s+/g, ' ')
        return {
          registered: /Registrata|già contabilizzat|state.*registered|commit.*complet/i.test(t),
          banner: (() => {
            const m = t.match(/.{0,20}(Commit demo bloccato|Errore bloccante|contabilizzat|registrat|warning|successo|Tipo tecnico|sottoconto mancante).{0,140}/i)
            return m ? m[0].slice(0, 200) : ''
          })(),
          busy: /Contabilizzazione in corso/i.test(t),
        }
      })
      log(`POST_COMMIT=${JSON.stringify(postCommit)}`)
      log(`CONSOLE_COMMIT=${JSON.stringify(consoleMsgs.slice(-20))}`)
    } else if (workingViewOk) {
      log('COMMIT_SKIPPED=working_view_checks_not_ok')
      log(`CONSOLE_WV=${JSON.stringify(consoleMsgs.slice(-12))}`)
    } else {
      log('COMMIT_SKIPPED=working_view_not_open')
    }

    const writes = mutating.filter((m) => !/\/auth\/v1\//.test(m.url))
    const fiscalWrites = writes.filter((m) => /fiscal-journal-post|general-journal-post/i.test(m.url))
    fiscalWriteCount = fiscalWrites.length
    log(`MUTATING_API_COUNT=${writes.length}`)
    log(`MUTATING_SAMPLE=${JSON.stringify(writes.slice(0, 8))}`)
    log(`FISCAL_WRITE_COUNT=${fiscalWriteCount}`)
    log(`FISCAL_WRITE_SAMPLE=${JSON.stringify(fiscalWrites.slice(0, 3))}`)

    // Acceptance: upload + staging are required; WV/commit are best-effort probes
    if (!uploadOk || !stagingOk) throw new Error('UPLOAD_OR_STAGING_FAILED')
    log(`PROBE_WORKING_VIEW=${workingViewOk ? 'PASS' : 'PARTIAL'}`)
    log(`PROBE_COMMIT=${commitAttempted ? (fiscalWriteCount > 0 ? 'PASS' : 'ATTEMPTED_NO_FISCAL_WRITE') : (commitEnabled ? 'ENABLED_NOT_CLICKED' : 'BLOCKED_OR_SKIPPED')}`)
    log('L4_IMPORT_UPLOAD_RESULT=PASS')
  } finally {
    await browser.close().catch(() => null)
  }
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`L4_IMPORT_UPLOAD_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('L4_IMPORT_UPLOAD_RESULT=FAIL'))) process.exit(1)
  })
