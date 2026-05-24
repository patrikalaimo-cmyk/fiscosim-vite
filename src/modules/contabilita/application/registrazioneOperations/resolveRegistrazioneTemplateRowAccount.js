import { normalizeText } from '../canonical_mapper/utils.js'
import { buildRegistrazioneContoSelection, findRegistrazioneContoExactMatch, resolveContoHierarchyView, resolveRegistrazioneContoDescrizione, resolveRegistrazioneContoLabel } from './resolveRegistrazioneConti.js'

function normalizeAccountCandidate(candidate = null) {
  if (!candidate || typeof candidate !== 'object') return null
  const contoId = normalizeText(
    candidate.conto_id ||
      candidate.id ||
      candidate.value ||
      candidate.clienteFornitoreId ||
      candidate.cliente_fornitore_id
  )
  const contoCodice = normalizeText(
    candidate.conto_codice ||
      candidate.codice ||
      candidate.code ||
      candidate.sigla ||
      candidate.clienteFornitoreCodice ||
      candidate.cliente_fornitore_codice
  )
  const contoDescrizione = normalizeText(
    candidate.conto_descrizione ||
      candidate.descrizione ||
      candidate.description ||
      candidate.denominazione ||
      candidate.nome ||
      candidate.label ||
      candidate.title ||
      candidate.clienteFornitoreNome ||
      candidate.cliente_fornitore_nome ||
      candidate.soggetto
  )
  if (!contoId && !contoCodice && !contoDescrizione) return null
  return buildRegistrazioneContoSelection(
    {
      id: contoId,
      codice: contoCodice,
      descrizione: contoDescrizione,
      hierarchyType: normalizeText(candidate.hierarchyType),
      isTemplateScope: Boolean(candidate.isTemplateScope),
    },
    normalizeText(candidate.__label || candidate.conto_label || candidate.displayLabel || candidate.label_full || candidate.label || candidate.title || `${contoCodice} - ${contoDescrizione}`)
  )
}

function pickSourceCandidate(source = null, role = '') {
  if (!source) return null
  const directCandidate = normalizeAccountCandidate(source)
  if (directCandidate) return directCandidate
  if (Array.isArray(source)) {
    const match = source.find((item) => normalizeText(item?.role || item?.ruolo) === normalizeText(role)) || source[0] || null
    return normalizeAccountCandidate(match)
  }
  if (typeof source === 'object') {
    const direct = source[normalizeText(role)] || source[role] || source.default || source.defaultAccount || source.account || source.conto || source.contoFinale || source.contoFisso
    return normalizeAccountCandidate(direct)
  }
  return null
}

function buildReason(prefix, candidate) {
  if (!candidate) return prefix
  const label = resolveRegistrazioneContoLabel(candidate)
  return `${prefix}: ${label}`
}

function toResolvedAccountOutput(candidate, extra = {}) {
  const account = candidate && typeof candidate === 'object' ? candidate : {}
  return {
    ...account,
    conto_id: normalizeText(account.conto_id || account.id || account.value),
    conto_codice: normalizeText(account.conto_codice || account.codice || account.code || account.sigla),
    conto_descrizione: normalizeText(account.conto_descrizione || account.__selectionDescription || resolveRegistrazioneContoDescrizione(account)),
    ...extra,
  }
}

