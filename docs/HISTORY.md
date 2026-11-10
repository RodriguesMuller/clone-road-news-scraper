# History — Road News

> Mantido por `project-historian`. Uma entrada por mudança concluída, mais recente no topo. Para mudanças de comportamento observável em formato resumido, ver [`CHANGELOG.md`](CHANGELOG.md).

## 2026-11-10 — Central de Evento: o cliente escolhe, a IA acompanha
**O que mudou:**
- Reaproveitado o commit do PR #21 (botão "Acompanhar evento", tabela `followed_events`, ações em `news-summary.js`, Central reescrita).
- Novo `scraper/followed_events.py` (`update_followed_events`, chamado em `main.py` a cada coleta): pré-filtro `select_candidates`, chamada à IA com schema estrito e validação `apply_update` (só cita notícias enviadas, só encerra com notícia de liberação). Grava em `ai_state`/`last_checked_at`.
- `api/_followed_events.js` usa `ai_state` quando analisado, sem expor `rejected_urls`.
- Na Central: status, decisão de despacho, impacto, ações, linha do tempo e aviso "Aguardando a primeira análise da IA".
- Testes: `tests/test_followed_events_ai.py`, mais um caso em `tests/test_followed_events.js`.

**Por quê:** o usuário definiu o modelo: o cliente escolhe o evento e a IA faz toda a atualização com as notícias recebidas até o encerramento. Isso substitui tanto a triagem automática (falsos positivos: Raposo Tavares e outros 8 eventos de uma vez) quanto o acompanhamento só por regra do PR #21.

**Impacto medido:** JS 80/80, Python 62/62. Central renderizada em 4 estados: vazia, ativa sem análise, ativa com análise, só encerrada.

**Alternativas descartadas:**
- Análise da IA na API, na hora do clique ou a cada abertura da Central: latência no painel, custo por visualização e chamadas concorrentes. A coleta horária centraliza a chamada.
- Gravar só a regra fixa, sem IA: decisão do usuário.
- Contar a atualização no saldo de IA do pacote: não pedido. O custo é por evento ativo com notícia nova, no máximo 50 eventos por coleta.

**ADR relacionado:** nenhum.

## 2026-11-10 — Hotfix: feed fora do ar por arquivo excluído do deploy
**O que mudou:** `config/accented_words.json` → `public/accented_words.json`; `api/_text_repair.js` carrega o vocabulário com `try/catch`; `scraper/utils/filters.py` lê o novo caminho. Teste novo `tests/test_deploy_bundle.js`: nenhum `require` em `api/` pode apontar para pasta listada no `.vercelignore`.
**Por quê:** o usuário viu o painel zerado logo após o merge do PR #22. O `require("../config/accented_words.json")` falhava no carregamento da função, porque `config` está no `.vercelignore`. Os testes locais não pegaram porque rodam com o repositório inteiro.
**Impacto medido:** JS 74/74, Python 58/58. O teste novo falha no código do PR #22 e passa no corrigido.
**Alternativas descartadas:** tirar `config` do `.vercelignore` (publicaria `sources.yaml` e outras configs do scraper sem necessidade); negação `!config/accented_words.json` (o diretório inteiro é ignorado, e a semântica de negação dentro de diretório ignorado não é garantida).
**ADR relacionado:** nenhum.

## 2026-11-10 — Central de Evento pela decisão de despacho; reparo de acento
**O que mudou:** `scraper/event_intelligence.py`:
- prompt reescrito pela ótica de quem libera caminhões;
- `dispatch_decision` no schema e na validação;
- acidente exige `TOTAL_PATTERN`;
- notícia de liberação vira candidata;
- evento novo encerrado é descartado;
- `CLASSIFICATION_VERSION` v3.

Também entrou o commit do PR #20 (limite de saída 8000 e erro claro para resposta incompleta), fechado sem merge quando a Central por acompanhamento foi proposta. `repair_text`/`strip_section_prefix` em `scraper/utils/filters.py` (usados em `clean_text` e nos títulos de `rss.py`/`html.py`) e `api/_text_repair.js` (aplicado em `news-feed.js` e `weekly-summary.js`), com o vocabulário compartilhado `public/accented_words.json`. Em `public/index.html`, `dispatchDecision` no destaque, no banner e nos indicadores.

