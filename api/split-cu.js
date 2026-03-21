const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const { PDFDocument } = require("pdf-lib");

// Identifica se una pagina è la prima pagina di una nuova CU
function isPrimaPaginaCU(testo) {
  const t = testo.toUpperCase();
  return (
    t.includes("CERTIFICAZIONE") &&
    t.includes("UNICA") &&
    t.includes("DATI ANAGRAFICI") &&
    (t.includes("DATORE DI LAVORO") || t.includes("SOSTITUTO D'IMPOSTA") || t.includes("SOSTITUTO DI IMPOSTA"))
  );
}

// Estrae nome percipiente e sostituto dal testo della prima pagina
function estraiDati(testo) {
  const lines = testo.split("\n").map(l => l.trim()).filter(Boolean);

  // Cerca cognome e nome del percipiente
  // Nella CU il percipiente compare dopo "DATI RELATIVI AL DIPENDENTE"
  let percipienteCF = "";
  let percipientiNome = "";
  let sostitutoNome = "";
  let sostitutoCF = "";

  // Cerca CF percipiente (16 caratteri alfanumerici)
  const cfRegex = /\b([A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z])\b/g;
  const cfMatches = [...testo.matchAll(cfRegex)];
  if (cfMatches.length >= 2) {
    sostitutoCF = cfMatches[0][1]; // primo CF = sostituto (spesso è P.IVA però)
    percipienteCF = cfMatches[1][1]; // secondo CF = percipiente
  } else if (cfMatches.length === 1) {
    percipienteCF = cfMatches[0][1];
  }

  // P.IVA sostituto (11 cifre)
  const pivaMatch = testo.match(/\b(\d{11})\b/);
  if (pivaMatch) sostitutoCF = pivaMatch[1];

  // Cerca nome sostituto — di solito dopo la P.IVA su stessa riga o riga successiva
  // Pattern: riga con p.iva seguita da denominazione
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\d{11}$/) && lines[i + 1]) {
      sostitutoNome = lines[i + 1];
      break;
    }
    // Oppure sulla stessa riga: "02425570823 ITALKALI S.p.A."
    const m = lines[i].match(/^(\d{11})\s+(.+)$/);
    if (m && m[2].length > 2) {
      sostitutoCF = m[1];
      sostitutoNome = m[2];
      break;
    }
  }

  // Cerca nome percipiente vicino al CF trovato
  if (percipienteCF) {
    const idx = testo.indexOf(percipienteCF);
    const dopo = testo.substring(idx + percipienteCF.length, idx + percipienteCF.length + 200);
    const nomeMatch = dopo.match(/\n([A-ZÀÈÉÌÒÙ][A-ZÀÈÉÌÒÙ\s']{3,50})\n/);
    if (nomeMatch) {
      percipientiNome = nomeMatch[1].trim();
    }
  }

  // Fallback: cerca pattern "COGNOME NOME" dopo keyword
  if (!percipientiNome) {
    const markers = ["DIPENDENTE", "PERCETTORE", "PENSIONATO"];
    for (const marker of markers) {
      const idx = testo.toUpperCase().indexOf(marker);
      if (idx > -1) {
        const sub = testo.substring(idx + marker.length, idx + marker.length + 300);
        const m = sub.match(/\n([A-ZÀÈÉÌÒÙ][A-ZÀÈÉÌÒÙ\s']{4,50})\n/);
        if (m) { percipientiNome = m[1].trim(); break; }
      }
    }
  }

  return { percipienteCF, percipientiNome, sostitutoNome, sostitutoCF };
}

function nomeFile(nome, cf, anno) {
  const pulito = (nome || cf || "PERCIPIENTE")
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();
  return `${pulito}_CU${anno}.pdf`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { pdfBase64, anno } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: "PDF mancante" });

    const annoStr = anno || new Date().getFullYear().toString();
    const pdfBytes = Buffer.from(pdfBase64, "base64");

    // 1. Estrai testo per pagina con pdfjs
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    const pagineTestoArr = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const testo = content.items.map(item => item.str).join("\n");
      pagineTestoArr.push(testo);
    }

    // 2. Trova indici di inizio di ogni CU
    const boundaries = [];
    for (let i = 0; i < pagineTestoArr.length; i++) {
      if (isPrimaPaginaCU(pagineTestoArr[i])) {
        boundaries.push(i);
      }
    }

    if (boundaries.length === 0) {
      return res.status(400).json({ error: "Nessuna CU trovata nel PDF. Verifica che il file sia corretto." });
    }

    // 3. Split con pdf-lib
    const srcDoc = await PDFDocument.load(pdfBytes);
    const risultati = [];

    for (let b = 0; b < boundaries.length; b++) {
      const startPage = boundaries[b];
      const endPage = b + 1 < boundaries.length ? boundaries[b + 1] - 1 : numPages - 1;

      // Estrai dati dalla prima pagina di questa CU
      const dati = estraiDati(pagineTestoArr[startPage]);

      // Crea nuovo PDF con le pagine di questa CU
      const nuovoDoc = await PDFDocument.create();
      const pagineIdxArr = [];
      for (let p = startPage; p <= endPage; p++) pagineIdxArr.push(p);
      const pagineCopiate = await nuovoDoc.copyPages(srcDoc, pagineIdxArr);
      pagineCopiate.forEach(p => nuovoDoc.addPage(p));

      const nuovoPdfBytes = await nuovoDoc.save();
      const base64Out = Buffer.from(nuovoPdfBytes).toString("base64");
      const fileName = nomeFile(dati.percipientiNome, dati.percipienteCF, annoStr);

      risultati.push({
        fileName,
        base64: base64Out,
        percipienteCF: dati.percipienteCF,
        percipientiNome: dati.percipientiNome,
        sostitutoNome: dati.sostitutoNome,
        sostitutoCF: dati.sostitutoCF,
        pagine: endPage - startPage + 1,
        pageStart: startPage + 1,
        pageEnd: endPage + 1,
      });
    }

    return res.status(200).json({
      ok: true,
      totale: risultati.length,
      anno: annoStr,
      cu: risultati,
    });

  } catch (err) {
    console.error("split-cu error:", err);
    return res.status(500).json({ error: "Errore elaborazione PDF: " + err.message });
  }
};
