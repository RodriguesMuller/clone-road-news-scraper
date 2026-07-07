-- Execute este arquivo somente depois de ligar NEXT_PUBLIC_AUTH_ENABLED=true
-- e confirmar que SUPABASE_SERVICE_ROLE_KEY esta configurada na Vercel.
-- Ele remove o acesso anonimo direto a tabela news; o painel passa a ler
-- noticias pela rota /api/news-feed, que valida login, pacote e auditoria.

alter table public.news enable row level security;

revoke select, insert, update, delete on public.news from anon;
revoke select, insert, update, delete on public.news from authenticated;

drop policy if exists "news_block_direct_client_select" on public.news;

-- Sem policy de select para anon/authenticated.
-- As Vercel Functions usam service_role no servidor e continuam lendo a tabela.
-- O scraper via DATABASE_URL tambem continua gravando pelo banco.
