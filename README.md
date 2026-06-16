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
