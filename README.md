# Road News Scraper

Rotina de web scraping de **notícias rodoviárias** e **avisos meteorológicos**
que afetam as estradas. Coleta de múltiplas fontes, filtra o conteúdo relevante
e persiste em um banco **PostgreSQL (Supabase)**. Roda automaticamente a cada
hora via **GitHub Actions** (`.github/workflows/scraper.yml`).

## Documentação completa

Este README cobre o essencial para rodar o projeto. Para arquitetura, banco de
dados, API, pipeline de IA e a arquitetura de subagents que mantém tudo isso
atualizado, ver [`CLAUDE.md`](CLAUDE.md) e [`docs/AGENTS.md`](docs/AGENTS.md)
— ou o PDF consolidado em `docs/dist/road-news-documentation.pdf`.

## Fontes

11 fontes ativas hoje: RSS (G1, CNN Brasil, 4 buscas do Google News, Estradas.com.br, Blog do Caminhoneiro), HTML (Band), API JSON em tempo real (Arteris Fluminense) e avisos meteorológicos do INMET (filtrados por severidade, não por keyword). Lista completa e semântica exata do filtro de keyword em [`docs/SCRAPERS.md`](docs/SCRAPERS.md).

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

## Minha Rota com trânsito

A tela **Minha Rota** combina três fontes de informação:

- Google Routes API para distância, duração e condição de trânsito no traçado.
- Notícias das últimas 72 horas no Supabase, cruzadas por rodovia, localidade e
  proximidade geográfica do trajeto.
- OpenAI para produzir uma recomendação operacional baseada somente nos dados
  encontrados. Se a IA estiver indisponível, a tela mantém uma síntese segura
  baseada em regras.

Na Vercel, configure `GOOGLE_ROUTES_API_KEY` somente em **Environment
Variables** para Production e Preview. A chave nunca é enviada ao navegador.
No Google Cloud, habilite a **Routes API**, vincule billing e restrinja a chave
para uso exclusivo dessa API.

## Banco de dados

A tabela `news` é criada automaticamente na primeira execução, com constraint
`UNIQUE(url)` para evitar duplicatas.
