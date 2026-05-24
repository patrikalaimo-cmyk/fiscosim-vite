# CORE-CLOSURE-10 — Consultazione Prima Nota read-only guard

Consultazione Prima Nota è consolidata come modulo read-only.

- non deve esporre write path diretti;
- modifica, delete e storno non devono scrivere direttamente;
- eventuali future modifiche o storni devono passare dal commit atomico comune;
- export, filtri e dettaglio restano operativi in sola lettura;
- il guard statico dedicato è `scripts/dev/test-consultazione-prima-nota-no-write.mjs`.