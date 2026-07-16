-- Dados e estrutura exclusivos do ambiente Road News staging.
-- Execute depois de supabase_auth_access.sql e supabase_platform_environments.sql.

begin;

create table if not exists public.news (
  id bigserial primary key,
  title text not null,
  url text not null unique,
  source text,
  category text,
  published_at text,
  summary text,
  scraped_at text,
  type text,
  created_at timestamptz not null default now(),
  image_summary text,
  ai_summary text,
  operational_relevance text,
  operational_impact text,
  ai_processed_at timestamptz,
  ai_model text,
  region text,
  country text,
  state text,
  city text,
  highway text,
  risk_level text,
  latitude double precision,
  longitude double precision,
  geo_precision text
);

create index if not exists news_created_at_idx on public.news(created_at desc);
create index if not exists news_state_city_idx on public.news(state, city);
create index if not exists news_geo_lat_lng_idx
  on public.news(latitude, longitude)
  where latitude is not null and longitude is not null;

alter table public.news enable row level security;
revoke select, insert, update, delete on public.news from anon, authenticated;
drop policy if exists "Allow public read news" on public.news;
drop policy if exists "news_block_direct_client_select" on public.news;

insert into public.clients (
  company_name,
  document,
  contact_name,
  contact_email,
  status,
  package_id,
  notes
)
select
  'Cliente Demonstracao',
  null,
  'Operacao Staging',
  'staging@road-news.invalid',
  'active',
  (select id from public.packages where name = 'Teste' order by created_at limit 1),
  'Registro ficticio. Nao usar em producao.'
where not exists (
  select 1 from public.clients where company_name = 'Cliente Demonstracao'
);

insert into public.sources (name, source_type, category, url, frequency_minutes, status)
select seed.*
from (values
  ('INMET Staging', 'api', 'clima', 'https://staging.invalid/inmet', 120, 'active'),
  ('Rodovias Staging', 'rss', 'rodovia', 'https://staging.invalid/rodovias', 60, 'active'),
  ('Seguranca Staging', 'rss', 'seguranca', 'https://staging.invalid/seguranca', 180, 'active')
) as seed(name, source_type, category, url, frequency_minutes, status)
where not exists (select 1 from public.sources existing where existing.name = seed.name);

insert into public.news (
  title,
  url,
  source,
  category,
  published_at,
  summary,
  scraped_at,
  type,
  created_at,
  region,
  country,
  state,
  city,
  highway,
  risk_level,
  latitude,
  longitude,
  geo_precision
)
values
  (
    'Acidente ficticio interdita faixa da BR-364 em Cuiaba',
    'https://staging.invalid/news/br-364-cuiaba',
    'Rodovias Staging',
    'Acidente',
    to_char((now() - interval '35 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'Cenario de teste: uma faixa esta temporariamente interditada no km 398 da BR-364, em Cuiaba/MT, com lentidao simulada.',
    to_char((now() - interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'STAGING',
    now() - interval '30 minutes',
    'Cuiaba/MT',
    'Brasil',
    'MT',
    'Cuiaba',
    'BR-364',
    'high',
    -15.601,
    -56.097,
    'city'
  ),
  (
    'Chuva forte ficticia exige atencao na BR-101 em Santa Catarina',
    'https://staging.invalid/news/br-101-sc',
    'INMET Staging',
    'Clima',
    to_char((now() - interval '2 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'Cenario de teste: chuva entre 30 e 50 mm pode reduzir a visibilidade e gerar pontos de alagamento entre Joinville e Itajai.',
    to_char((now() - interval '110 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'INMET',
    now() - interval '110 minutes',
    'Norte de Santa Catarina',
    'Brasil',
    'SC',
    'Joinville',
    'BR-101',
    'high',
    -26.304,
    -48.846,
    'city'
  ),
  (
    'Obra ficticia opera em pare-e-siga na BR-116 em Minas Gerais',
    'https://staging.invalid/news/br-116-mg',
    'Rodovias Staging',
    'Obra',
    to_char((now() - interval '5 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'Cenario de teste: servico no km 710 da BR-116 opera em pare-e-siga e pode acrescentar 25 minutos ao tempo de viagem.',
    to_char((now() - interval '4 hours 50 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'STAGING',
    now() - interval '4 hours 50 minutes',
    'Zona da Mata/MG',
    'Brasil',
    'MG',
    'Juiz de Fora',
    'BR-116',
    'medium',
    -21.762,
    -43.349,
    'city'
  ),
  (
    'Bloqueio ficticio afeta acesso a BR-163 em Mato Grosso',
    'https://staging.invalid/news/br-163-mt',
    'Rodovias Staging',
    'Interdicao',
    to_char((now() - interval '8 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'Cenario de teste: bloqueio total simulado proximo a Rondonopolis recomenda validacao de rota antes da partida.',
    to_char((now() - interval '7 hours 45 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'STAGING',
    now() - interval '7 hours 45 minutes',
    'Rondonopolis/MT',
    'Brasil',
    'MT',
    'Rondonopolis',
    'BR-163',
    'critical',
    -16.467,
    -54.638,
    'city'
  ),
  (
    'Manifestacao ficticia causa lentidao na BR-040 em Goias',
    'https://staging.invalid/news/br-040-go',
    'Seguranca Staging',
    'Manifestacao',
    to_char((now() - interval '14 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'Cenario de teste: concentracao simulada no acesso a Cristalina/GO provoca trafego lento, sem desvio confirmado.',
    to_char((now() - interval '13 hours 40 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'STAGING',
    now() - interval '13 hours 40 minutes',
    'Cristalina/GO',
    'Brasil',
    'GO',
    'Cristalina',
    'BR-040',
    'medium',
    -16.767,
    -47.613,
    'city'
  ),
  (
    'Fluxo normal ficticio na BR-376 no Parana',
    'https://staging.invalid/news/br-376-pr',
    'Rodovias Staging',
    'Transito',
    to_char((now() - interval '22 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'Cenario de teste: trafego dentro da normalidade no trecho entre Curitiba e Sao Jose dos Pinhais.',
    to_char((now() - interval '21 hours 45 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'STAGING',
    now() - interval '21 hours 45 minutes',
    'Curitiba/PR',
    'Brasil',
    'PR',
    'Curitiba',
    'BR-376',
    'low',
    -25.429,
    -49.271,
    'city'
  )
on conflict (url) do update set
  title = excluded.title,
  source = excluded.source,
  category = excluded.category,
  published_at = excluded.published_at,
  summary = excluded.summary,
  scraped_at = excluded.scraped_at,
  type = excluded.type,
  created_at = excluded.created_at,
  region = excluded.region,
  country = excluded.country,
  state = excluded.state,
  city = excluded.city,
  highway = excluded.highway,
  risk_level = excluded.risk_level,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  geo_precision = excluded.geo_precision;

commit;
