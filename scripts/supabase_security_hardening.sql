-- =============================================================================
-- Road News - hardening de seguranca e indices (auditoria QA 2026-11-09)
-- Idempotente. Rollback: scripts/supabase_security_hardening_rollback.sql
--
-- ORDEM OBRIGATORIA: aplicar SOMENTE depois que o codigo da branch qa-audit
-- estiver em producao (Vercel + main). Antes disso:
--   * o scraper antigo recria a policy "Allow public read news" a cada hora;
--   * o frontend antigo em modo demo (AUTH_ENABLED=false) le news direto.
-- Em modo auth (producao atual) o frontend ja le tudo via /api/news-feed.
-- =============================================================================

begin;

-- 1. [P0] news era legivel por qualquer pessoa com a chave publica do frontend
--    (policy USING (true) para anon), contornando login e cotas por pacote.
--    Todo acesso legitimo passa pelo backend com service role (ignora RLS).
drop policy if exists "Allow public read news" on public.news;
revoke all on table public.news from anon, authenticated;

--    Tabelas internas sem policy: o RLS ja bloqueia, os grants ficam coerentes.
revoke all on table public.platform_events from anon, authenticated;
revoke all on table public.event_intelligence_runs from anon, authenticated;

-- 2. Funcoes SECURITY DEFINER usadas nas policies: anon nao precisa executa-las
--    (get_user_role permitia a anon descobrir o papel de qualquer UUID via /rpc).
--    authenticated continua precisando, pois as policies as chamam.
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.is_manager_or_admin(uuid) from public, anon;
revoke execute on function public.get_user_role(uuid) from public, anon;
revoke execute on function public.can_manage_target_user(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_manager_or_admin(uuid) to authenticated;
grant execute on function public.get_user_role(uuid) to authenticated;
grant execute on function public.can_manage_target_user(uuid) to authenticated;

alter function public.set_updated_at() set search_path = public;

-- 3. [P1] Drift de schema: producao so aceitava role admin/client, entao criar
--    ou promover um Gestor falhava com violacao de constraint, embora API, RLS e
--    scripts/supabase_auth_access.sql ja tratem 'manager'.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'manager', 'client'));

-- 4. Indices para os padroes de consulta reais (ver docs/qa-audit/database-audit.md).
--    news: todas as consultas do feed filtram/ordenam por created_at (seq scan hoje).
create index if not exists news_created_at_idx on public.news (created_at desc);
--    FKs sem indice apontadas pelo advisor + filtros user_id/is_active do _auth.js.
create index if not exists user_packages_user_active_idx on public.user_packages (user_id, is_active);
create index if not exists user_packages_package_active_idx on public.user_packages (package_id, is_active);
create index if not exists usage_events_package_id_idx on public.usage_events (package_id);
create index if not exists audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);

commit;
