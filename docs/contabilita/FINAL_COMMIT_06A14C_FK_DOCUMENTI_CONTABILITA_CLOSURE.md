# FINAL-COMMIT-06A.14C - Chiusura guard/documento FK `public.documenti_contabilita`

## Contesto

La base bootstrap di `public.documenti_contabilita` è stata corretta in [FINAL-COMMIT-06A.14B](../../supabase/migrations/20260412090000_documenti_contabilita_base_bootstrap.sql) rimuovendo il vincolo prematuro verso `public.societa`.

## Correzione applicata

La migration base non contiene più:

- `societa_id uuid references public.societa(id) on delete cascade`

Ora `societa_id` è una colonna semplice, così la tabella può essere materializzata nel grafo migration prima della creazione di `public.societa`.

## Esito della guardia/documento

- Il blocco tecnico che impediva il bootstrap locale è stato rimosso.
- La documentazione di fase è stata riallineata al comportamento reale della migration.
- Non sono stati introdotti FK esterni aggiuntivi nella base bootstrap.

## Rischio residuo

Se una migration futura richiederà un FK verso `public.societa`, dovrà farlo solo dopo la sua materializzazione nel grafo, non nella base bootstrap di `documenti_contabilita`.

## Verdetto finale

**FINAL-COMMIT-06A.14C: A**
