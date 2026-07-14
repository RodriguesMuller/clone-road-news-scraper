-- Complemento para os ambientes client, manager e developer.
-- Execute scripts/supabase_auth_access.sql primeiro se as tabelas base ainda nao existirem.

do $$
declare
  constraint_name text;
begin
  select c.conname
    into constraint_name
  from pg_constraint c
  where c.conrelid = 'public.profiles'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%role%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'manager', 'client'));

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
  elsif feature_name = 'image_generation' then
    return pkg.can_generate_image;
  elsif feature_name = 'weekly_summary' then
    return pkg.can_generate_weekly_summary;
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

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_manager_or_admin());

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
on public.profiles for insert
to authenticated
with check (public.is_admin() or (public.is_manager_or_admin() and role = 'client'));

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_admin() or (public.is_manager_or_admin() and role = 'client'))
with check (public.is_admin() or (public.is_manager_or_admin() and role = 'client'));

drop policy if exists "packages_select_admin" on public.packages;
create policy "packages_select_admin"
on public.packages for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "packages_write_admin" on public.packages;
create policy "packages_write_admin"
on public.packages for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "user_packages_select_own_or_admin" on public.user_packages;
create policy "user_packages_select_own_or_admin"
on public.user_packages for select
to authenticated
using (user_id = auth.uid() or public.is_manager_or_admin());

drop policy if exists "user_packages_write_admin" on public.user_packages;
create policy "user_packages_write_admin"
on public.user_packages for all
to authenticated
using (
  public.is_admin()
  or (
    public.is_manager_or_admin()
    and exists (
      select 1 from public.profiles p
      where p.id = user_id
        and p.role = 'client'
    )
  )
)
with check (
  public.is_admin()
  or (
    public.is_manager_or_admin()
    and exists (
      select 1 from public.profiles p
      where p.id = user_id
        and p.role = 'client'
    )
  )
);

drop policy if exists "usage_events_select_admin" on public.usage_events;
create policy "usage_events_select_admin"
on public.usage_events for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "usage_events_insert_admin" on public.usage_events;
create policy "usage_events_insert_admin"
on public.usage_events for insert
to authenticated
with check (public.is_manager_or_admin());

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

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  document text,
  contact_name text,
  contact_email text,
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked')),
  package_id uuid references public.packages(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null default 'rss',
  category text,
  url text,
  frequency_minutes integer not null default 120,
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.platform_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text,
  status text not null default 'not_configured' check (status in ('connected', 'active', 'not_configured', 'error')),
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email', 'whatsapp')),
  threshold_percent integer not null default 80,
  event_type text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_status_idx on public.clients(status);
create index if not exists sources_status_idx on public.sources(status);
create index if not exists platform_integrations_status_idx on public.platform_integrations(status);
create index if not exists platform_events_created_idx on public.platform_events(created_at desc);
create index if not exists notification_rules_client_idx on public.notification_rules(client_id, is_active);

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists sources_set_updated_at on public.sources;
create trigger sources_set_updated_at before update on public.sources
for each row execute function public.set_updated_at();

drop trigger if exists platform_integrations_set_updated_at on public.platform_integrations;
create trigger platform_integrations_set_updated_at before update on public.platform_integrations
for each row execute function public.set_updated_at();

drop trigger if exists notification_rules_set_updated_at on public.notification_rules;
create trigger notification_rules_set_updated_at before update on public.notification_rules
for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
alter table public.sources enable row level security;
alter table public.platform_integrations enable row level security;
alter table public.platform_events enable row level security;
alter table public.notification_rules enable row level security;

drop policy if exists "clients_manager_access" on public.clients;
create policy "clients_manager_access"
on public.clients for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "sources_manager_access" on public.sources;
create policy "sources_manager_access"
on public.sources for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "platform_events_manager_access" on public.platform_events;
create policy "platform_events_manager_access"
on public.platform_events for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "platform_integrations_manager_access" on public.platform_integrations;
create policy "platform_integrations_manager_access"
on public.platform_integrations for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "notification_rules_manager_access" on public.notification_rules;
create policy "notification_rules_manager_access"
on public.notification_rules for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

grant execute on function public.is_manager_or_admin(uuid) to authenticated;
grant execute on function public.get_my_access() to authenticated;
grant execute on function public.can_use_feature(uuid, text) to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.sources to authenticated;
grant select, insert, update, delete on public.platform_integrations to authenticated;
grant select, insert, update, delete on public.platform_events to authenticated;
grant select, insert, update, delete on public.notification_rules to authenticated;
