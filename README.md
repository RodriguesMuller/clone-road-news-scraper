# Road News Scraper

Rotina de web scraping de **notícias rodoviárias** e **avisos meteorológicos**
que afetam as estradas. Coleta de 4 fontes, filtra o conteúdo relevante e
persiste em um banco **PostgreSQL (Supabase)**. Roda automaticamente a cada 2h
via **GitHub Actions**.

## Fontes

| Fonte | Tipo | Filtro |
|-------|------|--------|
| G1 | RSS | keywords rodoviárias |
| CNN Brasil | RSS | keywords rodoviárias |
| Band | HTML | keywords rodoviárias |
| INMET (avisos) | RSS | severidade (`Perigo` / `Grande Perigo`) |

Tudo configurável em [`config/sources.yaml`](config/sources.yaml).

## Como funciona

1. `main.py` lê as fontes de `config/sources.yaml`.
2. Cada fonte é coletada e filtrada (`scraper/sources/`).
3. Os itens são gravados no Postgres, deduplicados por URL
   (`scraper/storage/postgres.py`).

## Ajustando o que é coletado (sem mexer no código) 👈

Tudo o que influencia os resultados fica em **[`config/sources.yaml`](config/sources.yaml)** —
é o "painel de controle" do projeto, todo comentado de forma didática:

- **`keywords`** — palavras que tornam uma notícia relevante (G1, CNN, Band).
  O scraper aplica as `keywords` apenas ao **título** da notícia. O casamento é
  por **palavra inteira** (`ferido` não casa com `ferimentos`); keywords com
  **várias palavras** (ex.: `incêndio em caminhão`) casam quando **todas** as
  palavras aparecem no título; e keywords com pontuação (ex.: `BR-`) casam por
  substring.
- **`severities` do INMET** — quais níveis de aviso de clima guardar
  (`Perigo`, `Grande Perigo`, etc.).
- **As fontes** (`rss_sources`, `html_sources`, `inmet_sources`) — quais
  sites/feeds são consultados.

Basta editar esse arquivo, salvar e dar `git push`: o GitHub Actions passa a
usar a nova configuração na próxima execução. O motor que aplica as keywords
fica em `scraper/utils/filters.py` (não precisa ser editado para ajustar a lista).

## Rodar localmente

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1      # Windows PowerShell
pip install -r requirements.txt
copy .env.example .env          # preencha DATABASE_URL
python main.py
```

Sem `DATABASE_URL` definido, o scraper apenas **exibe** os resultados no
terminal (modo de teste, não grava no banco).

## Execução agendada (GitHub Actions)

O workflow [`.github/workflows/scraper.yml`](.github/workflows/scraper.yml) roda
a cada 2h. Configure o secret `DATABASE_URL` em **Settings → Secrets and
variables → Actions** — use a connection string do *Session pooler* do Supabase
(compatível com IPv4, exigido pelos runners do GitHub).

## Weekly news com IA e e-mail

O workflow [`.github/workflows/weekly-news.yml`](.github/workflows/weekly-news.yml)
gera um resumo semanal toda segunda-feira, 08:00 no horario de Brasilia, com a
identidade visual Road News inspirada no padrão corporativo da Overhaul. Ele usa:

- `OPENAI_API_KEY` para montar o resumo operacional com IA.
- `RESEND_API_KEY` para enviar e-mail pelo Resend.
- `WEEKLY_EMAIL_TO` com os destinatarios separados por virgula.
- `WEEKLY_EMAIL_FROM` como remetente. Para producao, configure um dominio no
  Resend; para teste, o remetente padrao `onboarding@resend.dev` pode servir.
- `OPENAI_MODEL`, opcional, com padrao `gpt-4.1-mini`.

O front tambem tem o botao **Gerar resumo semanal**, que chama
`/api/weekly-summary` no Vercel. Configure `OPENAI_API_KEY` e, se quiser,
`OPENAI_MODEL` nas variaveis de ambiente do projeto Vercel.

## Convites de usuarios

Os convites sao gerados pelo Supabase Auth, mas o e-mail final e enviado pelo
backend via Resend com identidade visual Road News. O endpoint administrativo
nao usa o template padrao `You've been invited` do Supabase e nunca envia senha
em texto puro.

Configure estas variaveis na Vercel para **Production e Preview**:

- `APP_URL=https://road-news-teal.vercel.app` (substitua pelo dominio oficial).
- `RESEND_API_KEY` com uma chave ativa do Resend.
- `INVITE_EMAIL_FROM=Road News <acesso@seudominio.com>`.
- `INVITE_EMAIL_REPLY_TO=suporte@seudominio.com` (opcional).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` como ja
  usados pela autenticacao. A service role permanece somente no backend.

No Resend, verifique o dominio usado em `INVITE_EMAIL_FROM`. O remetente de
teste `onboarding@resend.dev` costuma ficar limitado ao e-mail do proprietario
da conta e nao deve ser usado para convites reais de clientes.

No Supabase, abra **Authentication > URL Configuration** e configure:

- Site URL: `https://road-news-teal.vercel.app`
- Redirect URL: `https://road-news-teal.vercel.app/accept-invite`
- Redirect URL: `https://road-news-teal.vercel.app/auth/callback`
- Para desenvolvimento: `http://localhost:3000/accept-invite` e
  `http://localhost:3000/auth/callback`

O backend prioriza `APP_URL` e nunca aceita `localhost` quando esta rodando na
Vercel. Sem `APP_URL`, ele usa o dominio de producao informado automaticamente
pela Vercel. O template de referencia fica em
`scripts/road_news_invite_email_template.html`.

## Ambiente de testes na Vercel

O projeto `road-news-preview.vercel.app` usa a branch `staging` e pode ler as
mesmas noticias do Supabase de producao sem alterar os dados compartilhados.
Configure nesse projeto:

- `APP_URL=https://road-news-preview.vercel.app`
- `APP_ENV=staging`
- `STAGING_READ_ONLY=true`

Nesse modo, o backend bloqueia convites, exclusoes, alteracoes de usuarios,
pacotes e status. Registros de consumo e auditoria tambem nao sao gravados. O
front exibe uma faixa amarela de ambiente de testes e desabilita os controles
de escrita. Consultas de noticias, mapa e resumos continuam disponiveis.

## Banco de dados

A tabela `news` é criada automaticamente na primeira execução, com constraint
`UNIQUE(url)` para evitar duplicatas.
