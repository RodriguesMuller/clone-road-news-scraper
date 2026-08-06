# Scrapers — Road News

> Mantido por `tech-docs-agent`. Dono do código: `scraping-engineer` (coleta) + `data-pipeline-engineer` (persistência). Ver [`docs/AGENTS.md`](AGENTS.md).

## Como funciona

1. `main.py` lê `config/sources.yaml`.
2. Cada fonte é coletada por um módulo de `scraper/sources/`: `rss.py` (feeds RSS/Atom via `feedparser`), `html.py` (raspagem HTML via `requests`+`BeautifulSoup4`, hoje só a Band), `inmet.py` (avisos meteorológicos, filtrados por severidade, não por keyword), `arteris.py` (API JSON pública da concessionária Arteris Fluminense, tempo real).
3. Itens passam pelo motor de keyword (`scraper/utils/filters.py`) antes de entrar na lista final — exceto fontes que já são inerentemente relevantes (INMET, Arteris, que não usam keyword).
4. `scraper/storage/postgres.py` grava no Postgres, deduplicando por `UNIQUE(url)`.
5. `scraper/event_intelligence.py` roda a triagem de eventos críticos sobre o lote coletado (ver [`docs/AI_PIPELINE.md`](AI_PIPELINE.md)).

Sem browser headless em nenhuma etapa — nenhuma fonte hoje exige renderização JS para ser lida.

## Fontes ativas (`config/sources.yaml`)

| Fonte | Tipo | Categoria | Observação |
|---|---|---|---|
| G1 - Brasil | RSS | geral | Filtrado por keyword |
| CNN Brasil | RSS | geral | Filtrado por keyword |
| Google News — Incidentes em rodovia | RSS (busca) | rodovia | Query já filtra por rodovia+incidente |
| Google News — Caminhão/carreta | RSS (busca) | rodovia | Query já filtra por veículo+incidente |
| Estradas.com.br | RSS | rodovia | Portal especializado |
| Blog do Caminhoneiro | RSS | transporte | Portal especializado |
| Google News — Eventos logísticos Brasil | RSS (busca) | evento logístico | `max_items: 30`, keywords próprias (greve, bloqueio, porto...) |
| Google News — Corredores logísticos internacionais | RSS (busca) | logística internacional | `max_items: 30`, cobre Ormuz, Suez, Mar Vermelho, Panamá |
| Band - Notícias | HTML | geral | Único scraper HTML puro hoje |
| Arteris Fluminense (tempo real) | API JSON | rodovia | Sem keyword — toda ocorrência é relevante; dedup por hash de conteúdo (sem URL por ocorrência) |
| INMET - Avisos Meteorológicos | RSS | clima | Filtro por severidade (`Perigo`, `Grande Perigo`, `Perigo Potencial`) + tipo de evento opcional |

## Semântica do matching de keyword (`scraper/utils/filters.py`)

Aplicado só a **título e subtítulo/resumo** (nunca ao texto completo do artigo):
- Case-insensitive.
- Palavra inteira: `ferido` **não** casa com `ferimentos`.
- Keyword com múltiplas palavras (ex. `"incêndio em caminhão"`): casa quando **todas** aparecem no título, em qualquer posição — não exige frase exata.
- Keyword com pontuação (ex. `"BR-"`): casa por substring.

Mudar essa semântica afeta recall retroativamente — qualquer alteração aqui precisa de aviso a `data-analyst` (para medir o impacto) e atualização do comentário em `config/sources.yaml`.

## Atribuição de fonte nas queries "Google News"

As 4 fontes `Google News — ...` são buscas agregadas (`news.google.com/rss/search?q=...`), não veículos editoriais. Até esta revisão, `scraper/sources/rss.py` gravava o campo `source` da notícia com o nome literal da query (ex. `"Google News - Caminhão/carreta"`), o que aparecia no card do cliente como se fosse a fonte da notícia — problema de credibilidade sinalizado por `compliance-advisor`.

Correção: `scrape_rss()` agora resolve o veículo real por trás do redirect, nesta ordem:
1. `entry.source.title` do feed do Google News (quando o feed expõe o elemento `<source>`).
2. Fallback: sufixo `"Título - Veículo"` do próprio `entry.title` (padrão do Google News quando `<source>` não vem preenchido).
3. Só cai de volta no nome da query (`"Google News - ..."`) se nenhum dos dois acima existir.

Isso só se aplica às fontes cujo `name` em `config/sources.yaml` começa com `"Google News"` — as demais fontes (G1, CNN Brasil, Estradas.com.br, etc.) já gravam o próprio nome do veículo.

## Adicionar uma fonte nova

Sem editar código Python: adicione um bloco em `rss_sources`/`html_sources`/`inmet_sources` de `config/sources.yaml`, salve, `git push` — o GitHub Actions usa a versão do repositório na próxima execução (até 1h de defasagem). Editar código só é necessário para um **tipo** de fonte novo (ex. um segundo scraper HTML) — nesse caso, o `type` em `html_sources` precisa de um raspador correspondente em `scraper/sources/html.py`.

Ordem de preferência ao integrar uma fonte nova (do mais barato ao mais caro de manter): **RSS/feed > API JSON pública > HTML estático > renderização client-side** (headless browser — hoje inexistente no projeto, exige ADR de `system-architect` para introduzir).

Toda fonte nova passa por `compliance-advisor` (robots.txt/ToS) **antes** de ser ativada em produção.

## Agendamento

`.github/workflows/scraper.yml`: cron `0 * * * *` (hora em hora, UTC) + disparo em push na `main` + `workflow_dispatch` manual. Timeout de 15 minutos. Roda com `EVENT_INTELLIGENCE_ENABLED=true` e `SCRAPER_AI_SUMMARIES_ENABLED=false` (enriquecimento de IA por item desligado por custo — ver [`docs/AI_PIPELINE.md`](AI_PIPELINE.md)). Em push, também roda `scripts/upsert_santos_trucker_event.py` (evento curado do Porto de Santos).

> Nota de divergência corrigida: versões anteriores da documentação mencionavam execução "a cada 2h" — o cron real (`scraper.yml`) é de hora em hora.
