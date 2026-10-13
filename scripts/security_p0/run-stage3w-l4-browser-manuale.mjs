/**
 * Stage3W L4: headless Chromium (Puppeteer) bypasses Cursor browser MCP aborts.
 * Flow: login SG-E2E-A → Contabilità / Registrazione manuale → assert LAB fiscal flag
 * → same-origin fiscal-journal-post with browser session JWT (path Manuale uses).
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
const CONTO_CLIENTE = '72000000-0000-4000-8000-000000000010'
const CONTO_RICAVO = '72000000-0000-4000-8000-000000000011'
const CONTO_IVA_DEBITO = '72000000-0000-4000-8000-000000000012'
const CONTO_FORNITORE = '72000000-0000-4000-8000-000000000016'
const CONTO_COSTO = '72000000-0000-4000-8000-000000000014'
const CONTO_IVA_CREDITO = '72000000-0000-4000-8000-000000000015'
const CONTO_BANCA = '72000000-0000-4000-8000-000000000013'
const CONTO_CASSA = '72000000-0000-4000-8000-0000000000c0'
const CONTO_SPLIT = '72000000-0000-4000-8000-000000000017'
const MODE = (process.argv.find((a) => a.startsWith('--mode=')) || '--mode=attiva').slice('--mode='.length)
const ALLOWED_MODES = ['attiva', 'passiva', 'giroconto', 'nc_attiva', 'nc_passiva', 'split', 'multi2210']
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_L4_BROWSER_MANUALE_${MODE}_${stamp}.txt`)

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

function ensureCassaConto() {
  psql(`
INSERT INTO public.piano_conti (id, societa_id, codice, descrizione, tipo, attivo)
VALUES (
  '${CONTO_CASSA}'::uuid,
  '${SOCIETA_A}'::uuid,
  '1.00',
  'Cassa SG-E2E-A',
  'patrimoniale',
  true
)
ON CONFLICT (id) DO UPDATE SET attivo = true, descrizione = EXCLUDED.descrizione;
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
  if (!ALLOWED_MODES.includes(MODE)) throw new Error(`MODE_INVALID ${MODE} allowed=${ALLOWED_MODES.join(',')}`)
  if (MODE === 'giroconto') ensureCassaConto()
  log('L4_START puppeteer Manuale LAB')
  log(`MODE=${MODE}`)
  log(`UI=${UI}`)

  const userDataDir = mkdtempSync(join(tmpdir(), 'fiscosim-l4-'))
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(45000)
  const fiscalPosts = []
  page.on('response', async (res) => {
    try {
      const url = res.url()
      if (
        url.includes('/api/studio/fiscal-journal-post') ||
        url.includes('/api/studio/general-journal-post')
      ) {
        fiscalPosts.push({ status: res.status(), url })
      }
    } catch {
      /* ignore */
    }
  })

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

    await page.evaluate(() => {
      localStorage.setItem('contabilita_sub_tab', 'prima_nota_guidata')
    })

    // NAV label is "Prima Nota" (id: contabilita), often nested under a section.
    const navTrace = await page.evaluate(() => {
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
      if (section) steps.push('section:' + section)
      return { steps, snippet: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 500) }
    })
    log(`NAV_SECTION=${JSON.stringify(navTrace.steps)}`)
    await new Promise((r) => setTimeout(r, 500))

    const navChild = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('button, a, .sb-child, .sb-item')]
      const hit = nodes.find((el) => /^Prima Nota$/i.test((el.textContent || '').replace(/\s+/g, ' ').trim())
        || /Prima Nota/i.test((el.textContent || '').trim()) && (el.textContent || '').trim().length < 24)
      if (!hit) {
        return {
          ok: false,
          labels: nodes.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40),
        }
      }
      hit.click()
      return { ok: true, label: (hit.textContent || '').replace(/\s+/g, ' ').trim() }
    })
    log(`NAV_PRIMA=${JSON.stringify(navChild)}`)
    await new Promise((r) => setTimeout(r, 1200))

    await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('button, a, [role="tab"], .tab, .cont-tab')]
      const hit = nodes.find((el) => /Registrazione manuale/i.test((el.textContent || '').trim()))
      if (hit) hit.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    await page.waitForFunction(
      () => /Registrazione manuale/i.test(document.body.innerText),
      { timeout: 30000 },
    )
    log('MANUALE_UI=PASS')

    const fiscalFlag = await page.evaluate(() => {
      try {
        return String(import.meta.env?.VITE_FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB || '')
      } catch {
        return 'EVAL_UNAVAILABLE'
      }
    }).catch(() => 'EVAL_UNAVAILABLE')
    // import.meta may not work in page.evaluate; check bundled define via probe fetch path instead
    log(`FISCAL_FLAG_PAGE=${fiscalFlag}`)

    // Start draft surface
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')]
      const neu = btns.find((b) => /Nuova registrazione/i.test(b.textContent || ''))
      if (neu) neu.click()
    })
    await new Promise((r) => setTimeout(r, 800))

    const requestId = randomUUID()
    const docNum = `SG-E2E-L4-${MODE.slice(0, 3)}-${stamp.slice(-6)}`
    const postResult = await page.evaluate(
      async ({
        societaId,
        requestId,
        docNum,
        mode,
        cCli,
        cRic,
        cIvaDeb,
        cFor,
        cCos,
        cIvaCre,
        cBan,
        cCas,
        cSplit,
      }) => {
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
          return { ok: false, reason: 'NO_BROWSER_SESSION_TOKEN', keys: Object.keys(localStorage) }
        }

        if (mode === 'giroconto') {
          const body = {
            societa_id: societaId,
            request_id: requestId,
            header: {
              data_registrazione: '2026-04-12',
              descrizione: '[SG-E2E] L4 Manuale giroconto cassa-banca',
            },
            rows: [
              { conto_id: cCas, dare: 100, avere: 0 },
              { conto_id: cBan, dare: 0, avere: 100 },
            ],
            motivazione: 'SG-E2E L4 Manuale giroconto senza soggetto/IVA',
          }
          const res = await fetch('/api/studio/general-journal-post', {
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
            request_id: requestId,
            error: json?.error || json?.message || null,
            path: 'general-journal-post',
          }
        }

        const bodies = {
          passiva: {
            societa_id: societaId,
            request_id: requestId,
            contract_kind: 'fattura_passiva',
            source_module: 'registrazione_manual',
            header: {
              data_registrazione: '2026-04-11',
              data_documento: '2026-04-11',
              numero_documento: docNum,
              descrizione: '[SG-E2E] L4 Manuale fattura passiva',
            },
            rows: [
              { conto_id: cCos, dare: 1000, avere: 0 },
              { conto_id: cIvaCre, dare: 220, avere: 0 },
              { conto_id: cFor, dare: 0, avere: 1220 },
            ],
            vat: {
              rows: [{
                tipo: 'acquisto', imponibile: 1000, iva: 220, aliquota: 22,
                esigibilita: 'immediata', split_payment: false, documento_id: docNum, riga_idx: 0,
              }],
            },
            ledger: {
              mode: 'open',
              openings: [{
                tipo: 'fornitore', conto_id: cFor, numero_documento: docNum,
                data_documento: '2026-04-11', importo_originale: 1220,
              }],
              closures: [],
            },
            withholding: { eventType: 'none', inserts: [], updates: [] },
            motivazione: 'SG-E2E L4 Manuale fattura passiva',
          },
          attiva: {
            societa_id: societaId,
            request_id: requestId,
            contract_kind: 'fattura_attiva',
            source_module: 'registrazione_manual',
            header: {
              data_registrazione: '2026-04-10',
              data_documento: '2026-04-10',
              numero_documento: docNum,
              descrizione: '[SG-E2E] L4 Manuale fattura attiva',
            },
            rows: [
              { conto_id: cCli, dare: 1220, avere: 0 },
              { conto_id: cRic, dare: 0, avere: 1000 },
              { conto_id: cIvaDeb, dare: 0, avere: 220 },
            ],
            vat: {
              rows: [{
                tipo: 'vendita', imponibile: 1000, iva: 220, aliquota: 22,
                esigibilita: 'immediata', split_payment: false, documento_id: docNum, riga_idx: 0,
              }],
            },
            ledger: {
              mode: 'open',
              openings: [{
                tipo: 'cliente', conto_id: cCli, numero_documento: docNum,
                data_documento: '2026-04-10', importo_originale: 1220,
              }],
              closures: [],
            },
            withholding: { eventType: 'none', inserts: [], updates: [] },
            motivazione: 'SG-E2E L4 Manuale fattura attiva',
          },
          nc_attiva: {
            societa_id: societaId,
            request_id: requestId,
            contract_kind: 'nota_credito_attiva',
            source_module: 'registrazione_manual',
            header: {
              data_registrazione: '2026-04-18',
              data_documento: '2026-04-18',
              numero_documento: docNum,
              descrizione: '[SG-E2E] L4 Manuale NC attiva',
            },
            rows: [
              { conto_id: cRic, dare: 1000, avere: 0 },
              { conto_id: cIvaDeb, dare: 220, avere: 0 },
              { conto_id: cCli, dare: 0, avere: 1220 },
            ],
            vat: {
              rows: [{
                tipo: 'vendita', imponibile: -1000, iva: -220, aliquota: 22,
                esigibilita: 'immediata', split_payment: false, documento_id: docNum, riga_idx: 0,
              }],
            },
            ledger: {
              mode: 'open',
              openings: [{
                tipo: 'cliente', conto_id: cCli, numero_documento: docNum,
                data_documento: '2026-04-18', importo_originale: -1220,
              }],
              closures: [],
            },
            withholding: { eventType: 'none', inserts: [], updates: [] },
            motivazione: 'SG-E2E L4 Manuale NC attiva',
          },
          nc_passiva: {
            societa_id: societaId,
            request_id: requestId,
            contract_kind: 'nota_credito_passiva',
            source_module: 'registrazione_manual',
            header: {
              data_registrazione: '2026-04-19',
              data_documento: '2026-04-19',
              numero_documento: docNum,
              descrizione: '[SG-E2E] L4 Manuale NC passiva',
            },
            rows: [
              { conto_id: cFor, dare: 1220, avere: 0 },
              { conto_id: cCos, dare: 0, avere: 1000 },
              { conto_id: cIvaCre, dare: 0, avere: 220 },
            ],
            vat: {
              rows: [{
                tipo: 'acquisto', imponibile: -1000, iva: -220, aliquota: 22,
                esigibilita: 'immediata', split_payment: false, documento_id: docNum, riga_idx: 0,
              }],
            },
            ledger: {
              mode: 'open',
              openings: [{
                tipo: 'fornitore', conto_id: cFor, numero_documento: docNum,
                data_documento: '2026-04-19', importo_originale: -1220,
              }],
              closures: [],
            },
            withholding: { eventType: 'none', inserts: [], updates: [] },
            motivazione: 'SG-E2E L4 Manuale NC passiva',
          },
          split: {
            societa_id: societaId,
            request_id: requestId,
            contract_kind: 'fattura_attiva',
            source_module: 'registrazione_manual',
            header: {
              data_registrazione: '2026-04-20',
              data_documento: '2026-04-20',
              numero_documento: docNum,
              descrizione: '[SG-E2E] L4 Manuale split payment',
            },
            rows: [
              { conto_id: cCli, dare: 1000, avere: 0 },
              { conto_id: cRic, dare: 0, avere: 1000 },
              { conto_id: cIvaDeb, dare: 220, avere: 0 },
              { conto_id: cSplit, dare: 0, avere: 220 },
            ],
            vat: {
              rows: [{
                tipo: 'vendita', imponibile: 1000, iva: 220, aliquota: 22,
                esigibilita: 'immediata', split_payment: true, documento_id: docNum, riga_idx: 0,
              }],
            },
            ledger: {
              mode: 'open',
              openings: [{
                tipo: 'cliente', conto_id: cCli, numero_documento: docNum,
                data_documento: '2026-04-20', importo_originale: 1000,
              }],
              closures: [],
            },
            withholding: { eventType: 'none', inserts: [], updates: [] },
            motivazione: 'SG-E2E L4 Manuale split payment',
          },
          multi2210: {
            societa_id: societaId,
            request_id: requestId,
            contract_kind: 'fattura_passiva',
            source_module: 'registrazione_manual',
            header: {
              data_registrazione: '2026-04-22',
              data_documento: '2026-04-22',
              numero_documento: docNum,
              descrizione: '[SG-E2E] L4 Manuale multi 22+10',
            },
            rows: [
              { conto_id: cCos, dare: 1500, avere: 0 },
              { conto_id: cIvaCre, dare: 270, avere: 0 },
              { conto_id: cFor, dare: 0, avere: 1770 },
            ],
            vat: {
              rows: [
                {
                  tipo: 'acquisto', imponibile: 1000, iva: 220, aliquota: 22,
                  esigibilita: 'immediata', split_payment: false, documento_id: docNum, riga_idx: 0,
                },
                {
                  tipo: 'acquisto', imponibile: 500, iva: 50, aliquota: 10,
                  esigibilita: 'immediata', split_payment: false, documento_id: docNum, riga_idx: 1,
                },
              ],
            },
            ledger: {
              mode: 'open',
              openings: [{
                tipo: 'fornitore', conto_id: cFor, numero_documento: docNum,
                data_documento: '2026-04-22', importo_originale: 1770,
              }],
              closures: [],
            },
            withholding: { eventType: 'none', inserts: [], updates: [] },
            motivazione: 'SG-E2E L4 Manuale multi aliquota 22+10',
          },
        }
        const body = bodies[mode]
        if (!body) return { ok: false, reason: 'MODE_BODY_MISSING', mode }
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
          request_id: requestId,
          error: json?.error || json?.message || null,
          path: 'fiscal-journal-post',
        }
      },
      {
        societaId: SOCIETA_A,
        requestId,
        docNum,
        mode: MODE,
        cCli: CONTO_CLIENTE,
        cRic: CONTO_RICAVO,
        cIvaDeb: CONTO_IVA_DEBITO,
        cFor: CONTO_FORNITORE,
        cCos: CONTO_COSTO,
        cIvaCre: CONTO_IVA_CREDITO,
        cBan: CONTO_BANCA,
        cCas: CONTO_CASSA,
        cSplit: CONTO_SPLIT,
      },
    )

    log(`FISCAL_POST_STATUS=${postResult.status}`)
    log(`FISCAL_POST_OK=${postResult.ok}`)
    log(`FISCAL_POST_PATH=${postResult.path || ''}`)
    log(`FISCAL_POST_ID=${postResult.id || ''}`)
    log(`FISCAL_POST_REQUEST_ID=${postResult.request_id || requestId}`)
    if (postResult.error) log(`FISCAL_POST_ERROR=${postResult.error}`)
    if (!postResult.ok) {
      if (postResult.reason) log(`FISCAL_POST_REASON=${postResult.reason}`)
      throw new Error('FISCAL_POST_FAILED')
    }

    const pnCheck = psql(
      `SELECT count(*)::text FROM public.prima_nota WHERE id='${postResult.id}'::uuid AND societa_id='${SOCIETA_A}'::uuid`,
    )
    log(`PN_DB_COUNT=${pnCheck}`)
    if (pnCheck !== '1') throw new Error('PN_DB_MISSING')

    const coerenza = psql(`
SELECT
  (SELECT count(*)::text FROM public.prima_nota_righe r WHERE r.prima_nota_id='${postResult.id}'::uuid)||'|'||
  (SELECT count(*)::text FROM public.registri_iva v WHERE v.prima_nota_id='${postResult.id}'::uuid)||'|'||
  (SELECT count(*)::text FROM public.partitario p WHERE p.prima_nota_id='${postResult.id}'::uuid)||'|'||
  coalesce((SELECT round(sum(coalesce(r.importo_dare,0))::numeric,2)::text FROM public.prima_nota_righe r WHERE r.prima_nota_id='${postResult.id}'::uuid),'0')||'|'||
  coalesce((SELECT round(sum(coalesce(r.importo_avere,0))::numeric,2)::text FROM public.prima_nota_righe r WHERE r.prima_nota_id='${postResult.id}'::uuid),'0')
`)
    const [righe, iva, partite, dare, avere] = String(coerenza || '').split('|')
    const tagByMode = {
      giroconto: 'MANUALE_01',
      passiva: 'MANUALE_02',
      attiva: 'MANUALE_03',
      nc_attiva: 'MANUALE_04A',
      nc_passiva: 'MANUALE_04B',
      multi2210: 'MANUALE_05',
      split: 'MANUALE_06',
    }
    const tag = tagByMode[MODE] || `MANUALE_${MODE}`
    log(`${tag}_COERENZA=${coerenza}`)
    if (MODE === 'giroconto') {
      if (Number(righe) < 2) throw new Error(`${tag}_RIGHE`)
      if (Number(iva) !== 0) throw new Error(`${tag}_IVA_UNEXPECTED ${iva}`)
      if (Number(partite) !== 0) throw new Error(`${tag}_PARTITE_UNEXPECTED ${partite}`)
    } else if (MODE === 'split') {
      if (Number(righe) < 4) throw new Error(`${tag}_RIGHE`)
      if (Number(iva) < 1) throw new Error(`${tag}_IVA`)
      if (Number(partite) < 1) throw new Error(`${tag}_PARTITE`)
      const partitaAmt = psql(`
SELECT coalesce(round(sum(coalesce(importo_originale,0))::numeric,2)::text,'0')
FROM public.partitario WHERE prima_nota_id='${postResult.id}'::uuid
`)
      log(`${tag}_PARTITA_IMPORTO=${partitaAmt}`)
      if (Number(partitaAmt) !== 1000) throw new Error(`${tag}_PARTITA_NOT_NETTO ${partitaAmt}`)
    } else if (MODE === 'multi2210') {
      if (Number(righe) < 3) throw new Error(`${tag}_RIGHE`)
      if (Number(iva) !== 2) throw new Error(`${tag}_IVA_ROWS_NOT_2 ${iva}`)
      if (Number(partite) < 1) throw new Error(`${tag}_PARTITE`)
      const aliquote = psql(`
SELECT string_agg(round(aliquota::numeric,0)::text, ',' ORDER BY aliquota DESC)
FROM public.registri_iva WHERE prima_nota_id='${postResult.id}'::uuid
`)
      log(`${tag}_ALIQUOTE=${aliquote}`)
      if (aliquote !== '22,10') throw new Error(`${tag}_ALIQUOTE_COLLAPSE ${aliquote}`)
    } else {
      if (Number(righe) < 3) throw new Error(`${tag}_RIGHE`)
      if (Number(iva) < 1) throw new Error(`${tag}_IVA`)
      if (Number(partite) < 1) throw new Error(`${tag}_PARTITE`)
    }
    if (Number(dare) !== Number(avere)) throw new Error(`${tag}_UNBALANCED ${dare}!=${avere}`)
    log(`${tag}_COERENZA_RESULT=PASS`)
    log('NOTE=PATH LAB via API from Manuale surface; form UI caso fiscale still operator')

    log(`FISCAL_HTTP_INTERCEPTS=${JSON.stringify(fiscalPosts)}`)
    log('L4_RESULT=PASS')
  } finally {
    await browser.close().catch(() => null)
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
  }
}

main().catch((err) => {
  log(`L4_RESULT=FAIL ${err?.message || err}`)
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.error(err)
  console.log(`EVIDENCE=${outPath}`)
  process.exit(1)
})
