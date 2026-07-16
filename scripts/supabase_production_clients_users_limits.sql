-- Fluxo manual de clientes, usuarios, pacotes e limites individuais.
-- Migration de producao: nao cria seeds, clientes, pacotes, usuarios ou vinculos.
-- Pode ser aplicada novamente com seguranca.

begin;

create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients add column if not exists company_name text;
alter table public.clients add column if not exists status text default 'active';
alter table public.clients add column if not exists notes text;
alter table public.clients add column if not exists created_at timestamptz default now();
alter table public.clients add column if not exists updated_at timestamptz default now();

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists cpf text;
alter table public.profiles add column if not exists client_id uuid;

alter table public.packages add column if not exists max_users integer not null default 0;
alter table public.packages add column if not exists can_generate_individual_summary boolean;
update public.packages
set can_generate_individual_summary = coalesce(can_generate_individual_summary, can_generate_image, false)
where can_generate_individual_summary is null;
alter table public.packages alter column can_generate_individual_summary set default false;
alter table public.packages alter column can_generate_individual_summary set not null;

alter table public.usage_events add column if not exists client_id uuid;
alter table public.usage_events add column if not exists package_id uuid;
alter table public.audit_logs add column if not exists client_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_client_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_client_id_fkey foreign key (client_id)
      references public.clients(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.usage_events'::regclass and conname = 'usage_events_client_id_fkey'
  ) then
    alter table public.usage_events
      add constraint usage_events_client_id_fkey foreign key (client_id)
      references public.clients(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.usage_events'::regclass and conname = 'usage_events_package_id_fkey'
  ) then
    alter table public.usage_events
      add constraint usage_events_package_id_fkey foreign key (package_id)
      references public.packages(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.audit_logs'::regclass and conname = 'audit_logs_client_id_fkey'
  ) then
    alter table public.audit_logs
      add constraint audit_logs_client_id_fkey foreign key (client_id)
      references public.clients(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.clients'::regclass and conname = 'clients_status_check'
  ) then
    alter table public.clients add constraint clients_status_check
      check (status in ('active', 'inactive', 'blocked')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_cpf_format_check'
  ) then
    alter table public.profiles add constraint profiles_cpf_format_check
      check (cpf is null or cpf ~ '^[0-9]{11}$') not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.packages'::regclass and conname = 'packages_limits_nonnegative_check'
  ) then
    alter table public.packages add constraint packages_limits_nonnegative_check
      check (
        monthly_news_limit >= 0
        and monthly_ai_summary_limit >= 0
        and monthly_pdf_limit >= 0
        and max_users >= 0
      ) not valid;
  end if;
end $$;

create unique index if not exists clients_company_name_lower_uidx
  on public.clients(lower(trim(company_name)));
create unique index if not exists profiles_cpf_uidx
  on public.profiles(cpf) where cpf is not null;
create index if not exists profiles_client_role_status_idx
  on public.profiles(client_id, role, status);
create index if not exists usage_events_user_month_idx
  on public.usage_events(user_id, created_at desc);
create index if not exists usage_events_client_month_idx
  on public.usage_events(client_id, created_at desc);
create index if not exists audit_logs_client_created_idx
  on public.audit_logs(client_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create or replace function public.get_user_role(check_user_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p
  where p.id = check_user_id and p.status = 'active';
$$;

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_user_role(check_user_id) = 'admin', false);
$$;

create or replace function public.is_manager_or_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_user_role(check_user_id) in ('admin', 'manager'), false);
$$;

create or replace function public.can_manage_target_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id <> auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.profiles target
        where target.id = target_user_id
          and public.get_user_role(auth.uid()) = 'manager'
          and target.role in ('client', 'manager')
      )
    );
$$;

revoke all on function public.get_user_role(uuid) from public;
revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_manager_or_admin(uuid) from public;
revoke all on function public.can_manage_target_user(uuid) from public;
grant execute on function public.get_user_role(uuid) to authenticated, service_role;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.is_manager_or_admin(uuid) to authenticated, service_role;
grant execute on function public.can_manage_target_user(uuid) to authenticated, service_role;

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.packages enable row level security;
alter table public.user_packages enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_logs enable row level security;

