# FiscoSim documentation

This folder contains the **documentation structure** for FiscoSim (outline, table of contents, section descriptions). **Full prose for each section is not written yet**; use these files as the authoritative map for future authoring.

| Document | Audience | File |
|----------|----------|------|
| Operational Manual (outline) | Authors / structure only | [operational-manual.md](./operational-manual.md) |
| **Operational Manual — accounting operators (full)** | Staff using Import, Prima nota, IVA, F24 | [operational-manual-accounting-operators.md](./operational-manual-accounting-operators.md) |
| Technical Manual (outline) | Authors / structure only | [technical-manual.md](./technical-manual.md) |
| **Technical Manual — developers (full)** | Pipeline, AI, learning, fiscal DB, Copilot, test engine | [technical-manual-developers.md](./technical-manual-developers.md) |
| Testing Guide (outline) | Authors / structure only | [testing-guide.md](./testing-guide.md) |
| **Testing Guide — step-by-step (full)** | Manual + E2E + AI/Copilot checks | [testing-guide-full.md](./testing-guide-full.md) |

## How to use

1. **Authors**: expand each numbered section into full content; keep the TOC in sync when adding or removing sections.
2. **Reviewers**: use the TOC to verify coverage against product modules (`src/modules`) and runtime services (`services/`, `api/`).
3. **Versioning**: when the app gains a major module or API surface, add a TOC entry and a one-line description here first, then write the body.

## Product context (for alignment)

- **Frontend**: React (Vite), Supabase client, modular navigation (`src/App.jsx`, `src/shared/constants` → `NAV`).
- **Backend (local/dev)**: Node scripts and API routes (`api/`, `scripts/dev-api.mjs`) calling shared `services/`.
- **Data**: Supabase (PostgreSQL, auth, storage, RLS).
