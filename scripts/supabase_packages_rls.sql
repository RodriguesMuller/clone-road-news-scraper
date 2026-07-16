-- Correcao de RLS e limites de pacotes do Road News.
-- Rode este arquivo no SQL Editor do Supabase.

alter table if exists public.profiles drop constraint if exists profiles_role_check;
alter table if exists public.profiles
  add constraint profiles_role_check check (role in ('admin', 'manager', 'client'));

alter table if exists public.usage_events
  add column if not exists client_id uuid,
  add column if not exists package_id uuid references public.packages(id) on delete set null;

alter table if exists public.packages
  add column if not exists max_users integer not null default 0;

create index if not exists usage_events_package_month_idx on public.usage_events(package_id, created_at);

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

alter table public.packages enable row level security;
alter table public.user_packages enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_logs enable row level security;

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

grant execute on function public.is_manager_or_admin(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.get_active_package(uuid) to authenticated;
grant execute on function public.get_monthly_usage(uuid, text) to authenticated;
grant execute on function public.can_use_feature(uuid, text) to authenticated;

insert into public.packages (
  name,
  description,
  monthly_news_limit,
  monthly_ai_summary_limit,
  monthly_pdf_limit,
  max_users,
  can_access_map,
  can_generate_image,
  can_generate_weekly_summary,
  is_active
)
select
  'Teste',
  'Pacote temporario para clientes avaliarem a plataforma Road News.',
  100,
  10,
  5,
  2,
  true,
  true,
  true,
  true
where not exists (
  select 1 from public.packages where name = 'Teste'
);
