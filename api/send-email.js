const nodemailer = require("nodemailer");

const CONFIG = {
  GMAIL_USER:     process.env.GMAIL_USER,
  GMAIL_APP_PASS: process.env.GMAIL_APP_PASS,
  FROM_NAME:      process.env.FROM_NAME  || "Studio Envisioning",
  FROM_EMAIL:     process.env.FROM_EMAIL || process.env.GMAIL_USER,
  REPLY_TO:       process.env.REPLY_TO   || process.env.GMAIL_USER,
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: CONFIG.GMAIL_USER, pass: CONFIG.GMAIL_APP_PASS },
});

function buildGenericHTML(oggetto, corpo) {
  const bodyHtml = (corpo||"").replace(/\n/g, "<br/>");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
  <body style="margin:0;padding:0;background:#0e1118;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0e1118;padding:30px 0;"><tr><td align="center">
  <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
    <tr><td style="background:#141b26;border:1px solid #252e42;border-radius:14px 14px 0 0;padding:20px 32px;text-align:center;">
      <div style="display:inline-block;width:36px;height:36px;background:linear-gradient(135deg,#c8a45e,#e8c078);border-radius:8px;font-family:Georgia,serif;font-size:18px;font-weight:700;color:#0e1118;line-height:36px;text-align:center;">§</div>
      <div style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#e4eaf5;margin-top:8px;">${CONFIG.FROM_NAME}</div>
    </td></tr>
    <tr><td style="background:#141b26;border:1px solid #252e42;border-top:none;padding:28px 32px;">
      <h2 style="font-size:16px;color:#c8a45e;margin:0 0 16px;">${oggetto}</h2>
      <div style="font-size:14px;color:#e4eaf5;line-height:1.7;">${bodyHtml}</div>
    </td></tr>
    <tr><td style="background:#1a2235;border:1px solid #252e42;border-top:none;border-radius:0 0 14px 14px;padding:16px 32px;text-align:center;">
      <p style="font-size:11px;color:#7a8599;margin:0;">Per assistenza: <a href="mailto:${CONFIG.REPLY_TO}" style="color:#c8a45e;">${CONFIG.REPLY_TO}</a></p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

function buildCalHTML(regimeName, scadenze) {
  const grouped = {};
  scadenze.forEach(s => { if (!grouped[s.month]) grouped[s.month] = []; grouped[s.month].push(s); });
  const lvlColor = { urg:"#e05252", imp:"#c8a45e", nrm:"#4e8ef7" };
  const lvlLabel = { urg:"Urgente", imp:"Importante", nrm:"Ordinario" };
  const rows = Object.entries(grouped).map(([month, items]) => `
    <tr><td colspan="3" style="padding:10px 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#c8a45e;border-bottom:1px solid rgba(200,164,94,.3);">${month}</td></tr>
    ${items.map(item => `<tr>
      <td style="padding:7px 10px 7px 0;font-size:12px;color:#7a8599;font-weight:600;white-space:nowrap;vertical-align:top;">${item.date}</td>
      <td style="padding:7px 10px 7px 0;vertical-align:top;"><div style="font-size:13px;font-weight:500;color:#e4eaf5;">${item.title}</div><div style="font-size:11px;color:#7a8599;margin-top:2px;">${item.desc}</div></td>
      <td style="padding:7px 0;vertical-align:top;white-space:nowrap;"><span style="font-size:10px;padding:2px 7px;border-radius:3px;color:${lvlColor[item.level]};background:${lvlColor[item.level]}22;border:1px solid ${lvlColor[item.level]}44;">${lvlLabel[item.level]}</span></td>
    </tr>`).join("")}`).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#0e1118;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0e1118;padding:30px 0;"><tr><td align="center">
  <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
    <tr><td style="background:#141b26;border:1px solid #252e42;border-radius:14px 14px 0 0;padding:28px 32px;text-align:center;">
      <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#e4eaf5;margin-top:10px;">FiscoSim</div>
      <div style="font-size:12px;color:#7a8599;margin-top:4px;">Calendario Scadenze Fiscali</div>
    </td></tr>
    <tr><td style="background:#141b26;border:1px solid #252e42;border-top:none;padding:28px 32px;">
      <p style="color:#e4eaf5;font-size:14px;margin:0 0 24px;">Scadenze fiscali per il regime <strong style="color:#e8c078;">${regimeName}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
    </td></tr>
    <tr><td style="background:#1a2235;border:1px solid #252e42;border-top:none;border-radius:0 0 14px 14px;padding:20px 32px;text-align:center;">
      <p style="font-size:10px;color:#3a4560;margin:0;">⚠️ Scadenze indicative — verificare con il proprio commercialista.</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body;

    // CASO 1: email generica con eventuale allegati CU
    if (body.to) {
      const { to, cc, bcc, oggetto, corpo, allegati_cu, isTest } = body;
      if (!to?.length || !oggetto) return res.status(400).json({ error: "Dati mancanti (to/oggetto)." });
      const subject = isTest ? `[TEST] ${oggetto}` : oggetto;

      // Costruisci attachments per nodemailer
      const attachments = (allegati_cu || []).map(a => ({
        filename: a.fileName,
        content: Buffer.from(a.base64, "base64"),
        contentType: "application/pdf",
      }));

      await transporter.sendMail({
        from: `"${CONFIG.FROM_NAME}" <${CONFIG.GMAIL_USER}>`,
        replyTo: CONFIG.REPLY_TO,
        to: Array.isArray(to) ? to.join(", ") : to,
        cc: cc?.length ? (Array.isArray(cc) ? cc.join(", ") : cc) : undefined,
        bcc: bcc?.length ? (Array.isArray(bcc) ? bcc.join(", ") : bcc) : undefined,
        subject,
        text: corpo || "",
        html: buildGenericHTML(oggetto, corpo),
        attachments,
      });
      return res.status(200).json({ ok: true });
    }

    // CASO 2: calendario scadenze
    const { email, regimeName, scadenze, isTest } = body;
    if (!email || !regimeName || !scadenze?.length) return res.status(400).json({ error: "Dati mancanti." });
    const subject = isTest ? `[TEST] FiscoSim – Scadenze ${regimeName}` : `FiscoSim – Scadenze fiscali (${regimeName})`;
    await transporter.sendMail({
      from: `"${CONFIG.FROM_NAME}" <${CONFIG.GMAIL_USER}>`,
      replyTo: CONFIG.REPLY_TO,
      to: email, subject,
      text: `Scadenze fiscali – ${regimeName}`,
      html: buildCalHTML(regimeName, scadenze),
    });
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("Email error:", err);
    return res.status(500).json({ error: "Errore invio email.", detail: err.message });
  }
};
