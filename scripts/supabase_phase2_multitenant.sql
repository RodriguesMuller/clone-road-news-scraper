-- Fase 2: modelo SaaS multiempresa e isolamento por tenant.
-- Aplicar depois dos scripts base, primeiro e somente no Supabase de staging.

begin;

create extension if not exists pgcrypto;

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

alter table public.clients add column if not exists slug text;

update public.clients
set slug = lower(regexp_replace(trim(company_name), '[^a-zA-Z0-9]+', '-', 'g'))
where nullif(trim(slug), '') is null;

create unique index if not exists clients_slug_uidx on public.clients(slug);

insert into public.packages (
  name, description, monthly_news_limit, monthly_ai_summary_limit,
  monthly_pdf_limit, max_users, can_access_map, can_generate_image,
  can_generate_weekly_summary, is_active
)
select 'Teste', 'Pacote de validacao exclusivo do staging.', 100, 10, 5, 2, true, true, true, true
where not exists (select 1 from public.packages where name = 'Teste');

insert into public.clients (
  slug, company_name, contact_name, contact_email, status, package_id, notes
)
values
  (
    'road-news-staging', 'Road News Staging', 'Administracao Staging',
    'staging@road-news.invalid', 'active',
    (select id from public.packages where name = 'Teste' order by created_at limit 1),
    'Tenant tecnico e ficticio do ambiente de staging.'
  ),
  (
    'cliente-demonstracao-a', 'Cliente Demonstracao A', 'Operacao Cliente A',
    'cliente-a@road-news.invalid', 'active',
    (select id from public.packages where name = 'Teste' order by created_at limit 1),
    'Tenant ficticio para validar isolamento multiempresa.'
  ),
  (
    'cliente-demonstracao-b', 'Cliente Demonstracao B', 'Operacao Cliente B',
    'cliente-b@road-news.invalid', 'active',
    (select id from public.packages where name = 'Teste' order by created_at limit 1),
    'Tenant ficticio para validar isolamento multiempresa.'
  )
on conflict (slug) do update set
  company_name = excluded.company_name,
  contact_name = excluded.contact_name,
  contact_email = excluded.contact_email,
  status = excluded.status,
  package_id = excluded.package_id,
  notes = excluded.notes,
  updated_at = now();

alter table public.profiles add column if not exists client_id uuid;
alter table public.sources add column if not exists client_id uuid;
alter table public.usage_events add column if not exists client_id uuid;
alter table public.audit_logs add column if not exists client_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_client_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_client_id_fkey foreign key (client_id)
      references public.clients(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sources'::regclass and conname = 'sources_client_id_fkey'
  ) then
    alter table public.sources
      add constraint sources_client_id_fkey foreign key (client_id)
      references public.clients(id) on delete cascade;
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
    where conrelid = 'public.audit_logs'::regclass and conname = 'audit_logs_client_id_fkey'
  ) then
    alter table public.audit_logs
      add constraint audit_logs_client_id_fkey foreign key (client_id)
      references public.clients(id) on delete set null;
  end if;
end $$;

update public.profiles p
set client_id = c.id,
    company_name = c.company_name
from public.clients c
where p.email = 'matheusmullercontato+staging@gmail.com'
  and c.slug = 'road-news-staging';

update public.profiles p
set client_id = c.id,
    company_name = coalesce(nullif(p.company_name, ''), c.company_name)
from public.clients c
where p.client_id is null
  and c.slug = 'road-news-staging';

alter table public.profiles alter column client_id set not null;

update public.usage_events ue
set client_id = p.client_id
from public.profiles p
where ue.user_id = p.id and ue.client_id is null;

update public.audit_logs al
set client_id = p.client_id
from public.profiles p
where al.actor_user_id = p.id and al.client_id is null;

create table if not exists public.saved_news (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  news_id bigint not null references public.news(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, news_id)
);

create index if not exists profiles_client_role_status_idx
  on public.profiles(client_id, role, status);
create index if not exists usage_events_client_month_idx
  on public.usage_events(client_id, created_at desc);
create index if not exists audit_logs_client_created_idx
  on public.audit_logs(client_id, created_at desc);
create index if not exists sources_client_status_idx
  on public.sources(client_id, status);