-- Substitui somente as policies desta migration e preserva policies preexistentes.
drop policy if exists clients_select_authorized on public.clients;
drop policy if exists clients_write_management on public.clients;
drop policy if exists profiles_select_authorized on public.profiles;
drop policy if exists profiles_insert_management on public.profiles;
drop policy if exists profiles_update_management on public.profiles;
drop policy if exists profiles_delete_management on public.profiles;
drop policy if exists packages_select_authorized on public.packages;
drop policy if exists packages_write_management on public.packages;
drop policy if exists user_packages_select_authorized on public.user_packages;
drop policy if exists user_packages_write_management on public.user_packages;
drop policy if exists usage_events_select_authorized on public.usage_events;
drop policy if exists usage_events_insert_own on public.usage_events;
drop policy if exists usage_events_delete_admin on public.usage_events;
drop policy if exists audit_logs_select_management on public.audit_logs;
drop policy if exists audit_logs_insert_management on public.audit_logs;

create policy clients_select_authorized
on public.clients for select to authenticated
using (
  public.is_manager_or_admin()
  or id = (select p.client_id from public.profiles p where p.id = auth.uid())
);

create policy clients_write_management
on public.clients for all to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy profiles_select_authorized
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (public.get_user_role(auth.uid()) = 'manager' and role in ('client', 'manager'))
);

create policy profiles_insert_management
on public.profiles for insert to authenticated
with check (
  public.is_admin()
  or (public.get_user_role(auth.uid()) = 'manager' and role in ('client', 'manager'))
);

create policy profiles_update_management
on public.profiles for update to authenticated
using (public.can_manage_target_user(id))
with check (
  public.is_admin()
  or (public.get_user_role(auth.uid()) = 'manager' and role in ('client', 'manager'))
);

create policy profiles_delete_management
on public.profiles for delete to authenticated
using (public.can_manage_target_user(id));

create policy packages_select_authorized
on public.packages for select to authenticated
using (is_active = true or public.is_manager_or_admin());

create policy packages_write_management
on public.packages for all to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy user_packages_select_authorized
on public.user_packages for select to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or (
    public.get_user_role(auth.uid()) = 'manager'
    and exists (select 1 from public.profiles target where target.id = user_id and target.role in ('client', 'manager'))
  )
);

create policy user_packages_write_management
on public.user_packages for all to authenticated
using (public.can_manage_target_user(user_id))
with check (public.can_manage_target_user(user_id));

create policy usage_events_select_authorized
on public.usage_events for select to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or (
    public.get_user_role(auth.uid()) = 'manager'
    and exists (select 1 from public.profiles target where target.id = user_id and target.role in ('client', 'manager'))
  )
);

create policy usage_events_insert_own
on public.usage_events for insert to authenticated
with check (user_id = auth.uid());

create policy usage_events_delete_admin
on public.usage_events for delete to authenticated
using (public.is_admin());

create policy audit_logs_select_management
on public.audit_logs for select to authenticated
using (public.is_admin() or actor_user_id = auth.uid());

create policy audit_logs_insert_management
on public.audit_logs for insert to authenticated
with check (public.is_manager_or_admin());

revoke all on public.clients, public.profiles, public.packages,
  public.user_packages, public.usage_events, public.audit_logs from anon;

grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.packages to authenticated;
grant select, insert, update, delete on public.user_packages to authenticated;
grant select, insert, delete on public.usage_events to authenticated;
grant select, insert on public.audit_logs to authenticated;

comment on column public.profiles.cpf is
  'CPF normalizado com 11 digitos. Nao expor em listagens; mascarar na interface.';
comment on column public.profiles.client_id is
  'Vinculo formal do usuario com a empresa. company_name e apenas compatibilidade visual.';
comment on column public.packages.can_generate_individual_summary is
  'Controla o resumo individual de noticia por usuario.';

commit;

-- Rollback estrutural, se necessario, deve remover primeiro as policies novas.
-- As colunas nao sao removidas automaticamente para preservar dados pessoais e historico.
