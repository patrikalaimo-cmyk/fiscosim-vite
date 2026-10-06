import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { sb } from '../src/lib/supabase.js'
import * as contabilitaRepo from '../src/modules/contabilita/data/contabilitaRepo.js'

// Save original references
const originalFrom = sb.from

test('Anagrafica Società e Periodicità IVA Config Suite', async (t) => {
  t.afterEach(() => {
    sb.from = originalFrom
  })

  await t.test('1. updateSocieta calls Supabase correct table and methods', async () => {
    let tableCalled = null
    let payloadSent = null
    let eqCalled = []
    let selectCount = 0
    let singleCount = 0

    const mockChain = {
      update(payload) {
        payloadSent = payload
        return mockChain
      },
      eq(field, value) {
        eqCalled.push([field, value])
        return mockChain
      },
      select() {
        selectCount++
        return mockChain
      },
      single() {
        singleCount++
        return Promise.resolve({ data: { id: 'soc-123', denominazione: 'Siria SRL' }, error: null })
      }
    }

    sb.from = (table) => {
      tableCalled = table
      return mockChain
    }

    const res = await contabilitaRepo.updateSocieta('soc-123', {
      denominazione: 'Siria SRL',
      tipo_liquidazione_iva: 'mensile'
    })

    assert.equal(tableCalled, 'societa')
    assert.deepEqual(eqCalled, [['id', 'soc-123']])
    assert.equal(selectCount, 1)
    assert.equal(singleCount, 1)
    assert.deepEqual(payloadSent, { denominazione: 'Siria SRL', tipo_liquidazione_iva: 'mensile' })
    assert.equal(res.data.id, 'soc-123')
  })

  await t.test('2. Static check on AnagraficheContabiliView.jsx for mappings', async () => {
    const filePath = path.join(process.cwd(), 'src/modules/contabilita/views/AnagraficheContabiliView.jsx')
    const content = await fs.readFile(filePath, 'utf-8')

    // Verify dates mapping inside createInitialForm
    assert.ok(
      content.includes('esercizio_inizio: current?.esercizio_da') ||
      content.includes('esercizio_inizio: current?.esercizio_da || current?.esercizio_inizio'),
      'esercizio_inizio must map to current.esercizio_da'
    )
    assert.ok(
      content.includes('esercizio_fine: current?.esercizio_a') ||
      content.includes('esercizio_fine: current?.esercizio_a || current?.esercizio_fine'),
      'esercizio_fine must map to current.esercizio_a'
    )

    // Verify dates mapping in optionalMappings
    assert.ok(
      content.includes('esercizio_da: form.esercizio_inizio') ||
      content.includes('esercizio_da: form.esercizio_inizio || null'),
      'esercizio_da must map to form.esercizio_inizio'
    )
    assert.ok(
      content.includes('esercizio_a: form.esercizio_fine') ||
      content.includes('esercizio_a: form.esercizio_fine || null'),
      'esercizio_a must map to form.esercizio_fine'
    )

    // Verify updates payload contains tipo_liquidazione_iva
    assert.ok(
      content.includes('tipo_liquidazione_iva: form.liquidazione_iva') ||
      content.includes("tipo_liquidazione_iva: form.liquidazione_iva || 'trimestrale'"),
      'updates must include tipo_liquidazione_iva mapped to form.liquidazione_iva'
    )

    // Verify that data is returned from repository call and onSocietaUpdate is triggered
    assert.ok(
      content.includes('const { data, error } = await contabilitaRepo.updateSocieta'),
      'updateSocieta must return data and error destructuring'
    )
    assert.ok(
      content.includes('onSocietaUpdate?.(data)'),
      'onSocietaUpdate callback must be triggered with updated data'
    )
  })

  await t.test('3. Static check on index.jsx for handleSocietaUpdate and state propagation', async () => {
    const filePath = path.join(process.cwd(), 'src/modules/contabilita/index.jsx')
    const content = await fs.readFile(filePath, 'utf-8')

    // Verify declaration of handleSocietaUpdate callback
    assert.ok(
      content.includes('const handleSocietaUpdate = useCallback((updated) =>'),
      'handleSocietaUpdate callback must be declared in index.jsx'
    )

    // Verify state updates in handleSocietaUpdate
    assert.ok(
      content.includes('setSocietaAttiva(updated)'),
      'handleSocietaUpdate must update active company state'
    )
    assert.ok(
      content.includes('setSocieta(') && content.includes('.map('),
      'handleSocietaUpdate must update companies list state'
    )

    // Verify that handleSocietaUpdate is passed as onSocietaUpdate prop to AnagraficheContabiliView
    assert.ok(
      content.includes('onSocietaUpdate={handleSocietaUpdate}'),
      'AnagraficheContabiliView must receive onSocietaUpdate prop'
    )
  })

  await t.test('4. Static check and logic verification for HeaderBridge visual props update and click delegation', async () => {
    const filePath = path.join(process.cwd(), 'src/shared/components/index.jsx')
    const content = await fs.readFile(filePath, 'utf-8')

    // Verify areVisualPropsEqual helper is defined and used
    assert.ok(
      content.includes('function areVisualPropsEqual('),
      'areVisualPropsEqual helper must be defined'
    )

    // Verify cloneWithRefClick helper is defined
    assert.ok(
      content.includes('function cloneWithRefClick('),
      'cloneWithRefClick helper must be defined'
    )

    // Verify primaryClickRef is declared and updated
    assert.ok(
      content.includes('const primaryClickRef = useRef(null)'),
      'primaryClickRef must be declared as a Ref'
    )
    assert.ok(
      content.includes('primaryClickRef.current = next.primaryAction.props.onClick'),
      'primaryClickRef must store the latest onClick reference'
    )

    // Verify visualChange checks areVisualPropsEqual
    assert.ok(
      content.includes('!areVisualPropsEqual(prev.primaryAction, next.primaryAction)'),
      'visualChange must check visual equality of primaryAction'
    )
  })
})
