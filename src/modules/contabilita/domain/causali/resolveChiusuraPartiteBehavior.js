export function resolveChiusuraPartiteBehavior(policy = {}, header = {}, selectedPartite = [], pianoConti = []) {
  const isChiusura = policy?.gestionePartitario === 'chiusura' || policy?.partiteClose === true;
  
  if (!isChiusura) {
    return {
      isChiusura: false,
      soggettoTipo: '',
      latoBanca: '',
      latoSoggetto: ''
    };
  }

  let soggettoTipo = '';

  // 1. Check policy explicit properties
  if (policy?.isIncasso) {
    soggettoTipo = 'cliente';
  } else if (policy?.isPagamento) {
    soggettoTipo = 'fornitore';
  }

  // 2. Check header clienteFornitoreTipo
  if (!soggettoTipo && header) {
    const rawType = String(header.clienteFornitoreTipo || header.cliente_fornitore_tipo || '').trim().toLowerCase();
    if (rawType.includes('client')) {
      soggettoTipo = 'cliente';
    } else if (rawType.includes('fornit') || rawType.includes('prof')) {
      soggettoTipo = 'fornitore';
    }
  }

  // 3. Check selectedPartite
  if (!soggettoTipo && Array.isArray(selectedPartite) && selectedPartite.length > 0) {
    const firstPartita = selectedPartite[0];
    const rawPartitaType = String(firstPartita?.soggettoTipo || firstPartita?.soggetto_tipo || firstPartita?.tipo || '').trim().toLowerCase();
    if (rawPartitaType.includes('client')) {
      soggettoTipo = 'cliente';
    } else if (rawPartitaType.includes('fornit') || rawPartitaType.includes('prof')) {
      soggettoTipo = 'fornitore';
    }
  }

  // 4. Check pianoConti match for header's selected client/fornitore
  if (!soggettoTipo && header && Array.isArray(pianoConti) && pianoConti.length > 0) {
    const subjectId = String(header.clienteFornitoreId || header.cliente_fornitore_id || '').trim();
    if (subjectId) {
      const match = pianoConti.find(c => String(c.id).trim() === subjectId);
      if (match) {
        if (match.is_cliente) {
          soggettoTipo = 'cliente';
        } else if (match.is_fornitore || match.is_professionista) {
          soggettoTipo = 'fornitore';
        }
      }
    }
  }

  let latoBanca = '';
  let latoSoggetto = '';
  if (soggettoTipo === 'cliente') {
    latoBanca = 'dare';
    latoSoggetto = 'avere';
  } else if (soggettoTipo === 'fornitore') {
    latoBanca = 'avere';
    latoSoggetto = 'dare';
  }

  return {
    isChiusura: true,
    soggettoTipo,
    latoBanca,
    latoSoggetto
  };
}
