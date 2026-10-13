/**
 * Map + close automatable slices of FISCOSIM_MANUAL_TEST_DEBT on LAB.
 * - Import #9 PN/IVA/partitario coherence (DB)
 * - Import #10 anti-doppio (claim request_id uniqueness / replay)
 * - Import #2 ZIP upload browser (Puppeteer)
 * - Inventory L4 Manuale/Consultazione/IVA/Bank evidence already on disk
 * LAB-only. Never prints secrets.
 */
import puppeteer from 'puppeteer'
import AdmZip from 'adm-zip'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const UI = 'http://127.0.0.1:5173'
const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const EMAIL = 'sg-e2e-a@example.invalid'
const PASSWORD = 'SgE2eLabBrowser!20261011'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const FIXTURE_XML = resolve(process.cwd(), 'qa/fixtures/IT01378570350.xml')
const REPORT_DIR = join(process.cwd(), 'REPORT')
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(REPORT_DIR, `STAGE3W_MANUAL_DEBT_LAB_GATE_${stamp}.txt`)

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

function latestEvidence(prefix) {
  const files = existsSync(REPORT_DIR)
    ? readdirSync(REPORT_DIR).filter((f) => f.startsWith(prefix) && f.endsWith('.txt')).sort()
    : []
  return files.at(-1) || null
}

function evidenceHas(file, needle) {
  if (!file) return false
  try {
    return readFileSync(join(REPORT_DIR, file), 'utf8').includes(needle)
  } catch {
    return false
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function zipUploadSmoke(zipPath) {
  ensurePassword()
  const userDataDir = mkdtempSync(join(tmpdir(), 'fiscosim-debt-zip-'))
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(60000)
  try {
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
    await page.evaluate(() => {
      const clickText = (re, maxLen = 64) => {
        const nodes = [...document.querySelectorAll('button, a, [role="button"], .sb-item, .sb-parent, .sb-child')]
        const hit = nodes.find((el) => {
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
          return re.test(t) && t.length <= maxLen
        })
        if (hit) hit.click()
      }
      clickText(/DOCUMENT HUB|Document Hub/i, 40)
      clickText(/^Import Contabilit/i, 40) || clickText(/Import Contabilit/i, 48)
    })
    await sleep(1500)
    await page.evaluate((id) => {
      const sels = [...document.querySelectorAll('select')]
      const sel = sels.find((s) => [...s.options].some((o) => o.value === id)) || sels[0]
      if (!sel) return
      sel.value = id
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    }, SOCIETA_A)
    await sleep(600)
    const input = await page.$('input[type="file"]')
    if (!input) throw new Error('FILE_INPUT_MISSING')
    await input.uploadFile(zipPath)
    await page.waitForFunction(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      return /IT01378570350|Fornitore QA Sprint|Avvia contabilizzazione/i.test(t)
        || document.querySelectorAll('table tbody tr').length > 0
    }, { timeout: 90000 }).catch(() => null)
    await sleep(1200)
    const staging = await page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ')
      return {
        rows: document.querySelectorAll('table tbody tr').length,
        hasFixture: /IT01378570350|Fornitore QA Sprint/i.test(t),
        hasAvvia: /Avvia contabilizzazione/i.test(t),
      }
    })
    if (staging.rows < 1 && !staging.hasFixture) throw new Error('ZIP_STAGING_EMPTY')
    return staging
  } finally {
    await browser.close().catch(() => null)
  }
}

