import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createPrimaNotaCompleta } from '../services/primaNotaService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const LOG_DIR = path.join(REPO_ROOT, 'fiscosim', 'qa-logs')

const DEPLOY_URL = process.env.FISCOSIM_DEPLOY_URL || 'https://fiscosim-v6.vercel.app'
const XML_PATH = process.env.FISCOSIM_TEST_XML || 'C:\\Users\\patri\\Downloads\\IT01378570350.xml'
const LEGACY_EMAIL = process.env.FISCOSIM_LEGACY_EMAIL || 'patrik.alaimo@gmail.com'
const LEGACY_PASSWORD = process.env.FISCOSIM_LEGACY_PASSWORD || 'P2678009432p.'
const NEW_EMAIL = process.env.FISCOSIM_NEW_EMAIL || 'patrik.alaimo@alice.it'
const NEW_PASSWORD = process.env.FISCOSIM_NEW_PASSWORD || 'P12345'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase env')
}

function isoNow() {
  return new Date().toISOString()
}

function tokenNow() {
  return isoNow().replace(/[:.]/g, '-')
}

function rnd(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function buildScopeMetadata({ utenteId, societaId, visibility = 'shared' }) {
  return {
    tenant_id: societaId || null,
    company_id: societaId || null,
    created_by: utenteId || null,
    owner_user_id: utenteId || null,
    visibility,
    locked_by: null,
    locked_at: null,
  }
}

function safeError(error) {
  if (!error) return null
  return {
    message: error.message || String(error),
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
    stack: error.stack || null,
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function readXmlFixture() {
  const xml = await fs.readFile(XML_PATH, 'utf8')
  const getTag = (tag) => {
    const m = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 'i'))
    return m?.[1]?.trim() || ''
  }
  const all = (tag) => [...xml.matchAll(new RegExp(`<${tag}>(.*?)</${tag}>`, 'ig'))].map((m) => m[1]?.trim() || '')
  const imponibili = all('ImponibileImporto').map(num)
  const imposte = all('Imposta').map(num)
  return {
    xml,
    filename: path.basename(XML_PATH),
    numero: getTag('Numero'),
    data: getTag('Data'),
    fornitore: getTag('Denominazione'),
    piva: getTag('IdCodice'),
    imponibile: Math.round(imponibili.reduce((a, b) => a + b, 0) * 100) / 100,
    iva: Math.round(imposte.reduce((a, b) => a + b, 0) * 100) / 100,
  }
}

async function signIn(email, password) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
  const token = data?.session?.access_token
  const authUser = data?.user
  if (!token || !authUser?.id) throw new Error(`Login failed for ${email}`)
  return { sb, token, authUser }
}