export function resolveRegistrazioneTemplateRowAccount({
  rowRole = '',
  causale = null,
  causaleBehavior = null,
  soggetto = null,
  societaId = '',
  templateRow = null,
  subjectAccountDefaults = null,
  subjectAccountHistory = null,
  procedureDefaults = null,
} = {}) {
  const role = normalizeText(rowRole || templateRow?.ruolo).toLowerCase()
  const selectedSubjectAccount = role === 'soggetto' ? pickSourceCandidate(subjectAccountDefaults, role) || pickSourceCandidate(subjectAccountHistory, role) || pickSourceCandidate(procedureDefaults, role) : null

  if (role === 'soggetto' && selectedSubjectAccount) {
    const hierarchy = resolveContoHierarchyView(selectedSubjectAccount)
    return toResolvedAccountOutput(selectedSubjectAccount, {
      hierarchyType: hierarchy?.hierarchyType || normalizeText(selectedSubjectAccount.hierarchyType),
      isTemplateScope: Boolean(selectedSubjectAccount.isTemplateScope || hierarchy?.hierarchyType === 'conto'),
      source:
        subjectAccountDefaults && pickSourceCandidate(subjectAccountDefaults, role)
          ? 'subject_default_account'
          : subjectAccountHistory && pickSourceCandidate(subjectAccountHistory, role)
            ? 'subject_account_history'
            : 'procedure_default_account',
      confidence: subjectAccountDefaults && pickSourceCandidate(subjectAccountDefaults, role) ? 0.98 : subjectAccountHistory && pickSourceCandidate(subjectAccountHistory, role) ? 0.8 : 0.55,
      reasons: [buildReason('Conto risolto dal soggetto', selectedSubjectAccount)],
      warnings: hierarchy?.isSelectableForRegistrazione ? [] : ['Per registrare serve un sottoconto'],
    })
  }

  const templateCandidate = normalizeAccountCandidate(templateRow)
  const templateHierarchy = templateCandidate ? resolveContoHierarchyView(templateCandidate) : null
  const templateIsFinal = Boolean(templateHierarchy?.isSelectableForRegistrazione)
  const templateScope = Boolean(templateRow?.isTemplateScope || templateHierarchy?.hierarchyType === 'conto' || templateHierarchy?.isConto)

  if (templateCandidate && (templateIsFinal || templateScope)) {
    return toResolvedAccountOutput(templateCandidate, {
      hierarchyType: templateHierarchy?.hierarchyType || normalizeText(templateCandidate.hierarchyType),
      isTemplateScope: templateScope,
      source: templateIsFinal ? 'template_row_final' : 'template_row_scope',
      confidence: 1,
      reasons: [buildReason('Template causale', templateCandidate)],
      warnings: templateIsFinal ? [] : ['Template causale usato come scope, conto finale da completare se necessario'],
    })
  }

  const roleCandidates = role === 'soggetto' ? [subjectAccountDefaults, subjectAccountHistory, procedureDefaults] : [templateRow?.subjectAccount, subjectAccountHistory, procedureDefaults]
  for (const candidateSource of roleCandidates) {
    const candidate = pickSourceCandidate(candidateSource, role)
    if (!candidate) continue
    const exact = findRegistrazioneContoExactMatch([candidate], candidate.__label || resolveRegistrazioneContoLabel(candidate) || candidate.conto_descrizione)
    const selected = exact ? buildRegistrazioneContoSelection(exact, exact.__label || resolveRegistrazioneContoLabel(exact)) : candidate
    const hierarchy = resolveContoHierarchyView(selected)
    return toResolvedAccountOutput(selected, {
      hierarchyType: hierarchy?.hierarchyType || normalizeText(selected.hierarchyType),
      isTemplateScope: Boolean(selected.isTemplateScope || hierarchy?.hierarchyType === 'conto'),
      source:
        candidateSource === subjectAccountDefaults
          ? 'subject_default_account'
          : candidateSource === subjectAccountHistory
            ? 'subject_account_history'
            : candidateSource === procedureDefaults
              ? 'procedure_default_account'
              : 'template_row_final',
      confidence: candidateSource === subjectAccountDefaults ? 0.98 : candidateSource === subjectAccountHistory ? 0.8 : 0.55,
      reasons: [buildReason('Conto risolto', selected)],
      warnings: hierarchy?.isSelectableForRegistrazione ? [] : ['Per registrare serve un sottoconto'],
    })
  }

  const selectedSoggetto = normalizeAccountCandidate(soggetto)
  if (role === 'soggetto' && selectedSoggetto) {
    const hierarchy = resolveContoHierarchyView(selectedSoggetto)
    return toResolvedAccountOutput(selectedSoggetto, {
      hierarchyType: hierarchy?.hierarchyType || normalizeText(selectedSoggetto.hierarchyType),
      isTemplateScope: Boolean(selectedSoggetto.isTemplateScope || hierarchy?.hierarchyType === 'conto'),
      source: 'subject_default_account',
      confidence: 0.75,
      reasons: [buildReason('Conto controparte risolto dal soggetto', selectedSoggetto)],
      warnings: hierarchy?.isSelectableForRegistrazione ? [] : ['Per registrare serve un sottoconto'],
    })
  }

  return {
    conto_id: '',
    conto_codice: '',
    conto_descrizione: '',
    hierarchyType: '',
    isTemplateScope: false,
    source: 'manual_required',
    confidence: 0,
    reasons: ['conto da selezionare'],
    warnings: ['conto da selezionare'],
  }
}
