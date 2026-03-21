# FiscoSim v5 — Deploy Guide

## Setup locale

```bash
# 1. Installa dipendenze
npm install

# 2. Crea .env
cp .env.example .env
# (le chiavi sono già nel file)

# 3. Avvia dev server
npm run dev
# → http://localhost:3000
```

## Deploy Vercel

```bash
# Prima volta — collega al progetto esistente
npx vercel link
# Scegli: patriks-projects → project-g8g37

# Aggiungi env vars su Vercel (una sola volta)
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
npx vercel env add ANTHROPIC_API_KEY production
npx vercel env add GMAIL_USER production
npx vercel env add GMAIL_APP_PASS production

# Deploy
npm run build
npx vercel --prod
```

## Struttura

```
src/
├── App.jsx              — routing principale
├── main.jsx             — entry point
├── assets/global.css    — design system completo
├── lib/
│   ├── supabase.js      — client Supabase
│   ├── utils.js         — fmt, fmtDate, loadScript, canLeggi
│   └── nav.js           — NAV + PERMESSI_MODULI
├── hooks/
│   └── useAuth.jsx      — AuthContext (login/logout/ruolo)
├── components/
│   ├── Sidebar.jsx
│   ├── Login.jsx
│   └── WIPBanner.jsx
└── modules/             — un file per modulo
    ├── ModuloDashboard.jsx
    ├── ModuloClienti.jsx
    ├── ModuloIVA.jsx
    ├── ModuloF24.jsx
    ├── ModuloAgeCon.jsx
    ├── ModuloCU.jsx
    ├── ModuloContabilita.jsx
    └── ... (tutti gli altri)

api/                     — Vercel serverless functions
├── claude-proxy.js
├── send-email.js
├── split-cu.js
├── banking.js
├── read-email.js
└── ...
```

## Aggiungere un nuovo modulo

1. Crea `src/modules/ModuloNome.jsx` con `export default function ModuloNome()`
2. Aggiungi lazy import in `App.jsx`
3. Aggiungi entry in `MODULE_MAP` in `App.jsx`
4. Aggiungi alla nav in `src/lib/nav.js`
5. Aggiungi ai permessi in `PERMESSI_MODULI` in `nav.js`
