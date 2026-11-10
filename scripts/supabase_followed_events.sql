-- Central de Evento: eventos que cada empresa escolheu acompanhar a partir de uma notícia
-- ("Acompanhar evento"). A IA atualiza cada evento a cada coleta, até o encerramento.
-- Idempotente.
create table if not exists public.followed_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  created_by uuid not null,
  created_by_name text,
  title text not null,
  seed jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid,
  -- Situação mantida pela IA a cada coleta (scraper/followed_events.py): resumo, impacto, decisão de
  -- despacho, ações, linha do tempo e notícias relacionadas confirmadas.
  ai_state jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz
);

alter table public.followed_events add column if not exists ai_state jsonb not null default '{}'::jsonb;
alter table public.followed_events add column if not exists last_checked_at timestamptz;

create index if not exists followed_events_client_status_idx
  on public.followed_events (client_id, status, created_at desc);
create index if not exists followed_events_created_by_idx
  on public.followed_events (created_by);

-- Acesso só pela API (service role), que filtra pela empresa do usuário.
alter table public.followed_events enable row level security;
revoke all on public.followed_events from anon, authenticated;
