import { emailSendHandler } from '../services/api/email/send.js';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
  maxDuration: 60
};

const handlers = {
  send: emailSendHandler,
};

function inferAction(body) {
  if (!body || typeof body !== 'object') return 'read';
  if (body.to || body.regimeName || body.scadenze) return 'send';
  return 'read';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const actionRaw = typeof body.action === 'string' ? body.action : '';
    const action = actionRaw.trim().toLowerCase() || inferAction(body);

    if (action === 'send') {
      const result = await handlers.send({ body });
      return res.status(result.status).json(result.json);
    }

    // Phase A hardening: read/list/fetch_attachments temporarily disabled.
    if (action === 'read' || action === 'list' || action === 'fetch_attachments') {
      return res.status(503).json({
        ok: false,
        error: 'EMAIL_READ_DISABLED',
        message: 'Email read temporarily disabled during Phase A hardening'
      });
    }

    return res.status(422).json({
      ok: false,
      error: 'UNSUPPORTED_ACTION',
      message: `Unsupported action: ${action || '(empty)'}`
    });
  } catch (e) {
    console.error('[api/email]', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