**Por quê:** o usuário decidiu manter a Central automática (o PR #21, Central por acompanhamento manual, foi fechado sem merge; a branch `feat/acompanhar-evento` ficou guardada). Pediu critério de gestor de frota que libera caminhões e apontou o título "Not??cias - Grave acidente na RSC-472…" com acento quebrado.

**Impacto medido:** Python 58/58 e JS 73/73. O caso RSC-472 (grave acidente sem bloqueio total) fica em Alertas; acidente com bloqueio total sem previsão e greve de caminhoneiros seguem candidatos.

**Alternativas descartadas:**
- trocar o vocabulário por detecção de idioma ou dicionário completo (dependência nova);
- apagar o U+FFFD sem tentar reconstruir (deixaria "Not cias").

**ADR relacionado:** nenhum.

## 2026-11-10 — Triagem de eventos: limite de saída e diagnóstico
**O que mudou:** `scraper/event_intelligence.py`: `max_output_tokens` de 3000 para 8000; `_call_openai` detecta `status: incomplete` e informa o motivo; o log de falha inclui uma mensagem curta, sem corpo de resposta nem cabeçalhos. Teste `OpenAiResponseTests`.
**Por quê:** a coleta seguinte ao merge do PR #19 registrou `[Eventos] Falha na triagem inteligente: JSONDecodeError`, com 40 candidatos e o prompt maior. O log só trazia o nome da exceção, então a causa (resposta cortada) é a mais provável, mas não foi confirmada; o novo log vai mostrá-la.
**Alternativas descartadas:** reduzir o lote de 40 candidatos (perderia cobertura); reparar JSON truncado (aceitaria eventos pela metade).
**ADR relacionado:** nenhum.

## 2026-11-10 — Central de Evento: critério de frota de carga e descarte
**O que mudou:** `scraper/event_intelligence.py`: `PASSENGER_CONTEXT_PATTERN` (remove impacto em ônibus/metrô/passageiros antes de medir gravidade), regra de acidente pontual com interdição parcial (`ROUTINE_ACCIDENT_PATTERN`/`PARTIAL_PATTERN`/`TOTAL_PATTERN`), exclusões explícitas no prompt, `CLASSIFICATION_VERSION` v2, e `merge_event` não republica evento `descartado`. `api/news-summary.js` aceita `operational_status: descartado` (grava `status=resolved` + marca no metadata). `api/news-feed.js` não devolve descartados. `public/index.html`: botão "Descartar: não é evento grave". Testes: `CargoRelevanceTests`, novo teste em `tests/test_event_center.js`.
**Por quê:** a primeira execução real da triagem publicou como "Crítico" o tombamento de um caminhão na Raposo Tavares (km 24,5) com interdição parcial, cujo impacto relevante era só em linhas de ônibus. O usuário apontou que isso não importa para gestor de frota de caminhões de carga. O filtro passou porque "paralisação de linhas de ônibus" contava como gravidade.
**Impacto medido:** JS 71/71, Python 52/52. O caso real da Raposo Tavares agora é barrado antes da IA, e greve de caminhoneiros e acidente com bloqueio total sem previsão continuam candidatos.
**Alternativas descartadas:** novo valor `dismissed` na coluna `status` (o CHECK de `supabase_platform_environments.sql` só aceita `open`/`resolved`; exigiria migration); apagar o evento descartado (perderia o registro para auditoria e a IA poderia recriá-lo).
**ADR relacionado:** nenhum.

## 2026-11-10 — QA da Central de Evento
**O que mudou:** `merge_event` em `scraper/event_intelligence.py` (regras de reabertura, data de encerramento estável, início por data real; `_upsert_events` passa a usá-la); `updateMajorEventStatus` em `api/news-summary.js` limpa `ended_on`/`ended_at` ao reabrir e grava `ended_at` ao encerrar; `renderMajorEvents`/`renderPrimaryMajorEvent` em `public/index.html` (sem destaque para encerrado, janela de 30 dias, selo de evento parado). Testes: `MergeEventTests` em `tests/test_event_intelligence.py`, `tests/test_event_center.js`.
**Por quê:** pedido de QA da Central de Evento. Os logs de produção mostraram que a triagem por IA nunca rodou (secret `OPENAI_API_KEY` ausente no GitHub) e a Central exibia só o encerramento de Santos de julho como destaque.
**Arquivos/módulos:** os citados acima, mais `tests/test_production_access.js` (asserção textual atualizada).
**Impacto medido:** JS 70/70, Python 47/47; renderização verificada em 3 cenários (só encerrado antigo, ativo parado, ativo recente).
**Alternativas descartadas:** encerrar automaticamente evento sem notícia há N dias (seria afirmar um fim que nenhuma fonte confirmou; optou-se por sinalizar "sem atualização"); bloquear de vez a reabertura pela IA de evento encerrado por gestor (perderia uma retomada real do evento).
**ADR relacionado:** nenhum.

## 2026-11-10 — QA de pacotes e limites
**O que mudou:** `api/_auth.js` (pacote efetivo herdado do cliente em `getEffectivePackage`, com fallback para o pacote individual; consumo por usuário em `monthlyUsage`/`featureUsage`, `reserveUsage`/`releaseUsage`/`finalizeReservation`/`firstUsageIds`, `starts_at` em `getActivePackage`, `recordUsage` devolve o id); reserva aplicada em `api/usage-event.js`, `api/news-feed.js` (notícias, Minha Rota e IA da rota), `api/news-summary.js` e `api/weekly-summary.js`; `packageSeatsUsed` em `api/_admin.js`, usada por `admin-user-package.js` (que agora valida antes de encerrar o pacote atual) e `admin-users.js`; paginação de eventos em `api/admin-data.js`; `clients.package_id` (migration `scripts/supabase_client_package.sql`), gravado por `admin-data.js` com validação de vagas; `clientWithPackage`/`clientSeatsUsed` em `_admin.js`; `admin-users.js` cria usuário sem pacote individual quando o cliente tem pacote; `admin-user-package.js` recusa pacote individual para quem herda; `admin-packages.js` não exclui pacote em uso por cliente; no painel, pacote no formulário do cliente e "Herdado do cliente" no usuário. Testes: `tests/helpers/fake_supabase.js`, `tests/test_package_limits.js`.
**Por quê:** pedido de QA com foco em "cada cliente terá o seu limite de uso de cada funcionalidade". Encontrados 7 defeitos (ver `docs/qa-audit/2026-11-10-pacotes-e-limites.md`).
**Arquivos/módulos:** os citados acima, mais `tests/test_production_access.js` (mocks atualizados) e `public/index.html`.
**Revisão do requisito:** a primeira versão desta mudança passou a somar o consumo de todos os usuários da empresa num saldo único. O usuário esclareceu a regra: **o usuário herda as configurações (pacote) do cliente, mas não herda o uso**. O consumo voltou a ser por usuário e o pacote passou a ser do cliente.
**Impacto medido:** 11 testes de ponta a ponta em `tests/test_package_limits.js`; suíte JS 68/68 e Python 42/42.
**Alternativas descartadas:** função SQL com trava (`SECURITY DEFINER` + advisory lock) para a reserva atômica (exigiria migration e mais uma função privilegiada; a reserva com recontagem e desempate pela ordem de gravação resolve sem mudar o banco); saldo único por empresa (descartado pelo usuário); pacote individual sobrepondo o do cliente (deixaria todos os usuários atuais, que já têm pacote individual, fora da herança).
**ADR relacionado:** nenhum.

## 2026-11-10 — Feeds regionais do G1 e deduplicação entre fontes
**O que mudou:** 24 feeds `https://g1.globo.com/rss/g1/{uf}/` em `config/sources.yaml`; `prefer_direct_sources` em `scraper/utils/filters.py`, chamada no fim de `main.collect_news`; testes em `tests/test_news_images.py`.
**Por quê:** pedido do usuário de mais fotos reais. 87% dos itens vinham do Google News sem imagem, e o G1 respondia por 65 deles.
**Arquivos/módulos:** `config/sources.yaml`, `main.py`, `scraper/utils/filters.py`, `tests/test_news_images.py`, `docs/SCRAPERS.md`, `docs/CHANGELOG.md`.
**Impacto medido:** coleta real de 2026-11-10: 297 notícias (sem INMET), 96 com foto (32%, antes 1%), 20 duplicatas removidas.
**Alternativas descartadas:** O Globo (robots.txt bloqueia); R7, GZH, Itatiaia e Estado de Minas (URLs de feed 404); Agência Brasil, ND Mais e Campo Grande News (sem item relevante na amostra); decodificar links do Google News (frágil).
**ADR relacionado:** nenhum. Fonte nova ainda sujeita à revisão de `compliance-advisor` (termos de uso do Grupo Globo para RSS e exibição de imagem com crédito).

## 2026-11-10 — Dropdowns do cabeçalho e imagem da notícia
**O que mudou:** regra global `[hidden] { display: none !important; }`; `closeAll()` em `public/dashboard.js` (clique fora, opção escolhida, Esc, `popstate`). Imagem: `extract_image_url` (`rss.py`), imagem da listagem da Band (`html.py`), `safe_image_url`/`first_image_in_html` (`filters.py`), `scraper/utils/og_image.py`, coluna opcional `image_url` em `scraper/storage/postgres.py` e `api/news-feed.js` (`OPTIONAL_SETS`), `scripts/supabase_news_image_url.sql`, `newsMedia()` e novas ilustrações por tema no dashboard.
**Por quê:** relato do usuário (menus abertos sobrepostos na Central de Evento) e pedido de imagem da própria notícia, com reserva que nunca remeta a mortes.
**Arquivos/módulos:** `public/index.html`, `public/dashboard.js`, `scraper/sources/rss.py`, `scraper/sources/html.py`, `scraper/utils/filters.py`, `scraper/utils/og_image.py`, `scraper/storage/postgres.py`, `api/news-feed.js`, `scripts/supabase_news_image_url.sql`, `tests/test_news_images.py`, `tests/test_client_panel.js`.
**Impacto medido:** cobertura de imagem no feed de 3/253 (1%), porque 87% dos itens vêm do Google News sem imagem; o `og:image` cobre os itens diretos. Comportamento dos menus verificado em jsdom.
**Alternativas descartadas:** decodificar links do Google News para buscar a imagem (redirecionamento criptografado, frágil e de termos de uso duvidosos); baixar e armazenar as imagens (direito autoral e custo; o painel aponta para a URL da fonte com crédito); usar imagem genérica de acidente na reserva (proibido pelo pedido: nada que remeta a mortes).
**ADR relacionado:** nenhum.

## 2026-11-10 — Identidade visual Overhaul
**O que mudou:** bloco "Identidade visual Overhaul" no fim do `<style>` de `public/index.html` (tokens `:root[data-theme="dark"|"light"]`, variáveis `--risk-*`, `@font-face` Archivo, Geist Mono em rótulos, links e botões). Os blocos de tokens do design anterior (azul) foram removidos, e as cores fixas restantes do CSS viraram variáveis ou cores da paleta (auditoria: nenhuma cor fora da paleta em regras de componente). `MAP_RISK_COLORS`, `public/dashboard.js` (gravidade, temas, ilustrações), estilos do PDF semanal e `scraper/weekly_news.py` (e-mail) alinhados. Archivo variável (latin, 400–700) baixada do Google Fonts para `public/assets/fonts/archivo/` com `OFL.txt`. Fontes com URL absoluta.
**Por quê:** aplicar a identidade da empresa do usuário (paleta primária, secundária e neutra; Archivo + Geist Mono) no lugar do azul do mockup.
**Arquivos/módulos:** `public/index.html`, `public/dashboard.js`, `public/assets/fonts/archivo/*`, `scraper/weekly_news.py`, `tests/test_client_panel.js`.
**Impacto medido:** n/a (visual). Testes verdes e página validada em jsdom sem erro.
**Alternativas descartadas:** carregar a Archivo pelo Google Fonts a cada acesso (requisição a terceiros e LGPD); manter vermelho para Crítico (fora da paleta, então Deep Orange assume o papel); usar Vivid Green como destaque também no tema claro (pouco contraste no branco, por isso Vivid Purple).
**ADR relacionado:** nenhum.

## 2026-11-10 — Design executivo: Dashboard, cabeçalho e temas claro/escuro
**O que mudou:** novo `public/dashboard.js` (`window.RoadDashboard`: `render`, `renderChrome`, `onShow`, `applyTheme`), que calcula tudo a partir de `uniqueMapItems()` com `public/risk.js` e `public/brief.js`. Em `public/index.html`: página `clientDashboardPage` (home de `/dashboard`), cabeçalho `#appTopbar`, bloco `#sidebarStatus`, script de tema no `<head>`, tokens `:root[data-theme="dark"|"light"]` e CSS do dashboard (skeleton, entrada dos cartões, contador, `prefers-reduced-motion`). As cores fixas do CSS (`rgba(30,255,149,…)`, `#1eff95`, `#1e0d43`) viraram `var(--accent-rgb)`/`var(--color-brand)`/`var(--color-brand-text)`. Rotas: `/alertas` com página própria; `/relatorios` liberado para Cliente.
**Por quê:** pedido do usuário de interface executiva no padrão do mockup (sidebar, KPIs, destaque, tendência, temas, panorama, feed, temas claro e escuro).
**Arquivos/módulos:** `public/dashboard.js`, `public/index.html`, `tests/test_client_panel.js`, `docs/CHANGELOG.md`, `product/FEATURES.md`.
**Impacto medido:** a medir. Validado em jsdom: página inteira carregando em modo demo com a fixture, navegação por todos os itens do menu, troca de tema e período, sem erro de execução. Sem captura de tela (Chrome headless indisponível no ambiente).
**Alternativas descartadas:** React + Tailwind + Recharts + Framer Motion, como sugerido no prompt (exigiriam build step e dependências npm, contra o `CLAUDE.md`, sem ADR); fotos nas notícias (as fontes não fornecem imagem, então foram usadas ilustrações vetoriais por tema, sem simular foto real); período de 90 dias (a API entrega 30 dias; ampliar muda carga e limite de pacote); item "Inteligência de Mercado" e página "Ajuda" (sem conteúdo real hoje, não foram criados vazios); Configurações para Cliente (decisão anterior do usuário de ocultar).
**ADR relacionado:** nenhum.

## 2026-11-10 — Resumo operacional, menu do Cliente e refresh visual
**O que mudou:** `renderOperationalSummary` (em `public/index.html`) substitui os cartões de contagem do Resumo operacional. O cálculo reutiliza `public/brief.js` (movido de `api/_weekly_brief.js`, que agora só o reexporta) com `windowMs` (6h/24h/72h/7d) e `includeEvents` (eventos agrupados, notícias de liberação e data mais antiga, para avisar quando não há base de comparação). Dados: `uniqueMapItems()` (feed de 24h + linhas do mapa de 30 dias). O menu do Cliente perdeu "Fontes", o botão de Configurações fica oculto no ambiente Cliente e `/fontes`/`/configuracoes` saíram de `CLIENT_ROUTES`. O bloco de CSS "Refresh visual" foi acrescentado ao fim do `<style>` (tokens, tipografia, cartões, navegação, selos) e as telas antigas foram preservadas.
**Por quê:** o Resumo operacional repetia contagens sem dizer o que está bloqueado, onde e o que fazer; Fontes/Configurações não têm utilidade para o cliente final; o visual monoespaçado e neon parecia ferramenta técnica, não painel gerencial.
**Arquivos/módulos:** `public/index.html`, `public/brief.js`, `api/_weekly_brief.js`, `scraper/weekly_brief.py` (comentário), `tests/test_client_panel.js`, `tests/test_risk.js`.
**Impacto medido:** a medir (uso da tela Resumo operacional). Visual não verificado por captura de tela no ambiente de desenvolvimento (Chrome headless indisponível); foram geradas prévias estáticas.
**Alternativas descartadas:** tema claro executivo (o usuário escolheu "escuro refinado"); calcular o resumo operacional no servidor (os dados já estão no navegador e a troca de janela ficaria lenta); fonte web externa para o sans-serif (dependência e LGPD; usamos fonte do sistema).
**ADR relacionado:** nenhum.

## 2026-11-10 — Resumo semanal da frota
**O que mudou:** novo `api/_weekly_brief.js` (`buildWeeklyBrief`) e espelho `scraper/weekly_brief.py`, consumidos por `api/weekly-summary.js` (painel) e `scraper/weekly_news.py` (e-mail). Fluxo: classificar com `public/risk.js` → descartar Baixo → agrupar a mesma ocorrência (mesma rodovia+UF+tipo em 24h ou Jaccard de títulos ≥ 0,35 em 48h; UF divergente nunca agrupa) → comparar com os 7 dias anteriores (leitura de 14 dias) → seções e ações determinísticas. Datas citadas no título ("(10)", "dia 14", "15/11") viram agenda, e as já passadas saem da lista. A IA só reescreve título e abertura. `risk.js`/`risk.py` passaram a expor `kind` e `fatal`. Renderização nova no painel (`renderWeeklySummary`, CSS e PDF) e no e-mail (HTML inline em tabela).
**Por quê:** o resumo anterior listava volume de notícias, rodovias e fontes mais citadas e recomendações genéricas ("monitorar as rodovias mais citadas"), sem responder o que muda na operação da semana.
**Arquivos/módulos:** `api/_weekly_brief.js`, `api/weekly-summary.js`, `scraper/weekly_brief.py`, `scraper/weekly_news.py`, `public/index.html`, `public/risk.js`, `scraper/utils/risk.py`, `tests/test_weekly_brief.{js,py}`, `tests/fixtures/weekly_*.json`, `tests/test_production_access.js`, `tests/test_risk.js`.
**Impacto medido:** amostra real de 254 notícias (2026-11-10): 218 analisadas viraram 114 ocorrências (dedup), com 22 descartadas sem impacto; saída JS × Python idêntica. Engajamento a medir.
**Alternativas descartadas:** manter o resumo gerado inteiramente pela IA (números e listas variavam a cada geração e não eram auditáveis); gerar o e-mail chamando a API (o job do GitHub Actions não tem sessão de usuário); classificar "ainda bloqueado" por IA (sem evidência rastreável).
**ADR relacionado:** nenhum.

## 2026-11-10 — Régua única de risco operacional
**O que mudou:** criada `public/risk.js` (UMD: `window.RoadRisk` no painel, `require` na API) com `classifyRisk(item) → {level, rank, label, ascii, reason}` e `roadBlockLevel`; espelho em `scraper/utils/risk.py`. Painel (`operationalRisk`), Minha Rota (`riskForItem`), `api/news-summary.js`, `api/weekly-summary.js`, `scraper/weekly_news.py` e `scraper/utils/image_summary.py` passaram a usá-la; a IA deixou de sobrescrever `risk_level`. Dataset dourado em `docs/domain/risk_golden.json` (40 casos) validado por `tests/test_risk.js` e `tests/test_risk.py`. Corrigido `_fallback_summary` em `scraper/utils/filters.py`, que tratava qualquer título "X - Y" como aviso do INMET.
**Por quê:** havia seis réguas com regras diferentes (54% de divergência entre painel e Minha Rota na amostra); o painel marcava 39% das notícias como Crítico, porque qualquer morte contava (exterior, julgamento, luto), enquanto caminhões tombados caíam em "Monitorar".
**Arquivos/módulos:** `public/risk.js`, `scraper/utils/risk.py`, `public/index.html`, `api/news-feed.js`, `api/news-summary.js`, `api/weekly-summary.js`, `scraper/weekly_news.py`, `scraper/utils/image_summary.py`, `scraper/utils/filters.py`, `docs/domain/risk_golden.json`, `tests/test_risk.{js,py}`, `tests/test_road_block.js`.
**Impacto medido:** amostra real de 254 notícias coletadas em 2026-11-10 (220 únicas): Crítico 39% → 8%, Alto 26% → 40%, Médio 14% → 41%, Baixo 21% → 11%; divergência JS × Python 0/254. Reclassifica mais de 10% do histórico, por isso a mudança foi levada a decisão humana no PR.
**Alternativas descartadas:** classificar risco por IA (custo por item, não determinístico, e já divergia da régua do card); manter regex por tela com teste de paridade (seis cópias para manter); usar a gravidade humana (morte = Crítico) como régua, porque não responde se a rota está disponível.
**ADR relacionado:** nenhum.

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
