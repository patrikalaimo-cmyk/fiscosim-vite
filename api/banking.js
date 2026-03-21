// API per connessione bancaria PSD2 via GoCardless (ex Nordigen)
// Permette di collegare conti bancari e scaricare movimenti per riconciliazione

export const config = {
  api: { bodyParser: true },
  maxDuration: 30
};

// GoCardless Bank Account Data API endpoints
const GOCARDLESS_BASE = 'https://bankaccountdata.gocardless.com/api/v2';

// Ottieni token di accesso
async function getAccessToken(secretId, secretKey) {
  const res = await fetch(`${GOCARDLESS_BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey })
  });
  if (!res.ok) throw new Error('Errore autenticazione GoCardless');
  return res.json();
}

// Refresh token
async function refreshToken(refresh) {
  const res = await fetch(`${GOCARDLESS_BASE}/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh })
  });
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, secretId, secretKey, accessToken, ...params } = req.body;

  // Credenziali GoCardless (da configurare)
  const SECRET_ID = secretId || process.env.GOCARDLESS_SECRET_ID;
  const SECRET_KEY = secretKey || process.env.GOCARDLESS_SECRET_KEY;

  try {
    // ═══════════════════════════════════════════
    // 1. AUTENTICAZIONE
    // ═══════════════════════════════════════════
    if (action === 'authenticate') {
      if (!SECRET_ID || !SECRET_KEY) {
        return res.status(400).json({ 
          error: 'Credenziali GoCardless mancanti',
          help: 'Registrati su https://bankaccountdata.gocardless.com per ottenere SECRET_ID e SECRET_KEY gratuiti'
        });
      }
      const tokens = await getAccessToken(SECRET_ID, SECRET_KEY);
      return res.status(200).json({ success: true, ...tokens });
    }

    // ═══════════════════════════════════════════
    // 2. LISTA BANCHE ITALIANE
    // ═══════════════════════════════════════════
    if (action === 'list_banks') {
      const country = params.country || 'IT';
      const response = await fetch(`${GOCARDLESS_BASE}/institutions/?country=${country}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Errore lista banche: ${err}`);
      }
      const banks = await response.json();
      
      // Filtra solo banche attive e ordina per nome
      const activeBanks = banks
        .filter(b => b.status === 'enabled' || !b.status)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(b => ({
          id: b.id,
          name: b.name,
          bic: b.bic,
          logo: b.logo,
          countries: b.countries
        }));

      return res.status(200).json({ success: true, banks: activeBanks, count: activeBanks.length });
    }

    // ═══════════════════════════════════════════
    // 3. CREA LINK DI COLLEGAMENTO BANCA
    // ═══════════════════════════════════════════
    if (action === 'create_link') {
      const { institutionId, redirectUrl, reference } = params;
      
      if (!institutionId) {
        return res.status(400).json({ error: 'institutionId richiesto' });
      }

      // 1. Crea agreement (90 giorni accesso, 730 giorni storico)
      const agreementRes = await fetch(`${GOCARDLESS_BASE}/agreements/enduser/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          institution_id: institutionId,
          max_historical_days: 730, // 2 anni di storico
          access_valid_for_days: 90,
          access_scope: ['balances', 'details', 'transactions']
        })
      });
      
      if (!agreementRes.ok) {
        const err = await agreementRes.text();
        throw new Error(`Errore agreement: ${err}`);
      }
      const agreement = await agreementRes.json();

      // 2. Crea requisition (link per utente)
      const requisitionRes = await fetch(`${GOCARDLESS_BASE}/requisitions/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          redirect: redirectUrl || 'https://fiscosim.vercel.app/callback',
          institution_id: institutionId,
          reference: reference || `fiscosim_${Date.now()}`,
          agreement: agreement.id,
          user_language: 'IT'
        })
      });

      if (!requisitionRes.ok) {
        const err = await requisitionRes.text();
        throw new Error(`Errore requisition: ${err}`);
      }
      const requisition = await requisitionRes.json();

      return res.status(200).json({
        success: true,
        requisitionId: requisition.id,
        link: requisition.link,
        agreementId: agreement.id
      });
    }

    // ═══════════════════════════════════════════
    // 4. VERIFICA STATO COLLEGAMENTO
    // ═══════════════════════════════════════════
    if (action === 'check_requisition') {
      const { requisitionId } = params;
      
      const response = await fetch(`${GOCARDLESS_BASE}/requisitions/${requisitionId}/`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!response.ok) throw new Error('Errore verifica requisition');
      const requisition = await response.json();

      return res.status(200).json({
        success: true,
        status: requisition.status,
        accounts: requisition.accounts || [],
        institution: requisition.institution_id
      });
    }

    // ═══════════════════════════════════════════
    // 5. DETTAGLI CONTO
    // ═══════════════════════════════════════════
    if (action === 'get_account') {
      const { accountId } = params;
      
      // Dettagli conto
      const detailsRes = await fetch(`${GOCARDLESS_BASE}/accounts/${accountId}/details/`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const details = detailsRes.ok ? await detailsRes.json() : {};

      // Saldi
      const balancesRes = await fetch(`${GOCARDLESS_BASE}/accounts/${accountId}/balances/`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const balances = balancesRes.ok ? await balancesRes.json() : {};

      return res.status(200).json({
        success: true,
        account: details.account || {},
        balances: balances.balances || []
      });
    }

    // ═══════════════════════════════════════════
    // 6. SCARICA TRANSAZIONI
    // ═══════════════════════════════════════════
    if (action === 'get_transactions') {
      const { accountId, dateFrom, dateTo } = params;
      
      let url = `${GOCARDLESS_BASE}/accounts/${accountId}/transactions/`;
      const queryParams = [];
      if (dateFrom) queryParams.push(`date_from=${dateFrom}`);
      if (dateTo) queryParams.push(`date_to=${dateTo}`);
      if (queryParams.length) url += '?' + queryParams.join('&');

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Errore transazioni: ${err}`);
      }

      const data = await response.json();
      const transactions = data.transactions || {};

      // Normalizza transazioni
      const allTransactions = [
        ...(transactions.booked || []).map(t => ({ ...t, status: 'booked' })),
        ...(transactions.pending || []).map(t => ({ ...t, status: 'pending' }))
      ].map(t => ({
        id: t.transactionId || t.internalTransactionId,
        date: t.bookingDate || t.valueDate,
        amount: parseFloat(t.transactionAmount?.amount || 0),
        currency: t.transactionAmount?.currency || 'EUR',
        description: t.remittanceInformationUnstructured || t.additionalInformation || '',
        counterparty: t.creditorName || t.debtorName || '',
        counterpartyIban: t.creditorAccount?.iban || t.debtorAccount?.iban || '',
        reference: t.endToEndId || '',
        status: t.status
      }));

      return res.status(200).json({
        success: true,
        transactions: allTransactions,
        count: allTransactions.length
      });
    }

    // ═══════════════════════════════════════════
    // 7. ALGORITMO MATCHING AUTOMATICO
    // ═══════════════════════════════════════════
    if (action === 'auto_match') {
      const { transactions, fatture } = params;
      
      const matches = [];
      const unmatched = [];

      for (const tx of transactions) {
        let bestMatch = null;
        let bestScore = 0;

        for (const fatt of fatture) {
          let score = 0;
          
          // Match per importo (peso alto)
          const diff = Math.abs(Math.abs(tx.amount) - fatt.totale);
          if (diff < 0.01) score += 50;
          else if (diff < 1) score += 30;
          else if (diff < 10) score += 10;

          // Match per P.IVA/IBAN nella descrizione
          if (fatt.soggetto_piva && tx.description?.includes(fatt.soggetto_piva)) score += 30;
          if (fatt.soggetto_piva && tx.counterpartyIban?.includes(fatt.soggetto_piva.slice(-5))) score += 20;

          // Match per nome
          if (fatt.soggetto_denominazione) {
            const nome = fatt.soggetto_denominazione.toLowerCase();
            const desc = (tx.description + ' ' + tx.counterparty).toLowerCase();
            if (desc.includes(nome.split(' ')[0])) score += 20;
          }

          // Match per numero fattura
          if (fatt.numero_documento && tx.description?.includes(fatt.numero_documento)) score += 25;

          // Match per data (entro 30 giorni)
          if (fatt.data_documento && tx.date) {
            const diffDays = Math.abs(new Date(tx.date) - new Date(fatt.data_documento)) / (1000 * 60 * 60 * 24);
            if (diffDays <= 30) score += 10;
            if (diffDays <= 7) score += 10;
          }

          if (score > bestScore) {
            bestScore = score;
            bestMatch = { fattura: fatt, score };
          }
        }

        if (bestScore >= 50) {
          matches.push({
            transaction: tx,
            fattura: bestMatch.fattura,
            score: bestScore,
            confidence: bestScore >= 80 ? 'high' : bestScore >= 60 ? 'medium' : 'low'
          });
        } else {
          unmatched.push(tx);
        }
      }

      return res.status(200).json({
        success: true,
        matches,
        unmatched,
        stats: {
          total: transactions.length,
          matched: matches.length,
          unmatched: unmatched.length,
          matchRate: Math.round(matches.length / transactions.length * 100) + '%'
        }
      });
    }

    return res.status(400).json({ error: 'Azione non valida' });

  } catch (error) {
    console.error('Banking API Error:', error);
    return res.status(500).json({ error: 'Errore API bancaria', message: error.message });
  }
}
