/**
 * Stage3W SG-P1-06: L4 browser Consultazione read-only on persisted PN.
 * Seed fiscal LAB PN → open Consultazione → filter by doc → detail sidebar
 * asserts read-only + filter coherence; no write HTTP during consult phase.
 * LAB-only. Never prints tokens/passwords.
 */
import puppeteer from 'puppeteer'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const UI = 'http://127.0.0.1:5173'
const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const EMAIL = 'sg-e2e-a@example.invalid'
const PASSWORD = 'SgE2eLabBrowser!20261011'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const CONTO_COSTO = '72000000-0000-4000-8000-000000000014'
const CONTO_IVA = '72000000-0000-4000-8000-000000000015'
const CONTO_FORN = '72000000-0000-4000-8000-000000000016'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_L4_BROWSER_CONSULTAZIONE_${stamp}.txt`)

function loadEnvFile(path) {
  const map = {}
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return map
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
  const env = loadEnvFile(join(process.cwd(), '.env.stage3w.lab.local'))
  if (env.VITE_FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB !== 'true') {
    throw new Error('VITE_FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB must be true in .env.stage3w.lab.local')
  }
  ensurePassword()
  log('P1_06_START puppeteer Consultazione L4 read-only')
  log(`UI=${UI}`)

  const userDataDir = mkdtempSync(join(tmpdir(), 'fiscosim-p106-'))
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(45000)

  const writeHits = []
  const fiscalPosts = []
  let phase = 'login'
  page.on('request', (req) => {
    const method = req.method()
    const url = req.url()
    if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') return
    writeHits.push({ method, url: url.slice(0, 180), phase })
  })
  page.on('response', async (res) => {
    try {
      if (res.url().includes('/api/studio/fiscal-journal-post')) {
        fiscalPosts.push({ status: res.status(), url: res.url(), phase })
      }
    } catch {
      /* ignore */
    }
  })

  const markPhase = (name) => {
    phase = name
  }

  try {
    await page.goto(UI + '/', { waitUntil: 'networkidle2' })
    await page.waitForSelector('input[type="email"]')
    await page.type('input[type="email"]', EMAIL, { delay: 15 })
    await page.type('input[type="password"]', PASSWORD, { delay: 15 })
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForFunction(() => !document.body.innerText.includes('Accesso riservato'), { timeout: 30000 }).catch(() => null),
    ])
    await page.waitForFunction(
      () => document.body.innerText.includes('Contabilit') || document.body.innerText.includes('Dashboard') || document.querySelector('nav'),
      { timeout: 30000 },
    )
    const loginOk = await page.evaluate(() => !document.body.innerText.includes('Sessione non valida')
      && !document.body.innerText.includes('Email o password'))
    if (!loginOk) throw new Error('LOGIN_UI_FAILED')
    log('LOGIN_UI=PASS')
    markPhase('seed')

    const requestId = randomUUID()
    const docNum = `SG-E2E-P106-${stamp.slice(-6)}`
    const postResult = await page.evaluate(
      async ({ societaId, requestId, docNum, cCosto, cIva, cForn }) => {
        let accessToken = ''
        const walk = (o) => {
          if (!o || typeof o !== 'object') return ''
          if (typeof o.access_token === 'string' && o.access_token.length > 20) return o.access_token
          for (const v of Object.values(o)) {
            const t = walk(v)
            if (t) return t
          }
          return ''
        }
        for (const k of Object.keys(localStorage)) {
          const raw = localStorage.getItem(k) || ''
          if (!raw.includes('access_token')) continue
          try {
            accessToken = walk(JSON.parse(raw))
            if (accessToken) break
          } catch {
            /* ignore */
          }
        }
        if (!accessToken) {
          return { ok: false, reason: 'NO_BROWSER_SESSION_TOKEN' }
        }
        const body = {
          societa_id: societaId,
          request_id: requestId,
          contract_kind: 'fattura_passiva',
          source_module: 'registrazione_manual',
          header: {
            data_registrazione: '2026-04-11',
            data_documento: '2026-04-11',
            numero_documento: docNum,
            descrizione: '[SG-E2E] P1-06 Consultazione read-only seed',
          },
          rows: [
            { conto_id: cCosto, dare: 1000, avere: 0 },
            { conto_id: cIva, dare: 220, avere: 0 },
            { conto_id: cForn, dare: 0, avere: 1220 },
          ],
          vat: {
            rows: [
              {
                tipo: 'acquisto',
                imponibile: 1000,
                iva: 220,
                aliquota: 22,
                esigibilita: 'immediata',
                split_payment: false,
                documento_id: docNum,
                riga_idx: 0,
              },
            ],
          },
          ledger: {
            mode: 'open',
            openings: [
              {
                tipo: 'fornitore',
                conto_id: cForn,
                numero_documento: docNum,
                data_documento: '2026-04-11',
                importo_originale: 1220,
              },
            ],
            closures: [],
          },
          withholding: { eventType: 'none', inserts: [], updates: [] },
          motivazione: 'SG-E2E P1-06 consultazione seed',
        }
        const res = await fetch('/api/studio/fiscal-journal-post', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({}))
        return {
          ok: res.ok,
          status: res.status,
          id: json?.id || json?.prima_nota_id || null,
          error: json?.error || json?.message || null,
        }
      },
      {
        societaId: SOCIETA_A,
        requestId,
        docNum,
        cCosto: CONTO_COSTO,
        cIva: CONTO_IVA,
        cForn: CONTO_FORN,
      },
    )
    log(`SEED_DOC=${docNum}`)
    log(`SEED_STATUS=${postResult.status}`)
    log(`SEED_OK=${postResult.ok}`)
    log(`SEED_PN_ID=${postResult.id || ''}`)
    if (postResult.error) log(`SEED_ERROR=${postResult.error}`)
    if (!postResult.ok || !postResult.id) throw new Error('SEED_FISCAL_POST_FAILED')

    const pnDb = psql(`