async function main() {
  log('MANUAL_DEBT_LAB_GATE_START')
  log(`SOCIETA=${SOCIETA_A}`)

  // --- Import #9 coherence ---
  const coerenza = psql(`
SELECT pn.id::text||'|'||pn.numero_documento||'|'||
  (SELECT count(*)::text FROM public.prima_nota_righe r WHERE r.prima_nota_id=pn.id)||'|'||
  (SELECT count(*)::text FROM public.registri_iva v WHERE v.prima_nota_id=pn.id)||'|'||
  (SELECT count(*)::text FROM public.partitario p WHERE p.prima_nota_id=pn.id)||'|'||
  coalesce((SELECT round(sum(coalesce(r.importo_dare,0))::numeric,2)::text FROM public.prima_nota_righe r WHERE r.prima_nota_id=pn.id),'0')||'|'||
  coalesce((SELECT round(sum(coalesce(r.importo_avere,0))::numeric,2)::text FROM public.prima_nota_righe r WHERE r.prima_nota_id=pn.id),'0')
FROM public.prima_nota pn
WHERE pn.societa_id='${SOCIETA_A}'::uuid
  AND pn.numero_documento='QA-2026-001'
ORDER BY pn.created_at DESC NULLS LAST
LIMIT 1
`)
  log(`IMPORT_09_COERENZA=${coerenza || 'EMPTY'}`)
  const parts = String(coerenza || '').split('|')
  if (parts.length < 7) throw new Error('IMPORT_09_PN_MISSING')
  const [, doc, righe, iva, partite, dare, avere] = parts
  if (doc !== 'QA-2026-001') throw new Error('IMPORT_09_DOC_MISMATCH')
  if (Number(righe) < 3) throw new Error('IMPORT_09_RIGHE')
  if (Number(iva) < 1) throw new Error('IMPORT_09_IVA')
  if (Number(partite) < 1) throw new Error('IMPORT_09_PARTITE')
  if (Number(dare) !== Number(avere)) throw new Error(`IMPORT_09_UNBALANCED ${dare}!=${avere}`)
  log('IMPORT_09_RESULT=PASS')

  // --- Import #10 anti-doppio (claim uniqueness / same request_id → one PN) ---
  const claim = psql(`
SELECT request_id::text||'|'||prima_nota_id::text||'|'||count(*) OVER (PARTITION BY request_id)
FROM public.fiscosim_fiscal_journal_claim
WHERE societa_id='${SOCIETA_A}'::uuid
  AND prima_nota_id='${parts[0]}'::uuid
LIMIT 1
`)
  log(`IMPORT_10_CLAIM=${claim || 'EMPTY'}`)
  if (!claim) throw new Error('IMPORT_10_CLAIM_MISSING')
  const [, , claimCnt] = claim.split('|')
  if (Number(claimCnt) !== 1) throw new Error('IMPORT_10_CLAIM_DUP')
  // Unique PK (societa_id, request_id) exists
  const pk = psql(`
SELECT count(*)::text FROM pg_constraint
WHERE conrelid='public.fiscosim_fiscal_journal_claim'::regclass
  AND contype='p'
`)
  log(`IMPORT_10_CLAIM_PK=${pk}`)
  if (pk !== '1') throw new Error('IMPORT_10_PK_MISSING')
  log('IMPORT_10_RESULT=PASS')

  // --- Import #2 ZIP upload ---
  if (!existsSync(FIXTURE_XML)) throw new Error('FIXTURE_XML_MISSING')
  const zipDir = mkdtempSync(join(tmpdir(), 'fiscosim-debt-zipfile-'))
  const zipPath = join(zipDir, 'IT01378570350.zip')
  const zip = new AdmZip()
  zip.addLocalFile(FIXTURE_XML)
  zip.writeZip(zipPath)
  log(`ZIP_FIXTURE=${zipPath}`)
  const zipStaging = await zipUploadSmoke(zipPath)
  log(`IMPORT_02_ZIP_STAGING=${JSON.stringify(zipStaging)}`)
  log('IMPORT_02_RESULT=PASS')

  // --- Evidence inventory for other modules ---
  const inventory = [
    { debt: 'Manuale#browser', prefix: 'STAGE3W_L4_BROWSER_MANUALE_', needles: ['L4_RESULT=PASS', 'L4_MANUALE_RESULT=PASS'] },
    { debt: 'Consultazione#browser', prefix: 'STAGE3W_L4_BROWSER_CONSULTAZIONE_', needles: ['P1_06_RESULT=PASS', 'L4_CONSULTAZIONE_RESULT=PASS'] },
    { debt: 'IVA#browser', prefix: 'STAGE3W_L4_BROWSER_IVA_', needles: ['L4_IVA_RESULT=PASS'] },
    { debt: 'Bank#browser', prefix: 'STAGE3W_L4_BROWSER_BANK_', needles: ['L4_BANK_RESULT=PASS'] },
    { debt: 'Import#upload', prefix: 'STAGE3W_L4_BROWSER_IMPORT_UPLOAD_', needles: ['L4_IMPORT_UPLOAD_RESULT=PASS'] },
    { debt: 'Import#fp22', prefix: 'STAGE3W_IMPORT_FP22_', needles: ['P1_01_RESULT=PASS'] },
    { debt: 'Import#cronologia', prefix: 'STAGE3W_IMPORT_CRONOLOGIA_HASH_', needles: ['P3_02_RESULT=PASS', 'HISTORY_API=PASS'] },
  ]
  let invPass = 0
  for (const item of inventory) {
    const file = latestEvidence(item.prefix)
    const ok = !!file && item.needles.some((n) => evidenceHas(file, n))
    log(`INVENTORY ${item.debt} evidence=${file || '-'} pass=${ok}`)
    if (ok) invPass += 1
  }
  log(`INVENTORY_PASS_COUNT=${invPass}/${inventory.length}`)

  log('MANUAL_DEBT_LAB_GATE_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`MANUAL_DEBT_LAB_GATE_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('MANUAL_DEBT_LAB_GATE_RESULT=FAIL'))) process.exit(1)
  })
