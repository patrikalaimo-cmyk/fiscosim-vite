-- Mastrini: saldi per conto da righe in accounting_entries.data->rows
-- Bilancio: stato patrimoniale (piano patrimoniale) e conto economico (costi/ricavi)

-- Piano dei conti (minimo se non già importato da schema_contabilita.sql)
create table if not exists public.piano_conti (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid,
  codice text not null default '',
  descrizione text not null default '',
  tipo text not null default 'patrimoniale',
  natura text,
  attivo boolean default true,
  created_at timestamptz default now()
);

-- Cast sicuro importi da JSON riga scrittura
create or replace function public._ae_row_amount(j jsonb, key text)
returns numeric
language sql
immutable
as $$
  select coalesce(
    case
      when j ? key and jsonb_typeof(j -> key) = 'number'
        then (j -> key)::text::numeric
      when nullif(trim(j ->> key), '') is not null
        then replace(replace(trim(j ->> key), ',', '.'), ' ', '')::numeric
      else 0::numeric
    end,
    0::numeric
  );
$$;

-- Righe estratte da tutte le scritture (solo status che hanno righe dettaglio utili)
create or replace view public.v_accounting_entry_righe as
select
  ae.id as accounting_entry_id,
  ae.document_id,
  ae.status as entry_status,
  ae.created_at as entry_created_at,
  coalesce(nullif(trim(r ->> 'conto_id'), ''), nullif(trim(r ->> 'conto'), ''), 'SCONOSCIUTO') as conto_id,
  public._ae_row_amount(r, 'dare') as dare,
  public._ae_row_amount(r, 'avere') as avere
from public.accounting_entries ae
cross join lateral jsonb_array_elements(
  case
    when ae.data ? 'rows' and jsonb_typeof(ae.data -> 'rows') = 'array'
      then ae.data -> 'rows'
    else '[]'::jsonb
  end
) as r;

comment on view public.v_accounting_entry_righe is 'Righe normalizzate da accounting_entries per aggregazioni mastrini/bilancio';

-- Mastrini: totali e saldo per conto (saldo = dare - avere)
create or replace view public.mastrini as
select
  conto_id,
  round(sum(dare)::numeric, 2) as totale_dare,
  round(sum(avere)::numeric, 2) as totale_avere,
  round((sum(dare) - sum(avere))::numeric, 2) as saldo
from public.v_accounting_entry_righe
group by conto_id;

comment on view public.mastrini is 'Saldi contabili aggregati per conto_id (da righe accounting_entries)';

-- Bilancio: stato patrimoniale (conti patrimoniali)
create or replace view public.bilancio_stato_patrimoniale as
select
  m.conto_id,
  pc.id as piano_conti_id,
  pc.codice as conto_codice,
  pc.descrizione as conto_descrizione,
  pc.natura,
  m.totale_dare,
  m.totale_avere,
  m.saldo
from public.mastrini m
left join public.piano_conti pc
  on pc.id::text = m.conto_id
  or (
    m.conto_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and pc.codice = m.conto_id
  )
where pc.id is null
   or lower(pc.tipo) = 'patrimoniale';

comment on view public.bilancio_stato_patrimoniale is 'Mastrini limitati ai conti patrimoniali (o non classificati se piano assente)';

-- Bilancio: conto economico (costi e ricavi)
create or replace view public.bilancio_conto_economico as
select
  m.conto_id,
  pc.id as piano_conti_id,
  pc.codice as conto_codice,
  pc.descrizione as conto_descrizione,
  pc.natura,
  m.totale_dare,
  m.totale_avere,
  m.saldo
from public.mastrini m
inner join public.piano_conti pc
  on (
    pc.id::text = m.conto_id
    or (
      m.conto_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and pc.codice = m.conto_id
    )
  )
where lower(pc.tipo) = 'economico';

comment on view public.bilancio_conto_economico is 'Mastrini limitati ai conti economici (costi/ricavi)';

-- Vista unica "bilancio" con sezione esplicita (per API / export)
create or replace view public.bilancio as
select
  'stato_patrimoniale'::text as sezione,
  conto_id,
  piano_conti_id,
  conto_codice,
  conto_descrizione,
  natura,
  totale_dare,
  totale_avere,
  saldo
from public.bilancio_stato_patrimoniale
union all
select
  'conto_economico'::text as sezione,
  conto_id,
  piano_conti_id,
  conto_codice,
  conto_descrizione,
  natura,
  totale_dare,
  totale_avere,
  saldo
from public.bilancio_conto_economico;

comment on view public.bilancio is 'Unione stato patrimoniale e conto economico con colonna sezione';

grant select on public.v_accounting_entry_righe to anon, authenticated;
grant select on public.mastrini to anon, authenticated;
grant select on public.bilancio_stato_patrimoniale to anon, authenticated;
grant select on public.bilancio_conto_economico to anon, authenticated;
grant select on public.bilancio to anon, authenticated;
