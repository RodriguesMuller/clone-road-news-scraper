-- Limite individual de consultas do Minha Rota por pacote.
-- Pode ser executado novamente com seguranca no SQL Editor do Supabase.

begin;

alter table public.packages
  add column if not exists monthly_route_limit integer not null default 30;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.packages'::regclass
      and conname = 'packages_route_limit_nonnegative_check'
  ) then
    alter table public.packages
      add constraint packages_route_limit_nonnegative_check
      check (monthly_route_limit >= 0) not valid;
  end if;
end $$;

comment on column public.packages.monthly_route_limit is
  'Quantidade mensal de consultas do Minha Rota permitida para cada usuario vinculado ao pacote.';

create index if not exists usage_events_route_user_month_idx
  on public.usage_events(user_id, created_at desc)
  where event_type = 'route_analysis';

notify pgrst, 'reload schema';

commit;
