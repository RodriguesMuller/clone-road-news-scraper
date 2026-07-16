-- Estrutura usada pela Central de Evento. Pode ser aplicada mais de uma vez.
create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info',
  status text not null default 'open',
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists platform_events_major_status_idx
  on public.platform_events(event_type, status, created_at desc);

create table if not exists public.event_intelligence_runs (
  fingerprint text primary key,
  analyzed_at timestamptz not null default now(),
  model text,
  candidate_count integer not null default 0,
  event_count integer not null default 0
);

alter table public.platform_events enable row level security;
alter table public.event_intelligence_runs enable row level security;

-- A leitura dos eventos é feita pela API segura do Road News.
revoke all on public.event_intelligence_runs from anon, authenticated;

comment on table public.event_intelligence_runs is
  'Evita reprocessar o mesmo conjunto de notícias pela inteligência de eventos.';
