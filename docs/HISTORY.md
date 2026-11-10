# History — Road News

> Mantido por `project-historian`. Uma entrada por mudança concluída, mais recente no topo. Para mudanças de comportamento observável em formato resumido, ver [`CHANGELOG.md`](CHANGELOG.md).

## 2026-11-10 — Minha Rota: casamento de localidade e ancoragem de bloqueios
**O que mudou:** `routeKeywords` em `api/news-feed.js` passou a gerar a localidade inteira de origem/destino (regex com limite de palavra) em vez de tokens soltos. `matchRouteNews` descarta itens geolocalizados fora do corredor de 45 km e itens que citam apenas rodovias que não fazem parte da rota, e ancora no mapa (origem ou destino) os itens casados por localidade. O painel avisa quando um bloqueio não tem ponto no traçado.
**Por quê:** numa rota Santo André → Itaquaquecetuba, o token "santo" casou com "Espírito Santo" e um bloqueio total da BR-101 (ES) apareceu como Crítico na rota, sem marcador no mapa, já que não estava no trajeto.
**Arquivos/módulos:** `api/news-feed.js`, `public/index.html`, `tests/test_road_block.js`, `docs/CHANGELOG.md`.
**Impacto medido:** a medir (ocorrências por análise de rota antes/depois).
**Alternativas descartadas:** apenas aumentar o tamanho mínimo do token (ainda casaria "santo"/"santos"); filtrar pela UF da notícia (o campo `state` não é confiável em todos os itens).
**ADR relacionado:** nenhum.

## 2026-11-10 — Impacto na frota, destaque de bloqueios e correção do mapa
**O que mudou:**
- Mapa rodoviário e mapa da Minha Rota trocaram os tiles `dark_all` do CARTO por tiles do OpenStreetMap escurecidos via CSS (`.dark-tiles`), com provedor centralizado em `BASE_TILE_URL`/`addBaseTiles()`.
- Nova classificação de bloqueio de rodovia (`roadBlockLevel`: `total`/`partial`/vazio), idêntica em `api/news-feed.js` e `public/index.html`. Bloqueio total eleva o risco a Crítico. Cards de notícia, salvos, alertas, ocorrências da rota e pop-up do mapa ganham borda vermelha e faixa "Rodovia bloqueada". Marcadores de bloqueio saem do cluster.
- `POST /api/news-feed` expõe `road_blocked`/`block_level`, ordena bloqueios primeiro e o fallback recomenda rota alternativa quando há bloqueio total.
- Scraper: novo filtro `fleet_relevance` (contexto viário + impacto operacional, com lista de ruído) aplicado após a keyword em RSS e Band; `fleet_filter: false` desliga por fonte (aplicado ao feed de corredores internacionais).
- Painel: linha "Impacto na frota" com ação sugerida (`fleetImpact`) e ordenação padrão "Impacto na frota" (`fleetPriority`).

**Por quê:** o mapa exibia "API KEY REQUIRED" em todos os tiles; o feed trazia qualquer notícia que citasse rodovia/estrada, sem ajudar o gestor de frota a decidir entre rotas; bloqueios não se destacavam das demais ocorrências.

**Arquivos/módulos:** `public/index.html`, `api/news-feed.js`, `scraper/utils/filters.py`, `scraper/sources/rss.py`, `scraper/sources/html.py`, `config/sources.yaml`, `tests/test_fleet_relevance.py`, `tests/test_road_block.js`, `docs/SCRAPERS.md`, `docs/API.md`, `docs/CHANGELOG.md`, `README.md`, `product/FEATURES.md`.

**Impacto medido:** a medir (volume coletado por execução antes/depois do filtro de frota; taxa de falso negativo em bloqueios).

**Alternativas descartadas:**
- Manter CARTO com API key: exige conta e segredo novo para corrigir um problema visual imediato; fica como opção futura para volume alto.
- Esri World Dark Gray: visual melhor, mas os termos de uso comercial exigem conta ArcGIS.
- Classificar impacto na frota por IA em cada notícia: custo por item e latência; a regra determinística cobre o caso e a IA segue restrita aos 4 pontos de uso atuais.
- Ampliar só a lista de `keywords`: aumenta recall, mas não resolve o ruído de notícias que citam "estrada" sem impacto operacional.

**ADR relacionado:** nenhum.
