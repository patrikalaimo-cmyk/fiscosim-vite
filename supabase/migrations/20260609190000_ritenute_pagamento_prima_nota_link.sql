alter table if exists public.ritenute_dacconto
  add column if not exists prima_nota_pagamento_id uuid references public.prima_nota(id);

create index if not exists idx_ritenute_dacconto_prima_nota_pagamento
  on public.ritenute_dacconto(prima_nota_pagamento_id);