async function fetchSessionProfile(token) {
  const res = await fetch(`${DEPLOY_URL}/api/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

async function getFixtures(sb, societaId) {
  const [piano, cc, ci, docs] = await Promise.all([
    sb.from('piano_conti').select('id,societa_id,codice,descrizione,livello,is_cliente,is_fornitore,partita_iva,anagrafica_piva,attivo').eq('societa_id', societaId).eq('attivo', true).order('codice').limit(3000),
    sb.from('causali_contabili').select('id,societa_id,codice,descrizione,attivo').eq('societa_id', societaId).eq('attivo', true).order('codice').limit(2000),
    sb.from('causali_iva').select('id,societa_id,codice,descrizione,aliquota,attivo').eq('societa_id', societaId).eq('attivo', true).order('codice').limit(2000),
    sb.from('documenti_contabilita').select('id').eq('societa_id', societaId).limit(20),
  ])
  for (const res of [piano, cc, ci, docs]) {
    if (res.error) throw res.error
  }
  return {
    pianoConti: piano.data || [],
    causaliContabili: cc.data || [],
    causaliIva: ci.data || [],
    documenti: docs.data || [],
  }
}

async function runUser(label, email, password, fixture) {
  const out = {
    user: { label, email },
    startedAt: isoNow(),
    tests: [],
    created: {},
    cleanupErrors: [],
  }
  const cleanup = []
  const { sb, token, authUser } = await signIn(email, password)

  try {
    const addTest = async (id, title, fn) => {
      const entry = { id, title, startedAt: isoNow(), status: 'FAIL' }
      try {
        entry.details = await fn()
        entry.status = entry.details?.status || 'PASS'
      } catch (error) {
        entry.details = { error: safeError(error) }
        entry.status = 'FAIL'
      }
      entry.endedAt = isoNow()
      out.tests.push(entry)
      return entry
    }

    const session1 = await fetchSessionProfile(token)
    const profile = session1.body?.user || null
    const societaId = profile?.societa_default_id || profile?.societa_assegnate?.[0] || null
    const utenteId = profile?.id || authUser.id
    out.profile = {
      authUserId: authUser.id,
      utenteId,
      societaId,
      ruolo: profile?.ruolo || null,
      societaAssegnate: profile?.societa_assegnate || [],
      sessionStatus: session1.status,
    }

    await addTest(label === 'legacy' ? 'T1' : 'T2', `Login ${label}`, async () => ({
      status: session1.ok && societaId ? 'PASS' : 'FAIL',
      sessionStatus: session1.status,
      societaId,
      ruolo: profile?.ruolo || null,
      reason: !societaId ? 'missing_societa_default_id' : null,
      sessionBody: session1.body,
    }))

    if (!societaId) {
      const blockedIds = label === 'legacy' ? ['T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'] : []
      for (const id of blockedIds) {
        out.tests.push({
          id,
          title:
            id === 'T3' ? 'Refresh sessione'
            : id === 'T4' ? 'Piano dei conti (load/create/edit)'
            : id === 'T5' ? 'Causali contabili'
            : id === 'T6' ? 'Causali IVA'
            : id === 'T7' ? 'Prima nota guidata'
            : id === 'T8' ? 'Registra confermati'
            : id === 'T9' ? 'Import documento'
            : 'Assenza errori RLS in console/network',
          startedAt: isoNow(),
          endedAt: isoNow(),
          status: 'FAIL',
          details: {
            reason: 'blocked_by_missing_societa',
            dependsOn: label === 'legacy' ? 'T1 legacy login/session profile' : 'T2 new login/session profile',
          },
        })
      }
      out.endedAt = isoNow()
      return out
    }

    const scopeShared = buildScopeMetadata({ utenteId, societaId, visibility: 'shared' })
    const scopePrivate = buildScopeMetadata({ utenteId, societaId, visibility: 'private' })
    const fixtures = await getFixtures(sb, societaId)

    if (label === 'legacy') {
      await addTest('T3', 'Refresh sessione', async () => {
        const session2 = await fetchSessionProfile(token)
        return {
          status: session2.ok && session2.body?.user?.id === profile?.id ? 'PASS' : 'FAIL',
          firstStatus: session1.status,
          secondStatus: session2.status,
          sameProfile: session2.body?.user?.id === profile?.id,
        }
      })

      await addTest('T4', 'Piano dei conti (load/create/edit)', async () => {
        if (!fixtures.pianoConti.length) return { status: 'FAIL', reason: 'No piano_conti rows' }
        const existingCodes = new Set(fixtures.pianoConti.map((c) => String(c.codice || '')))
        let codice = '5 99 99'
        while (existingCodes.has(codice)) {
          codice = `5 99 ${String(Math.floor(Math.random() * 90) + 10)}`
        }
        const descrizione = rnd('QA_CONTO')
        const insertPayload = {
          societa_id: societaId,
          codice,
          codice_mastro: '5',
          codice_conto: codice,
          codice_sottoconto: null,
          descrizione,
          tipo: 'economico',
          natura: 'costo',
          sezione: 'dare',
          livello: 3,
          attivo: true,
        }
        const ins = await sb.from('piano_conti').insert([insertPayload]).select('id,societa_id,codice,descrizione').single()
        if (ins.error) throw ins.error
        out.created.pianoContoId = ins.data.id
        cleanup.push(async () => {
          await sb.from('piano_conti').update({ attivo: false }).eq('id', ins.data.id)
        })
        const nextDesc = `${descrizione}_EDIT`
        const upd = await sb.from('piano_conti').update({ descrizione: nextDesc }).eq('id', ins.data.id)
        if (upd.error) throw upd.error
        const verify = await sb.from('piano_conti').select('descrizione,societa_id').eq('id', ins.data.id).single()
        if (verify.error) throw verify.error
        return {
          status: verify.data?.descrizione === nextDesc && verify.data?.societa_id === societaId ? 'PASS' : 'FAIL',
          codice,
          contoId: ins.data.id,
        }
      })

      await addTest('T5', 'Causali contabili', async () => {
        if (!fixtures.causaliContabili.length) return { status: 'FAIL', reason: 'No causali_contabili rows' }
        const codice = rnd('QACC').slice(-10)
        const payload = {
          societa_id: societaId,
          codice,
          descrizione: rnd('QA_CAUSALE_CONT'),
          tipo: 'generico',
          attivo: true,
        }
        const ins = await sb.from('causali_contabili').insert([payload]).select('id,societa_id,codice').single()
        if (ins.error) throw ins.error
        out.created.causaleContabileId = ins.data.id
        cleanup.push(async () => {
          await sb.from('causali_contabili').update({ attivo: false }).eq('id', ins.data.id)
        })
        return {
          status: ins.data?.societa_id === societaId ? 'PASS' : 'FAIL',
          causaleId: ins.data.id,
          codice,
        }
      })

      await addTest('T6', 'Causali IVA', async () => {
        if (!fixtures.causaliIva.length) return { status: 'FAIL', reason: 'No causali_iva rows' }
        const codice = rnd('QAIVA').slice(-10)
        const payload = {
          societa_id: societaId,
          codice,
          descrizione: rnd('QA_CAUSALE_IVA'),
          aliquota: 22,
          regime_iva: 'Imponibile',
          tipo_trattamento: 'Normale',
          detraibile: true,
          percentuale_indetraibilita: 0,
          include_liquidazione: true,
          attivo: true,
        }
        const ins = await sb.from('causali_iva').insert([payload]).select('id,societa_id,codice,aliquota').single()
        if (ins.error) throw ins.error
        out.created.causaleIvaId = ins.data.id
        cleanup.push(async () => {
          await sb.from('causali_iva').update({ attivo: false }).eq('id', ins.data.id)
        })
        return {
          status: ins.data?.societa_id === societaId && Number(ins.data?.aliquota) === 22 ? 'PASS' : 'FAIL',
          causaleId: ins.data.id,
          codice,
        }
      })

      await addTest('T7', 'Prima nota guidata', async () => {
        const costo = fixtures.pianoConti.find((c) => Number(c.livello) >= 3) || fixtures.pianoConti[0]
        const controparte = fixtures.pianoConti.find((c) => c.is_fornitore && Number(c.livello) >= 3) || costo
        if (!costo?.id || !controparte?.id) return { status: 'FAIL', reason: 'No usable conti for prima_nota' }
        const totale = 122
        const payload = {
          societa_id: societaId,
          data_registrazione: fixture.data || isoNow().slice(0, 10),
          stato: 'confermato',
          descrizione: rnd('QA_PRIMA_NOTA'),
          totale_dare: totale,
          totale_avere: totale,
          ...scopeShared,
        }
        const complete = await createPrimaNotaCompleta({
          db: sb,
          pnPayload: payload,
          righePayload: [
            {
              riga_numero: 1,
              conto_id: costo.id,
              conto_codice: costo.codice,
              conto_descrizione: costo.descrizione,
              descrizione_riga: 'Costo test QA',
              importo_dare: 100,
              importo_avere: 0,
              causale_iva_id: out.created.causaleIvaId || fixtures.causaliIva[0]?.id || null,
              ...scopeShared,
            },
            {
              riga_numero: 2,
              conto_id: controparte.id,
              conto_codice: controparte.codice,
              conto_descrizione: controparte.descrizione,
              descrizione_riga: 'Controparte test QA',
              importo_dare: 0,
              importo_avere: 122,
              ...scopeShared,
            },
          ],
          partEntries: [],
          headerSelect: 'id,societa_id',
          righeSelect: 'id,prima_nota_id',
        })
        if (complete.error) throw complete.error
        const primaNotaId = complete.pn?.id
        out.created.primaNotaGuidataId = primaNotaId
        cleanup.push(async () => {
          if (primaNotaId) {
            await sb.from('prima_nota_righe').delete().eq('prima_nota_id', primaNotaId)
            await sb.from('prima_nota').delete().eq('id', primaNotaId)
          }
        })
        return {
          status: primaNotaId && (complete.righeIns?.data || []).length === 2 ? 'PASS' : 'FAIL',
          primaNotaId,
          righeCount: (complete.righeIns?.data || []).length,
        }
      })

      await addTest('T9', 'Import documento', async () => {
        const fileName = `${rnd('QA_IMPORT')}.xml`
        const storagePath = `inbox/${Date.now()}_${fileName}`
        const upload = await sb.storage.from('documenti').upload(storagePath, new Blob([fixture.xml], { type: 'application/xml' }))
        if (upload.error) throw upload.error
        cleanup.push(async () => {
          await sb.storage.from('documenti').remove([storagePath])
        })
        const ins = await sb.from('documenti_import').insert([{
          filename: fileName,
          file_path: storagePath,
          file_size: Buffer.byteLength(fixture.xml),
          mime_type: 'application/xml',
          tipo_documento: 'fattura_passiva',
          confidence: 0.97,
          ai_summary: `fattura_passiva - ${fixture.fornitore || fileName}`,
          ai_raw_response: {
            xml_content: fixture.xml,
            numero: fixture.numero,
            data: fixture.data,
            cedente_denom: fixture.fornitore,
            cedente_piva: fixture.piva,
            imponibile: fixture.imponibile,
            iva: fixture.iva,
            totale: Math.round((fixture.imponibile + fixture.iva) * 100) / 100,
          },
          stato: 'classified',
          societa_destinazione_id: societaId,
          ...scopePrivate,
        }]).select('id,filename,societa_destinazione_id,stato').single()
        if (ins.error) throw ins.error
        out.created.documentoImportId = ins.data.id
        cleanup.push(async () => {
          await sb.from('documenti_import').update({ stato: 'error' }).eq('id', ins.data.id)
        })
        return {
          status: ins.data?.societa_destinazione_id === societaId ? 'PASS' : 'FAIL',
          documentImportId: ins.data.id,
          fileName,
          storagePath,
        }
      })

      await addTest('T8', 'Registra confermati', async () => {
        const costo = fixtures.pianoConti.find((c) => Number(c.livello) >= 3) || fixtures.pianoConti[0]
        const controparte = fixtures.pianoConti.find((c) => c.is_fornitore && Number(c.livello) >= 3) || costo
        const causaleIvaId = out.created.causaleIvaId || fixtures.causaliIva[0]?.id || null
        if (!costo?.id || !controparte?.id || !causaleIvaId) {
          return { status: 'FAIL', reason: 'Missing fixtures for registration flow' }
        }
        const totale = Math.round((fixture.imponibile + fixture.iva) * 100) / 100 || 122
        const docInsert = await sb.from('documenti_contabilita').insert([{
          societa_id: societaId,
          tipo: 'fattura_passiva',
          tipo_documento: 'fattura_passiva',
          nome_file: `${rnd('QA_DOC')}.xml`,
          filename: `${rnd('QA_DOC')}.xml`,
          file_path: `inbox/${Date.now()}_qa_reg.xml`,
          mime_type: 'application/xml',
          stato: 'da_validare',
          workflow_status: 'confirmed',
          validation_status: 'confirmed',
          data_documento: fixture.data || isoNow().slice(0, 10),
          numero_documento: fixture.numero || rnd('N'),
          soggetto_denominazione: fixture.fornitore || 'Fornitore QA',
          soggetto_piva: fixture.piva || null,
          imponibile: fixture.imponibile || 100,
          iva: fixture.iva || 22,
          totale,
          causale_iva: causaleIvaId,
          conto_id: costo.id,
          dati_estratti: {
            xml_content: fixture.xml,
            numero: fixture.numero,
            data: fixture.data,
          },
          ...scopeShared,
        }]).select('*').single()
        if (docInsert.error) throw docInsert.error
        const docId = docInsert.data.id
        out.created.documentoContabilitaId = docId
        cleanup.push(async () => {
          await sb.from('registri_iva').delete().eq('documento_id', String(docId))
          await sb.from('accounting_entries').delete().eq('document_id', docId)
          const pnLookup = await sb.from('documenti_contabilita').select('prima_nota_id').eq('id', docId).single()
          const pnId = pnLookup.data?.prima_nota_id || null
          if (pnId) {
            await sb.from('partitario').delete().eq('prima_nota_id', pnId)
            await sb.from('prima_nota_righe').delete().eq('prima_nota_id', pnId)
            await sb.from('prima_nota').delete().eq('id', pnId)
          }
          await sb.from('documenti_contabilita').delete().eq('id', docId)
        })

        const claim = await sb.from('documenti_contabilita').update({
          workflow_status: 'registering',
          locked_by: utenteId,
          locked_at: isoNow(),
        }).eq('id', docId).eq('societa_id', societaId).eq('workflow_status', 'confirmed').select('id,workflow_status').single()
        if (claim.error) throw claim.error

        const complete = await createPrimaNotaCompleta({
          db: sb,
          pnPayload: {
            societa_id: societaId,
            data_registrazione: fixture.data || isoNow().slice(0, 10),
            data_documento: fixture.data || isoNow().slice(0, 10),
            numero_documento: fixture.numero || null,
            causale_codice: 'FF',
            descrizione: `Registrazione QA ${fixture.fornitore || ''}`.trim(),
            cliente_fornitore_id: controparte.id,
            cliente_fornitore_nome: controparte.descrizione,
            totale_dare: totale,
            totale_avere: totale,
            stato: 'confermato',
            ...scopeShared,
          },
          righePayload: [
            {
              riga_numero: 1,
              conto_id: costo.id,
              conto_codice: costo.codice,
              conto_descrizione: costo.descrizione,
              descrizione_riga: 'Costo',
              importo_dare: fixture.imponibile || 100,
              importo_avere: 0,
              causale_iva_id: causaleIvaId,
              ...scopeShared,
            },
            {
              riga_numero: 2,
              conto_id: controparte.id,
              conto_codice: controparte.codice,
              conto_descrizione: controparte.descrizione,
              descrizione_riga: 'Fornitore',
              importo_dare: 0,
              importo_avere: totale,
              ...scopeShared,
            },
          ],
          partEntries: [],
          headerSelect: 'id',
          righeSelect: 'id,prima_nota_id',
        })
        if (complete.error) throw complete.error
        const primaNotaId = complete.pn?.id
        out.created.primaNotaRegistrazioneId = primaNotaId

        const acc = await sb.from('accounting_entries').insert([{
          document_id: docId,
          societa_id: societaId,
          status: 'CREATED',
          data: {
            tipo: 'acquisto',
            imponibile: fixture.imponibile || 100,
            iva: fixture.iva || 22,
            totale,
          },
          ...scopeShared,
        }]).select('id').single()
        if (acc.error) throw acc.error

        const reg = await sb.from('registri_iva').insert([{
          documento_id: String(docId),
          societa_id: societaId,
          sezione: 'acquisti',
          data_registro: fixture.data || isoNow().slice(0, 10),
          numero_documento: fixture.numero || null,
          controparte: fixture.fornitore || 'Fornitore QA',
          partita_iva: fixture.piva || null,
          imponibile: fixture.imponibile || 100,
          imposta: fixture.iva || 22,
          totale,
          aliquota: 22,
          natura: null,
          detraibile: true,
          percentuale_detraibilita: 100,
          iva_detraibile: fixture.iva || 22,
          iva_indetraibile: 0,
          causale_iva_id: causaleIvaId,
          ...scopeShared,
        }]).select('id').single()
        if (reg.error) throw reg.error

        const finalize = await sb.from('documenti_contabilita').update({
          workflow_status: 'registered',
          registered_at: isoNow(),
          prima_nota_id: primaNotaId,
          locked_by: null,
          locked_at: null,
        }).eq('id', docId).eq('societa_id', societaId).select('id,workflow_status,prima_nota_id').single()
        if (finalize.error) throw finalize.error

        return {
          status: finalize.data?.workflow_status === 'registered' && Boolean(finalize.data?.prima_nota_id) ? 'PASS' : 'FAIL',
          documentoContabilitaId: docId,
          primaNotaId,
          accountingEntryId: acc.data?.id || null,
          registroIvaId: reg.data?.id || null,
        }
      })

      await addTest('T10', 'Assenza errori RLS in console/network', async () => {
        const signals = out.tests
          .flatMap((t) => [JSON.stringify(t.details || {})])
          .filter((s) => /row-level security|violates row-level security|permission denied|rls/i.test(s))
        return {
          status: signals.length === 0 ? 'PASS' : 'FAIL',
          signals,
          note: 'Derived from live deploy session endpoint and live DB/RLS operation results.',
        }
      })
    }

    for (const fn of cleanup.reverse()) {
      try {
        await fn()
      } catch (error) {
        out.cleanupErrors.push(safeError(error))
      }
    }

    out.endedAt = isoNow()
    return out
  } finally {
    await sb.auth.signOut().catch(() => {})
  }
}

async function safeRunUser(label, email, password, fixture) {
  try {
    return await runUser(label, email, password, fixture)
  } catch (error) {
    const testId = label === 'legacy' ? 'T1' : 'T2'
    return {
      user: { label, email },
      startedAt: isoNow(),
      endedAt: isoNow(),
      tests: [
        {
          id: testId,
          title: `Login ${label}`,
          startedAt: isoNow(),
          endedAt: isoNow(),
          status: 'FAIL',
          details: {
            reason: 'auth_failed',
            error: safeError(error),
          },
        },
      ],
      created: {},
      cleanupErrors: [],
      fatalError: safeError(error),
    }
  }
}

function testFromUsers(report, id) {
  for (const user of report.users) {
    const found = user.tests.find((t) => t.id === id)
    if (found) return found
  }
  return null
}

function buildSummary(report) {
  const order = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']
  const tests = order.map((id) => {
    const t = testFromUsers(report, id)
    return { id, title: t?.title || id, status: t?.status || 'NOT_RUN' }
  })
  const failed = tests.filter((t) => t.status !== 'PASS')
  return {
    tests,
    failed,
    goNoGo: failed.length === 0 ? 'GO' : 'NO-GO',
    readiness: failed.length === 0 ? 'Sprint 2 ready from data/API smoke coverage' : 'Residual failures present',
  }
}

function renderMarkdown(report) {
  const lines = []
  lines.push('# Sprint 1 Smoke Test Report')
  lines.push('')
  lines.push(`- Generated at: ${report.generatedAt}`)
  lines.push(`- Deploy: ${report.deployUrl}`)
  lines.push(`- XML fixture: \`${report.xmlPath}\``)
  lines.push(`- Scope: live deploy session endpoint + live Supabase/RLS smoke checks`)
  lines.push(`- Decision: **${report.summary.goNoGo}**`)
  lines.push(`- Readiness: ${report.summary.readiness}`)
  lines.push('')
  lines.push('## Results')
  for (const test of report.summary.tests) {
    lines.push(`- ${test.id} ${test.title}: **${test.status}**`)
  }
  lines.push('')
  lines.push('## Details')
  for (const user of report.users) {
    lines.push(`### ${user.user.label}`)
    lines.push(`- Email: \`${user.user.email}\``)
    lines.push(`- Societa: \`${user.profile?.societaId || 'n/a'}\``)
    for (const test of user.tests) {
      lines.push(`- ${test.id} ${test.title}: **${test.status}**`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function main() {
  await ensureDir(LOG_DIR)
  const fixture = await readXmlFixture()
  const legacy = await safeRunUser('legacy', LEGACY_EMAIL, LEGACY_PASSWORD, fixture)
  const modern = await safeRunUser('new', NEW_EMAIL, NEW_PASSWORD, fixture)
  const report = {
    generatedAt: isoNow(),
    deployUrl: DEPLOY_URL,
    xmlPath: XML_PATH,
    users: [legacy, modern],
  }
  report.summary = buildSummary(report)
  const suffix = tokenNow()
  const jsonPath = path.join(LOG_DIR, `sprint1-smoke-${suffix}.json`)
  const mdPath = path.join(LOG_DIR, `sprint1-smoke-${suffix}.md`)
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2))
  await fs.writeFile(mdPath, renderMarkdown(report))
  console.log(JSON.stringify({ ok: true, jsonPath, mdPath, summary: report.summary }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: safeError(error) }, null, 2))
  process.exitCode = 1
})