create index if not exists saved_news_client_user_idx
  on public.saved_news(client_id, user_id, created_at desc);

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.client_id
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';
$$;

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = check_user_id and p.role = 'admin' and p.status = 'active'
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
    select 1 from public.profiles p
    where p.id = check_user_id
      and p.role in ('admin', 'manager')
      and p.status = 'active'
  );
$$;

create or replace function public.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or target_client_id = public.current_client_id();
$$;

create or replace function public.can_manage_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid()
      and actor.role = 'manager'
      and actor.status = 'active'
      and actor.client_id = target_client_id
  );
$$;

create or replace function public.can_manage_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.profiles actor
    join public.profiles target on target.id = target_user_id
    where actor.id = auth.uid()
      and actor.role = 'manager'
      and actor.status = 'active'
      and actor.client_id = target.client_id
      and target.role = 'client'
  );
$$;

create or replace function public.get_active_package(check_user_id uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select up.package_id
      from public.user_packages up
      join public.packages pkg on pkg.id = up.package_id and pkg.is_active = true
      where up.user_id = check_user_id
        and up.is_active = true
        and up.starts_at <= now()
        and (up.ends_at is null or up.ends_at > now())
      order by up.created_at desc
      limit 1
    ),
    (
      select c.package_id
      from public.profiles p
      join public.clients c on c.id = p.client_id and c.status = 'active'
      join public.packages pkg on pkg.id = c.package_id and pkg.is_active = true
      where p.id = check_user_id
      limit 1
    )
  );
$$;

revoke all on function public.current_client_id() from public;
revoke all on function public.can_access_client(uuid) from public;
revoke all on function public.can_manage_client(uuid) from public;
revoke all on function public.can_manage_profile(uuid) from public;
grant execute on function public.current_client_id() to authenticated, service_role;
grant execute on function public.can_access_client(uuid) to authenticated, service_role;
grant execute on function public.can_manage_client(uuid) to authenticated, service_role;
grant execute on function public.can_manage_profile(uuid) to authenticated, service_role;

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.packages enable row level security;
alter table public.user_packages enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.saved_news enable row level security;
alter table public.sources enable row level security;
alter table public.notification_rules enable row level security;
alter table public.platform_events enable row level security;
alter table public.platform_integrations enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'clients', 'profiles', 'packages', 'user_packages', 'usage_events',
        'audit_logs', 'saved_news', 'sources', 'notification_rules',
        'platform_events', 'platform_integrations'
      )
  loop
    execute format('drop policy if exists %I on %I.%I',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

create policy clients_select_tenant
on public.clients for select to authenticated
using (public.can_access_client(id));

create policy clients_insert_admin
on public.clients for insert to authenticated
with check (public.is_admin());

create policy clients_update_tenant_manager
on public.clients for update to authenticated
using (public.can_manage_client(id))
with check (public.can_manage_client(id));

create policy clients_delete_admin
on public.clients for delete to authenticated
using (public.is_admin());

create policy profiles_select_tenant
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (
    public.get_user_role(auth.uid()) = 'manager'
    and client_id = public.current_client_id()
  )
);

create policy profiles_insert_tenant_manager
on public.profiles for insert to authenticated
with check (
  public.is_admin()
  or (
    public.get_user_role(auth.uid()) = 'manager'
    and client_id = public.current_client_id()
    and role = 'client'
  )
);

create policy profiles_update_tenant_manager
on public.profiles for update to authenticated
using (public.can_manage_profile(id))
with check (
  public.is_admin()
  or (
    public.get_user_role(auth.uid()) = 'manager'
    and client_id = public.current_client_id()
    and role = 'client'
  )
);

create policy profiles_delete_admin
on public.profiles for delete to authenticated
using (public.is_admin());

create policy packages_select_authorized
on public.packages for select to authenticated
using (
  is_active = true
  or public.is_manager_or_admin()
  or id = public.get_active_package(auth.uid())
);

create policy packages_write_admin
on public.packages for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy user_packages_select_tenant
on public.user_packages for select to authenticated
using (user_id = auth.uid() or public.is_admin() or public.can_manage_profile(user_id));

create policy user_packages_write_tenant_manager
on public.user_packages for all to authenticated
using (public.is_admin() or public.can_manage_profile(user_id))
with check (public.is_admin() or public.can_manage_profile(user_id));

create policy usage_events_select_tenant
on public.usage_events for select to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or (
    public.get_user_role(auth.uid()) = 'manager'
    and client_id = public.current_client_id()
  )
);

