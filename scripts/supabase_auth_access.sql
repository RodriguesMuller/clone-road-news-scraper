create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'client' check (role in ('admin', 'manager', 'client')),
  company_name text,
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  monthly_news_limit integer not null default 200,
  monthly_route_limit integer not null default 30,
  monthly_ai_summary_limit integer not null default 50,
  monthly_pdf_limit integer not null default 20,
  max_users integer not null default 0,
  can_access_map boolean not null default true,
  can_generate_image boolean not null default true,
  can_generate_weekly_summary boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  news_id uuid,
  tokens_input integer,
  tokens_output integer,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.profiles drop constraint if exists profiles_role_check;
alter table if exists public.profiles
  add constraint profiles_role_check check (role in ('admin', 'manager', 'client'));

alter table if exists public.usage_events
  add column if not exists client_id uuid,
  add column if not exists package_id uuid references public.packages(id) on delete set null;

alter table if exists public.packages
  add column if not exists max_users integer not null default 0,
  add column if not exists monthly_route_limit integer not null default 30;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on column public.packages.monthly_news_limit is 'Limite mensal de consultas/carregamentos do painel de noticias.';
comment on column public.packages.monthly_route_limit is 'Limite mensal individual de consultas do Minha Rota.';
comment on column public.packages.monthly_ai_summary_limit is 'Limite mensal somado para resumo semanal, resumo de noticia e geracao de imagem com IA.';
comment on column public.packages.monthly_pdf_limit is 'Limite mensal de exportacoes de PDF.';
comment on column public.packages.max_users is 'Limite de usuarios vinculados ao pacote. Zero significa ilimitado.';

create index if not exists profiles_role_status_idx on public.profiles(role, status);
create index if not exists packages_active_idx on public.packages(is_active);
create index if not exists user_packages_user_active_idx on public.user_packages(user_id, is_active, starts_at, ends_at);
create index if not exists usage_events_user_type_month_idx on public.usage_events(user_id, event_type, created_at);
create index if not exists usage_events_package_month_idx on public.usage_events(package_id, created_at);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists packages_set_updated_at on public.packages;
create trigger packages_set_updated_at before update on public.packages
for each row execute function public.set_updated_at();

drop trigger if exists user_packages_set_updated_at on public.user_packages;
create trigger user_packages_set_updated_at before update on public.user_packages
for each row execute function public.set_updated_at();

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = check_user_id
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;

create or replace function public.is_manager_or_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = check_user_id
      and p.role in ('admin', 'manager')
      and p.status = 'active'
  );
$$;

