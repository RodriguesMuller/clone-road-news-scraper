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
- Install Command: deixe vazio

Nao use o preset Python na Vercel. O Python roda somente no GitHub Actions; a
Vercel deve publicar apenas o frontend estatico e a rota JavaScript em `api/`.

Nao configure `DATABASE_URL` na Vercel. Esse segredo fica apenas no GitHub
Actions.

As rotas de autenticacao e administracao usam as funcoes JavaScript da pasta
`api/`. Para o convite personalizado, configure tambem na Vercel:

- `APP_URL=https://road-news-teal.vercel.app` (use o dominio oficial do projeto)
- `RESEND_API_KEY`
- `INVITE_EMAIL_FROM=Road News <acesso@seudominio.com>`
- `INVITE_EMAIL_REPLY_TO=suporte@seudominio.com` (opcional)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`

No Supabase, em **Authentication > URL Configuration**, deixe o dominio de
producao como Site URL e autorize `/accept-invite` e `/auth/callback`. O
remetente de `INVITE_EMAIL_FROM` precisa usar um dominio verificado no Resend.

## Projeto de testes

O dominio `road-news-preview.vercel.app` deve usar a branch `staging`. Defina
`APP_URL=https://road-news-preview.vercel.app`, `APP_ENV=staging` e
`STAGING_READ_ONLY=true` somente nesse projeto. Ele pode reutilizar as chaves
de leitura e autenticacao do Supabase atual, mas as APIs de escrita e os
registros de consumo ficam bloqueados pelo servidor.

## 4. GitHub Actions

No GitHub, mantenha o secret `SUPABASE` com a connection string do banco. O
workflow `.github/workflows/scraper.yml` usa esse secret como `DATABASE_URL` e
continua atualizando o Supabase.
