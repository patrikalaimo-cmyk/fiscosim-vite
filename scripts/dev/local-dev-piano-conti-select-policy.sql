-- Local-only dev fix for Registrazione manuale piano conti read path.
-- Apply only on the local Supabase database.

drop policy if exists local_dev_allow_piano_conti_select on public.piano_conti;

create policy local_dev_allow_piano_conti_select
on public.piano_conti
for select
to anon, authenticated
using (attivo = true);
