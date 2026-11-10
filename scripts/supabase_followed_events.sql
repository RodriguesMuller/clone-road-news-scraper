-- Central de Evento: eventos que cada empresa escolheu acompanhar a partir de uma notícia
-- ("Acompanhar evento"). As notícias relacionadas são calculadas pela API a cada leitura.
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
  closed_by uuid
);

create index if not exists followed_events_client_status_idx
  on public.followed_events (client_id, status, created_at desc);
create index if not exists followed_events_created_by_idx
  on public.followed_events (created_by);

-- Acesso só pela API (service role), que filtra pela empresa do usuário.
alter table public.followed_events enable row level security;
revoke all on public.followed_events from anon, authenticated;
