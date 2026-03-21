// API per lettura email via IMAP (Gmail)
// Vercel Serverless Function

import Imap from 'imap';
import { simpleParser } from 'mailparser';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
  maxDuration: 60
};

// Configurazioni account Gmail
const GMAIL_ACCOUNTS = {
  'patenv25@gmail.com': { pass: 'iohtfqhschkyagwo' },
  'ilpapacommercialista@gmail.com': { pass: 'pentmbuwmbyuokod' },
  'patrik.alaimo@gmail.com': { pass: 'qpjqfeqtwimgyjso' }
};

function connectImap(email) {
  const account = GMAIL_ACCOUNTS[email];
  if (!account) throw new Error('Account non configurato');

  return new Imap({
    user: email,
    password: account.pass,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
  });
}

function fetchEmails(imap, folder = 'INBOX', limit = 20) {
  return new Promise((resolve, reject) => {
    imap.openBox(folder, false, (err, box) => { // false = read-write per poter marcare come non letto
      if (err) return reject(err);

      // Cerca email non lette con allegati negli ultimi 7 giorni
      const since = new Date();
      since.setDate(since.getDate() - 7);
      
      imap.search(['UNSEEN', ['SINCE', since]], (err, results) => {
        if (err) return reject(err);
        if (!results || results.length === 0) return resolve([]);

        const emails = [];
        const toFetch = results.slice(-limit); // Ultime N email

        const fetch = imap.fetch(toFetch, { 
          bodies: '',
          struct: true,
          markSeen: false // NON marcare come lette
        });

        fetch.on('message', (msg, seqno) => {
          let buffer = '';
          let uid = null;

          msg.on('attributes', (attrs) => {
            uid = attrs.uid;
          });

          msg.on('body', (stream) => {
            stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
          });

          msg.on('end', () => {
            emails.push({ seqno, uid, raw: buffer });
          });
        });

        fetch.on('error', reject);
        fetch.on('end', () => resolve(emails));
      });
    });
  });
}

async function parseEmail(rawEmail) {
  const parsed = await simpleParser(rawEmail);
  
  const attachments = (parsed.attachments || []).map(att => ({
    filename: att.filename,
    contentType: att.contentType,
    size: att.size,
    content: att.content.toString('base64')
  })).filter(att => 
    att.contentType?.includes('pdf') || 
    att.contentType?.includes('xml') ||
    att.filename?.match(/\.(pdf|xml|eml)$/i)
  );

  return {
    messageId: parsed.messageId,
    from: parsed.from?.text || '',
    to: parsed.to?.text || '',
    subject: parsed.subject || '',
    date: parsed.date?.toISOString() || new Date().toISOString(),
    hasAttachments: attachments.length > 0,
    attachments,
    textPreview: (parsed.text || '').substring(0, 500)
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, folder = 'INBOX', limit = 20 } = req.body;

  if (!email || !GMAIL_ACCOUNTS[email]) {
    return res.status(400).json({ error: 'Account email non valido', availableAccounts: Object.keys(GMAIL_ACCOUNTS) });
  }

  try {
    if (action === 'list') {
      // Lista email non lette con allegati
      const imap = connectImap(email);
      
      const result = await new Promise((resolve, reject) => {
        imap.once('ready', async () => {
          try {
            const rawEmails = await fetchEmails(imap, folder, limit);
            const parsedEmails = [];
            
            for (const raw of rawEmails) {
              try {
                const parsed = await parseEmail(raw.raw);
                parsed.uid = raw.uid;
                parsed.seqno = raw.seqno;
                // Non includere il contenuto degli allegati nella lista (troppo pesante)
                parsed.attachments = parsed.attachments.map(a => ({
                  filename: a.filename,
                  contentType: a.contentType,
                  size: a.size
                }));
                parsedEmails.push(parsed);
              } catch (e) {
                console.error('Parse error:', e);
              }
            }
            
            imap.end();
            resolve(parsedEmails);
          } catch (e) {
            imap.end();
            reject(e);
          }
        });
        
        imap.once('error', reject);
        imap.connect();
      });

      return res.status(200).json({ success: true, emails: result, count: result.length });

    } else if (action === 'fetch_attachments') {
      // Scarica allegati di una specifica email
      const { uid } = req.body;
      if (!uid) return res.status(400).json({ error: 'UID richiesto' });

      const imap = connectImap(email);
      
      const result = await new Promise((resolve, reject) => {
        imap.once('ready', () => {
          imap.openBox(folder, false, (err) => {
            if (err) { imap.end(); return reject(err); }

            const fetch = imap.fetch([uid], { bodies: '', markSeen: false });
            let buffer = '';

            fetch.on('message', (msg) => {
              msg.on('body', (stream) => {
                stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
              });
            });

            fetch.on('end', async () => {
              try {
                const parsed = await parseEmail(buffer);
                imap.end();
                resolve(parsed);
              } catch (e) {
                imap.end();
                reject(e);
              }
            });

            fetch.on('error', (e) => { imap.end(); reject(e); });
          });
        });
        
        imap.once('error', reject);
        imap.connect();
      });

      return res.status(200).json({ success: true, email: result });

    } else {
      return res.status(400).json({ error: 'Azione non valida. Usa: list, fetch_attachments' });
    }

  } catch (error) {
    console.error('IMAP Error:', error);
    return res.status(500).json({ error: 'Errore connessione email', message: error.message });
  }
}
