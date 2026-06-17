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
| PRF Notícias | HTML | keywords rodoviárias |
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
  Agora o scraper aplica as `keywords` apenas ao **título** da notícia
  (não ao resumo ou ao corpo). Além disso, keywords compostas apenas por
  letras/dígitos/espaços são casadas por **palavra inteira** para evitar
  falsos positivos (ex.: `ferido` não casa com `ferimentos`). Palavras com
  pontuação relevante (ex.: `BR-`) seguem correspondência por substring.
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

## Banco de dados

A tabela `news` é criada automaticamente na primeira execução, com constraint
`UNIQUE(url)` para evitar duplicatas.