create policy usage_events_insert_tenant
on public.usage_events for insert to authenticated
with check (
  (user_id = auth.uid() and client_id = public.current_client_id())
  or public.is_admin()
  or (
    public.get_user_role(auth.uid()) = 'manager'
    and client_id = public.current_client_id()
  )
);

create policy usage_events_delete_admin
on public.usage_events for delete to authenticated
using (public.is_admin());

create policy audit_logs_select_tenant
on public.audit_logs for select to authenticated
using (
  public.is_admin()
  or (
    public.get_user_role(auth.uid()) = 'manager'
    and client_id = public.current_client_id()
  )
);

create policy audit_logs_insert_tenant
on public.audit_logs for insert to authenticated
with check (
  public.is_admin()
  or (
    public.get_user_role(auth.uid()) = 'manager'
    and client_id = public.current_client_id()
  )
);

create policy saved_news_select_tenant
on public.saved_news for select to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or (
    public.get_user_role(auth.uid()) = 'manager'
    and client_id = public.current_client_id()
  )
);

create policy saved_news_insert_own
on public.saved_news for insert to authenticated
with check (user_id = auth.uid() and client_id = public.current_client_id());

create policy saved_news_delete_own
on public.saved_news for delete to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy sources_select_tenant
on public.sources for select to authenticated
using (
  status = 'active'
  and (client_id is null or client_id = public.current_client_id() or public.is_admin())
);

create policy sources_write_tenant_manager
on public.sources for all to authenticated
using (public.is_admin() or (client_id is not null and public.can_manage_client(client_id)))
with check (public.is_admin() or (client_id is not null and public.can_manage_client(client_id)));

create policy notification_rules_select_tenant
on public.notification_rules for select to authenticated
using (public.can_access_client(client_id));

create policy notification_rules_write_tenant
on public.notification_rules for all to authenticated
using (public.can_manage_client(client_id))
with check (public.can_manage_client(client_id));

create policy platform_events_admin
on public.platform_events for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy platform_integrations_admin
on public.platform_integrations for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.clients, public.profiles, public.packages,
  public.user_packages, public.usage_events, public.audit_logs,
  public.saved_news, public.sources, public.notification_rules,
  public.platform_events, public.platform_integrations from anon;

grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.packages to authenticated;
grant select, insert, update, delete on public.user_packages to authenticated;
grant select, insert, delete on public.usage_events to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, delete on public.saved_news to authenticated;
grant select, insert, update, delete on public.sources to authenticated;
grant select, insert, update, delete on public.notification_rules to authenticated;
grant select, insert, update, delete on public.platform_events to authenticated;
grant select, insert, update, delete on public.platform_integrations to authenticated;

-- Perfis ficticios sao vinculados quando os usuarios correspondentes existem no Auth.
insert into public.profiles (
  id, email, full_name, client_id, company_name, role, status
)
select
  u.id,
  u.email,
  seed.full_name,
  c.id,
  c.company_name,
  seed.role,
  'active'
from auth.users u
join (values
  ('matheusmullercontato+gestor-a-staging@gmail.com', 'Gestor Cliente A', 'manager', 'cliente-demonstracao-a'),
  ('matheusmullercontato+cliente-a-staging@gmail.com', 'Usuario Cliente A', 'client', 'cliente-demonstracao-a'),
  ('matheusmullercontato+cliente-b-staging@gmail.com', 'Usuario Cliente B', 'client', 'cliente-demonstracao-b')
) as seed(email, full_name, role, client_slug)
  on lower(u.email) = lower(seed.email)
join public.clients c on c.slug = seed.client_slug
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  client_id = excluded.client_id,
  company_name = excluded.company_name,
  role = excluded.role,
  status = excluded.status,
  updated_at = now();

insert into public.user_packages (user_id, package_id, starts_at, is_active)
select p.id, pkg.id, now(), true
from public.profiles p
join public.packages pkg on pkg.name = 'Teste' and pkg.is_active = true
where p.email in (
  'matheusmullercontato+cliente-a-staging@gmail.com',
  'matheusmullercontato+cliente-b-staging@gmail.com'
)
and not exists (
  select 1 from public.user_packages up
  where up.user_id = p.id and up.is_active = true
);

commit;