create or replace function public.get_user_role(check_user_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = check_user_id;
$$;

create or replace function public.get_active_package(check_user_id uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select up.package_id
  from public.user_packages up
  join public.packages pkg on pkg.id = up.package_id
  where up.user_id = check_user_id
    and up.is_active = true
    and pkg.is_active = true
    and up.starts_at <= now()
    and (up.ends_at is null or up.ends_at > now())
  order by up.created_at desc
  limit 1;
$$;

create or replace function public.get_monthly_usage(check_user_id uuid, check_event_type text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.usage_events ue
  where ue.user_id = check_user_id
    and ue.event_type = check_event_type
    and ue.created_at >= date_trunc('month', now());
$$;

create or replace function public.can_use_feature(check_user_id uuid, feature_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pkg public.packages%rowtype;
begin
  if public.is_manager_or_admin(check_user_id) then
    return true;
  end if;

  select p.*
    into pkg
  from public.user_packages up
  join public.packages p on p.id = up.package_id
  where up.user_id = check_user_id
    and up.is_active = true
    and p.is_active = true
    and up.starts_at <= now()
    and (up.ends_at is null or up.ends_at > now())
  order by up.created_at desc
  limit 1;

  if pkg.id is null then
    return false;
  end if;

  if feature_name = 'map' then
    return pkg.can_access_map;
  elsif feature_name = 'route_analysis' then
    return pkg.monthly_route_limit > public.get_monthly_usage(check_user_id, 'route_analysis');
  elsif feature_name = 'image_generation' then
    return pkg.can_generate_image
      and pkg.monthly_ai_summary_limit > (
        select count(*)::integer
        from public.usage_events ue
        where ue.user_id = check_user_id
          and ue.event_type in ('ai_summary', 'image_generation', 'weekly_summary')
          and ue.created_at >= date_trunc('month', now())
      );
  elsif feature_name = 'weekly_summary' then
    return pkg.can_generate_weekly_summary
      and pkg.monthly_ai_summary_limit > (
        select count(*)::integer
        from public.usage_events ue
        where ue.user_id = check_user_id
          and ue.event_type in ('ai_summary', 'image_generation', 'weekly_summary')
          and ue.created_at >= date_trunc('month', now())
      );
  elsif feature_name = 'pdf_generation' then
    return pkg.monthly_pdf_limit > public.get_monthly_usage(check_user_id, 'pdf_generation');
  elsif feature_name = 'ai_summary' then
    return pkg.monthly_ai_summary_limit > (
      select count(*)::integer
      from public.usage_events ue
      where ue.user_id = check_user_id
        and ue.event_type in ('ai_summary', 'image_generation', 'weekly_summary')
        and ue.created_at >= date_trunc('month', now())
    );
  elsif feature_name = 'news_view' then
    return pkg.monthly_news_limit > public.get_monthly_usage(check_user_id, 'news_view');
  end if;

  return false;
end;
$$;

create or replace function public.get_my_access()
returns table (
  role text,
  status text,
  can_access_map boolean,
  can_generate_image boolean,
  can_generate_weekly_summary boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.role,
    p.status,
    case when p.role in ('admin', 'manager') then true else coalesce(pkg.can_access_map, false) end,
    case when p.role in ('admin', 'manager') then true else coalesce(pkg.can_generate_image, false) end,
    case when p.role in ('admin', 'manager') then true else coalesce(pkg.can_generate_weekly_summary, false) end
  from public.profiles p
  left join public.user_packages up
    on up.user_id = p.id
   and up.is_active = true
   and up.starts_at <= now()
   and (up.ends_at is null or up.ends_at > now())
  left join public.packages pkg
    on pkg.id = up.package_id
   and pkg.is_active = true
  where p.id = auth.uid()
  order by up.created_at desc nulls last
  limit 1;
$$;

alter table public.profiles enable row level security;
alter table public.packages enable row level security;
alter table public.user_packages enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
on public.profiles for insert
to authenticated
with check (public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "packages_select_admin" on public.packages;
drop policy if exists "packages_write_admin" on public.packages;
drop policy if exists "packages_select_manager_or_own" on public.packages;
create policy "packages_select_manager_or_own"
on public.packages for select
to authenticated
using (
  public.is_manager_or_admin()
  or id = public.get_active_package(auth.uid())
);

drop policy if exists "packages_insert_manager" on public.packages;
create policy "packages_insert_manager"
on public.packages for insert
to authenticated
with check (public.is_manager_or_admin());

drop policy if exists "packages_update_manager" on public.packages;
create policy "packages_update_manager"
on public.packages for update
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "packages_delete_admin" on public.packages;
create policy "packages_delete_admin"
on public.packages for delete
to authenticated
using (public.is_admin());

drop policy if exists "user_packages_select_own_or_admin" on public.user_packages;
create policy "user_packages_select_own_or_admin"
on public.user_packages for select
to authenticated
using (user_id = auth.uid() or public.is_manager_or_admin());

drop policy if exists "user_packages_write_admin" on public.user_packages;
create policy "user_packages_write_admin"
on public.user_packages for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "usage_events_select_admin" on public.usage_events;
create policy "usage_events_select_admin"
on public.usage_events for select
to authenticated
using (user_id = auth.uid() or public.is_manager_or_admin());

drop policy if exists "usage_events_insert_admin" on public.usage_events;
create policy "usage_events_insert_admin"
on public.usage_events for insert
to authenticated
with check (user_id = auth.uid() or public.is_manager_or_admin());

drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin"
on public.audit_logs for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "audit_logs_insert_admin" on public.audit_logs;
create policy "audit_logs_insert_admin"
on public.audit_logs for insert
to authenticated
with check (public.is_manager_or_admin());

grant execute on function public.get_my_access() to authenticated;
grant execute on function public.can_use_feature(uuid, text) to authenticated;
grant execute on function public.get_monthly_usage(uuid, text) to authenticated;
grant execute on function public.get_active_package(uuid) to authenticated;
grant execute on function public.get_user_role(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_manager_or_admin(uuid) to authenticated;

insert into public.packages (
  name,
  description,
  monthly_news_limit,
  monthly_ai_summary_limit,
  monthly_pdf_limit,
  max_users,
  can_access_map,
  can_generate_image,
  can_generate_weekly_summary
) 
select *
from (values
  ('Teste', 'Pacote temporario para clientes avaliarem a plataforma Road News.', 100, 10, 5, 2, true, true, true),
  ('Pacote A', 'Operacao inicial com mapa, PDF e resumos semanais.', 200, 50, 20, 0, true, false, true),
  ('Pacote B', 'Operacao ampliada com resumo individual e maior limite de IA.', 500, 100, 50, 0, true, true, true)
) as seed (
  name,
  description,
  monthly_news_limit,
  monthly_ai_summary_limit,
  monthly_pdf_limit,
  max_users,
  can_access_map,
  can_generate_image,
  can_generate_weekly_summary
)
where not exists (
  select 1 from public.packages existing where existing.name = seed.name
);
