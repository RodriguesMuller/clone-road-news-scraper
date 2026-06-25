# Como publicar somente o frontend no Vercel

Esta versao usa a Vercel apenas para servir o painel web estatico.

Arquitetura:

- GitHub Actions roda `python main.py` de hora em hora.
- O scraper grava as noticias no Supabase/Postgres.
- A Vercel hospeda somente `public/index.html`.
- O navegador le a tabela `news` pelo REST API publico do Supabase.

## 1. Configurar leitura publica no Supabase

No Supabase, habilite RLS e crie uma policy de leitura para a tabela `news`:

```sql
alter table public.news enable row level security;

create policy "public read news"
on public.news
for select
to anon
using (true);
```

Essa policy permite somente leitura publica. O scraper continua escrevendo pelo
Postgres usando `DATABASE_URL` no GitHub Actions.

## 2. Colocar a anon key no frontend

No Supabase:

1. Abra Project Settings.
2. Entre em API.
3. Copie a `anon public key`.
4. Em `public/index.html`, troque:

```js
const SUPABASE_ANON_KEY = "COLE_AQUI_A_SUPABASE_ANON_KEY";
```

por sua anon key.

O projeto ja usa:

```js
const SUPABASE_URL = "https://vdyilgbqxnrwqgoairat.supabase.co";
```

## 3. Publicar na Vercel

No Vercel:

- Framework Preset: Other
- Root Directory: `./`
- Build Command: deixe vazio
- Output Directory: `public`

Nao configure `DATABASE_URL` na Vercel. Esse segredo fica apenas no GitHub
Actions.

## 4. GitHub Actions

No GitHub, mantenha o secret `SUPABASE` com a connection string do banco. O
workflow `.github/workflows/scraper.yml` usa esse secret como `DATABASE_URL` e
continua atualizando o Supabase.
