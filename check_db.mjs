import { getSupabaseAdmin } from "./lib/db.js";

async function run() {
  const db = await getSupabaseAdmin();
  const pnId = "c2e586a5-8425-47d9-87ed-a8b2c78fe6d2";
  const societaId = "4a728851-be5a-412c-9ce6-ec07b72fcdfa";
  const docId = "d7cfe444-229d-405b-863d-3ea4448d1748";
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const pnRes = await db.from("prima_nota").select("*").eq("id", pnId).maybeSingle();
  const righeRes = await db.from("prima_nota_righe").select("*").eq("prima_nota_id", pnId).order("riga_numero", { ascending: true });
  const docRes = await db.from("documenti_contabilita").select("*").eq("id", docId).maybeSingle();

  const cpn = await db.from("prima_nota").select("id", { head: true, count: "exact" }).eq("societa_id", societaId).gte("created_at", since);
  const cpnr = await db.from("prima_nota_righe").select("id", { head: true, count: "exact" }).gte("created_at", since);
  const creg = await db.from("registri_iva").select("id", { head: true, count: "exact" }).eq("societa_id", societaId).gte("created_at", since);
  const cpart = await db.from("partitario").select("id", { head: true, count: "exact" }).eq("societa_id", societaId).gte("created_at", since);

  const out = {
    pn: pnRes.data,
    pnError: pnRes.error?.message,
    righe: righeRes.data || [],
    righeError: righeRes.error?.message,
    doc: docRes.data ? {
      id: docRes.data.id,
      workflow_status: docRes.data.workflow_status,
      validation_status: docRes.data.validation_status,
      prima_nota_id: docRes.data.prima_nota_id,
      registered_at: docRes.data.registered_at,
      locked_by: docRes.data.locked_by,
      locked_at: docRes.data.locked_at
    } : null,
    docError: docRes.error?.message,
    counts: {
      prima_nota_recent: cpn.count,
      prima_nota_righe_recent: cpnr.count,
      registri_iva_recent: creg.count,
      partitario_recent: cpart.count
    },
    countErrors: {
      pn: cpn.error?.message,
      pnr: cpnr.error?.message,
      reg: creg.error?.message,
      part: cpart.error?.message
    }
  };

  const dare = out.righe.reduce((a, r) => a + Number(r.importo_dare || 0), 0);
  const avere = out.righe.reduce((a, r) => a + Number(r.importo_avere || 0), 0);
  out.quadratura = {
    totale_dare: Number(dare.toFixed(2)),
    totale_avere: Number(avere.toFixed(2)),
    balanced: Math.abs(dare - avere) < 0.001
  };

  console.log(JSON.stringify(out, null, 2));
}

run().catch(err => { console.error(err); process.exit(1); });
