-- Rollback de scripts/supabase_security_hardening.sql.
-- Restaura o estado anterior EXATO, inclusive a exposicao anonima da tabela news.
-- Use apenas se o hardening quebrar algo em producao; depois corrija e reaplique.

begin;

create policy "Allow public read news" on public.news
  for select to anon, authenticated using (true);
grant all on table public.news to anon, authenticated;
grant all on table public.platform_events to anon, authenticated;
grant all on table public.event_intelligence_runs to anon, authenticated;

grant execute on function public.is_admin(uuid) to public, anon;
grant execute on function public.is_manager_or_admin(uuid) to public, anon;
grant execute on function public.get_user_role(uuid) to public, anon;
grant execute on function public.can_manage_target_user(uuid) to public, anon;

alter function public.set_updated_at() reset search_path;

-- Volta ao check antigo so se nao houver nenhum manager (senao falharia).
do $$
begin
  if not exists (select 1 from public.profiles where role = 'manager') then
    alter table public.profiles drop constraint if exists profiles_role_check;
    alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'client'));
  end if;
end $$;

drop index if exists public.news_created_at_idx;
drop index if exists public.user_packages_user_active_idx;
drop index if exists public.user_packages_package_active_idx;
drop index if exists public.usage_events_package_id_idx;
drop index if exists public.audit_logs_actor_user_id_idx;

commit;
