do $$
begin
  execute 'drop policy if exists local_dev_allow_societa_select on public.societa';
  execute 'create policy local_dev_allow_societa_select on public.societa for select to anon, authenticated using (attiva = true)';
end $$;