SELECT coalesce(numero_documento,'')||'|'||coalesce(totale_dare::text,'')||'|'||coalesce(totale_avere::text,'')||'|'||coalesce(updated_at::text,'')
FROM public.prima_nota
WHERE id='${postResult.id}'::uuid AND societa_id='${SOCIETA_A}'::uuid
`)
    log(`SEED_PN_DB=${pnDb}`)
    if (!pnDb.startsWith(docNum + '|')) throw new Error('SEED_PN_DB_MISMATCH')
    const seedUpdatedAt = pnDb.split('|')[3] || ''

    await new Promise((r) => setTimeout(r, 500))
    markPhase('consultazione')

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
      return clickText(/^CONTABILIT/i, 40) || clickText(/CONTABILIT/i, 40)
    })
    log(`NAV_SECTION=${navSection || ''}`)
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
    await new Promise((r) => setTimeout(r, 1200))

    const navConsult = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('button, a, [role="button"], .sb-item, .sb-child, .cont-tab, [role="tab"]')]
      const hit = nodes.find((el) => {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
        return /^Consultazione$/i.test(t)
      })
      if (!hit) {
        return {
          ok: false,
          labels: nodes
            .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
            .filter((t) => t && t.length < 40)
            .slice(0, 60),
        }
      }
      hit.click()
      return { ok: true, label: (hit.textContent || '').replace(/\s+/g, ' ').trim() }
    })
    log(`NAV_CONSULT=${JSON.stringify(navConsult)}`)
    if (!navConsult.ok) throw new Error('NAV_CONSULTAZIONE_FAILED')

    await page.waitForFunction(
      () => /Numero documento/i.test(document.body.innerText) && /Consultazione/i.test(document.body.innerText),
      { timeout: 30000 },
    )
    log('CONSULT_UI=PASS')

    // Vite DEV defaults Consultazione to local demo rows; switch to persisted dataset.
    const demoToggle = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')]
      const hit = btns.find((b) => /Demo attiva/i.test((b.textContent || '').trim()))
      if (!hit) {
        const labels = btns.map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40)
        return { ok: false, labels }
      }
      hit.click()
      return { ok: true, after: 'Mostra demo' }
    })
    log(`DEMO_OFF=${JSON.stringify(demoToggle)}`)
    if (!demoToggle.ok) throw new Error('DEMO_TOGGLE_MISSING')
    await new Promise((r) => setTimeout(r, 800))

    async function fillNumeroDocumento(value) {
      const handle = await page.evaluateHandle(() => {
        const labels = [...document.querySelectorAll('label')]
        const lab = labels.find((l) => /Numero documento/i.test(l.textContent || ''))
        if (lab) {
          const wrap = lab.closest('.fg') || lab.parentElement
          const input = wrap?.querySelector('input')
          if (input) return input
        }
        return (
          [...document.querySelectorAll('input')].find((el) => {
            const p = el.closest('.fg')
            return p && /Numero documento/i.test(p.textContent || '')
          }) || null
        )
      })
      const el = handle.asElement()
      if (!el) throw new Error('FILTER_INPUT_MISSING')
      await el.click({ clickCount: 3 })
      await page.keyboard.press('Backspace')
      await el.type(value, { delay: 20 })
      await page.evaluate(() => {
        const cerca = [...document.querySelectorAll('button')].find((b) => /^Cerca$/i.test((b.textContent || '').trim()))
        if (cerca) cerca.click()
      })
      await new Promise((r) => setTimeout(r, 500))
    }

    const societaUi = await page.evaluate(() => {
      const sel = document.querySelector('.cont-sidebar-societa select') || document.querySelector('aside select')
      if (!sel) return { ok: false }
      return {
        ok: true,
        value: sel.value,
        label: sel.options?.[sel.selectedIndex]?.text || '',
        options: [...(sel.options || [])].map((o) => ({ value: o.value, label: o.text })).slice(0, 8),
      }
    })
    log(`SOCIETA_UI=${JSON.stringify(societaUi)}`)
    if (societaUi.ok && societaUi.value && societaUi.value !== SOCIETA_A) {
      await page.evaluate((id) => {
        const sel = document.querySelector('.cont-sidebar-societa select') || document.querySelector('aside select')
        if (!sel) return
        sel.value = id
        sel.dispatchEvent(new Event('change', { bubbles: true }))
      }, SOCIETA_A)
      await new Promise((r) => setTimeout(r, 800))
      log('SOCIETA_UI_FORCED=PASS')
    }

    await fillNumeroDocumento(docNum)
    log('FILTER_HIT_SET=PASS')
    await new Promise((r) => setTimeout(r, 1500))

    const filterDiag = await page.evaluate((doc) => {
      const labels = [...document.querySelectorAll('label')]
      const lab = labels.find((l) => /Numero documento/i.test(l.textContent || ''))
      const input = (lab?.closest('.fg') || lab?.parentElement)?.querySelector('input')
      return {
        inputValue: input?.value || '',
        hasDoc: document.body.innerText.includes(doc),
        hasEmpty: /Nessun movimento trovato/i.test(document.body.innerText),
        hasError: /error|Error|failed|Failed/i.test(document.body.innerText.slice(0, 2000)),
        loading: /Caricamento consultazione/i.test(document.body.innerText),
        snippet: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 900),
      }
    }, docNum)
    log(`FILTER_DIAG=${JSON.stringify(filterDiag)}`)

    // Direct REST probe with browser session (same JWT Consultazione uses)
    const restProbe = await page.evaluate(async ({ societaId, doc }) => {
      let accessToken = ''
      const walk = (o) => {
        if (!o || typeof o !== 'object') return ''
        if (typeof o.access_token === 'string' && o.access_token.length > 20) return o.access_token
        for (const v of Object.values(o)) {
          const t = walk(v)
          if (t) return t
        }
        return ''
      }
      for (const k of Object.keys(localStorage)) {
        const raw = localStorage.getItem(k) || ''
        if (!raw.includes('access_token')) continue
        try {
          accessToken = walk(JSON.parse(raw))
          if (accessToken) break
        } catch {
          /* ignore */
        }
      }
      const url =
        `http://127.0.0.1:55321/rest/v1/prima_nota_righe?select=id,prima_nota!inner(id,numero_documento,societa_id,stato)` +
        `&prima_nota.societa_id=eq.${societaId}` +
        `&prima_nota.numero_documento=ilike.*${encodeURIComponent(doc)}*` +
        `&prima_nota.stato=in.(confermata,definitiva)&limit=5`
      const res = await fetch(url, {
        headers: {
          apikey: accessToken,
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'count=exact',
        },
      })
      const text = await res.text()
      return { status: res.status, body: text.slice(0, 500) }
    }, { societaId: SOCIETA_A, doc: docNum })
    log(`REST_PROBE=${JSON.stringify(restProbe)}`)

    await page.waitForFunction(
      (doc) => document.body.innerText.includes(doc) && !/Caricamento consultazione/i.test(document.body.innerText),
      { timeout: 45000 },
      docNum,
    )
    const hitVisible = await page.evaluate((doc) => document.body.innerText.includes(doc), docNum)
    log(`FILTER_HIT_VISIBLE=${hitVisible}`)
    if (!hitVisible) throw new Error('FILTER_HIT_NOT_VISIBLE')


    await page.evaluate((doc) => {
      const cells = [...document.querySelectorAll('td, tr, [role="row"]')]
      const hit = cells.find((el) => (el.textContent || '').includes(doc))
      if (hit) hit.click()
    }, docNum)
    await new Promise((r) => setTimeout(r, 1200))

    const detail = await page.evaluate(() => {
      const text = document.body.innerText
      const modificaBtns = [...document.querySelectorAll('button')].filter((b) => /^Modifica$/i.test((b.textContent || '').trim()))
      return {
        hasReadOnlyBanner: /Consultazione read-only/i.test(text),
        hasReadOnlyMsg: /modifica, storno, eliminazione/i.test(text) || /Modifica\/storno non disponibili/i.test(text),
        modificaCount: modificaBtns.length,
        modificaDisabled: modificaBtns.length === 0 || modificaBtns.every((b) => b.disabled),
        hasStornoAction: [...document.querySelectorAll('button')].some((b) => /^Storna|^Elimina|^Commit/i.test((b.textContent || '').trim()) && !b.disabled),
        docInSidebar: /N° documento/i.test(text),
      }
    })
    log(`DETAIL=${JSON.stringify(detail)}`)
    if (!detail.hasReadOnlyBanner && !detail.hasReadOnlyMsg) throw new Error('READONLY_MSG_MISSING')
    if (!detail.modificaDisabled) throw new Error('MODIFICA_ENABLED')
    if (detail.hasStornoAction) throw new Error('MUTATE_ACTION_ENABLED')

    await fillNumeroDocumento('NO-SUCH-DOC-P106-XXXX')
    await page.waitForFunction(
      () => /Nessun movimento trovato/i.test(document.body.innerText),
      { timeout: 45000 },
    )
    const missEmpty = await page.evaluate(() => /Nessun movimento trovato/i.test(document.body.innerText))
    log(`FILTER_MISS_EMPTY=${missEmpty}`)
    if (!missEmpty) throw new Error('FILTER_MISS_NOT_EMPTY')

    const consultWrites = writeHits.filter((h) => h.phase === 'consultazione')
    const fiscalDuringConsult = consultWrites.filter((h) => h.url.includes('/api/studio/fiscal-journal-post'))
    // Preferential reads via PostgREST use GET; reject write verbs on rest/rpc/fiscal during consult.
    const mutatingRest = consultWrites.filter((h) => {
      const u = h.url
      if (u.includes('/api/studio/fiscal-journal-post')) return true
      if (!/\/rest\/v1\//i.test(u) && !/\/rpc\//i.test(u) && !/\/api\//i.test(u)) return false
      return h.method === 'POST' || h.method === 'PATCH' || h.method === 'PUT' || h.method === 'DELETE'
    })
    log(`CONSULT_WRITE_COUNT=${consultWrites.length}`)
    log(`CONSULT_FISCAL_POST_COUNT=${fiscalDuringConsult.length}`)
    log(`CONSULT_MUTATING_API_COUNT=${mutatingRest.length}`)
    if (mutatingRest.length) {
      log(`CONSULT_MUTATING_SAMPLE=${JSON.stringify(mutatingRest.slice(0, 5))}`)
      throw new Error('CONSULT_HAD_MUTATING_HTTP')
    }

    const pnAfter = psql(`
SELECT coalesce(numero_documento,'')||'|'||coalesce(totale_dare::text,'')||'|'||coalesce(totale_avere::text,'')||'|'||coalesce(updated_at::text,'')
FROM public.prima_nota
WHERE id='${postResult.id}'::uuid AND societa_id='${SOCIETA_A}'::uuid
`)
    log(`PN_AFTER=${pnAfter}`)
    const afterUpdatedAt = pnAfter.split('|')[3] || ''
    if (afterUpdatedAt !== seedUpdatedAt) throw new Error('PN_UPDATED_AT_CHANGED')
    const afterParts = pnAfter.split('|')
    if (afterParts[0] !== docNum) throw new Error('PN_DOC_CHANGED')
    if (Number(afterParts[1]) !== 1220 || Number(afterParts[2]) !== 1220) throw new Error('PN_TOTALS_CHANGED')

    log(`FISCAL_HTTP_ALL=${JSON.stringify(fiscalPosts)}`)
    log('P1_06_RESULT=PASS')
  } finally {
    await browser.close().catch(() => null)
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
  }
}

main().catch((err) => {
  console.error(err)
  try {
    lines.push(`P1_06_RESULT=FAIL ${err?.message || err}`)
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
  } catch {
    /* ignore */
  }
  process.exit(1)
})
