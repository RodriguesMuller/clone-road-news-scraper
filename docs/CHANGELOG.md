# Changelog — Road News

> Mantido por `tech-docs-agent`, uma entrada por mudança de **comportamento observável** (não por refactor interno sem efeito externo). Não confundir com o changelog interno do PDF em `docs/dist/.docs-pdf-manifest.json` (esse é só sobre a publicação do PDF em si) nem com [`docs/HISTORY.md`](HISTORY.md) (registro fiel de toda mudança, incluindo internas, mantido por `project-historian`).

## 2026-11-10 — Correção: painel sem notícias
- **Corrigido**: depois do PR #22, o feed (`/api/news-feed`) e o resumo semanal respondiam `FUNCTION_INVOCATION_FAILED` e o painel ficou zerado. O vocabulário do conserto de acento estava em `config/`, que o `.vercelignore` exclui do deploy. O arquivo foi para `public/accented_words.json`, e sem ele o conserto vira no-op em vez de derrubar o feed.

## 2026-11-10 — Central de Evento pela decisão de despacho; texto com acento quebrado
- **Alterado**: a triagem de eventos passa a perguntar "isso muda a decisão de liberar caminhões de carga?". Acidente, mesmo grave, só vira evento com bloqueio total, nos dois sentidos ou sem previsão; o resto fica em Alertas. Evento novo já encerrado não entra na Central. Notícia de liberação da via chega à IA para encerrar o evento publicado.
- **Adicionado**: **decisão de despacho** em cada evento ("Segurar veículos para o trecho", "Liberar com desvio", "Liberar com atenção"; encerrado = "Trecho liberado: despacho normal"), no selo, no banner e nos indicadores. As ações recomendadas passam a ser de despacho.
- **Corrigido**: título com acento corrompido na fonte (ex.: "Not??cias - Grave acidente…", Guia Crissiumal). A coleta conserta o acento pela palavra conhecida (`public/accented_words.json`) e tira o rótulo de seção "Notícias - ". As notícias já gravadas são consertadas na exibição (feed e resumo semanal).

## 2026-11-10 — Triagem de eventos: resposta da IA cortada
- **Corrigido**: após o prompt v2, a triagem falhou em produção com `JSONDecodeError`. A resposta da IA era cortada pelo limite de 3000 tokens de saída. O limite passou para 8000, e resposta incompleta agora gera erro claro no log (`resposta da IA incompleta (motivo)`) em vez de erro de JSON.

## 2026-11-10 — Central de Evento só com o que afeta frota de carga
- **Corrigido**: acidente pontual com interdição parcial (ex.: tombamento na Raposo Tavares que parou linhas de ônibus) virava evento "Crítico" na Central. Agora a triagem descarta acidente com interdição parcial sem bloqueio total, e impacto só em ônibus, metrô ou passageiros não conta como gravidade. Essas ocorrências continuam em Alertas e Notícias. O prompt da IA define evento grave como o que obriga o gestor de frota de carga a replanejar rotas ou janelas.
- **Adicionado**: botão "Descartar: não é evento grave" para Admin/Gestor. O evento sai da Central para todos e a triagem automática não o republica.

## 2026-11-10 — QA da Central de Evento
- **Corrigido**: sem evento ativo, a Central não promove mais um evento antigo encerrado a destaque; "Eventos encerrados" mostra só os últimos 30 dias.
- **Corrigido**: a IA não reabre um evento encerrado pelo gestor sem notícia publicada depois do encerramento; reabrir apaga a data de encerramento antiga; a data de encerramento não muda mais a cada coleta; o início do evento usa a data real da notícia mais antiga.
- **Adicionado**: selo "Sem atualização há N dias" em evento ativo parado há mais de 72h.
- **Atenção**: a detecção automática exige o secret `OPENAI_API_KEY` no GitHub Actions (ausente até hoje). Relatório: `docs/qa-audit/2026-11-10-central-de-eventos.md`.

## 2026-11-10 — QA de pacotes e limites
- **Adicionado**: **pacote do cliente**. O pacote passa a ser configurado no cadastro do cliente e todos os usuários da empresa **herdam** recursos e limites dele. O **consumo continua sendo de cada usuário**: cada um tem o próprio saldo mensal. Cliente sem pacote mantém o modelo antigo (pacote por usuário). `max_users` do pacote herdado limita os usuários Cliente ativos da empresa. Migration: `scripts/supabase_client_package.sql`.
- **Corrigido**: requisições simultâneas furavam o limite (reserva atômica de uso); pacote com início no futuro já liberava; trocar para pacote inválido deixava o usuário sem pacote; `max_users` contava a plataforma inteira e vínculos vencidos; a gestão subcontava o consumo acima de 1000 eventos/mês.
- **Alterado**: Minha Rota com entrada inválida ou falha do Google não consome a consulta.
- Relatório completo: `docs/qa-audit/2026-11-10-pacotes-e-limites.md`.

## 2026-11-10 — mais fotos reais: feeds regionais do G1
- **Adicionado**: 24 feeds RSS regionais do G1 (um por estado), com o mesmo filtro de keywords e de frota. O G1 é o veículo mais frequente por trás das buscas do Google News, que chegam sem foto; o feed direto traz a foto e o link original. Avaliados antes: robots.txt liberado e 93 notícias relevantes, todas com foto.
- **Adicionado**: deduplicação entre fontes (`prefer_direct_sources`): a cópia do Google News sai quando a mesma notícia veio do feed direto.
- **Impacto**: notícias com foto passaram de 1% para 32% da coleta; mais cobertura regional de rodovias estaduais.

## 2026-11-10 — dropdowns do cabeçalho e imagem da notícia
- **Corrigido**: o painel de alertas (sino) e o menu do usuário não fechavam, e o seletor de período aparecia fora do Dashboard. Causa: `display: grid/inline-flex` dos componentes vencia o atributo `hidden`. Agora `[hidden]` sempre esconde, e os menus fecham ao clicar fora, ao escolher uma opção (inclusive "Sair") ou com Esc; abrir um fecha o outro.
- **Adicionado**: imagem da notícia vinda da fonte (feed ou `og:image` de fontes diretas), com crédito, gravada em `news.image_url` (migration `scripts/supabase_news_image_url.sql`). Sem imagem, ilustração neutra por tema, nunca cena de acidente, pessoas ou vítimas. Se a imagem da fonte falhar ao carregar, a ilustração assume.

## 2026-11-10 — identidade visual Overhaul (paleta e tipografia)
- **Alterado**: o painel, o PDF do resumo semanal e o e-mail de segunda passam a usar a paleta oficial. **Escuro**: fundo Midnight Green `#0F1814`, superfícies derivadas do Dark Green `#2A3E33`, texto Grey `#F4F9FA`/Cool Steel, marca Vivid Green `#1EFF95` com texto Dark Purple `#1E0D43`. **Claro**: fundo Grey `#F4F9FA`, cartões brancos/White Smoke, texto Midnight Green/Dim Grey, destaque Vivid Purple `#5029FF`. Gravidade: Crítico Deep Orange `#FC3700` (a paleta não tem vermelho), Alto Burnt Yellow `#FFCD00`, Médio Sky Blue `#00ACFF`, Baixo Vivid/Heritage Green. Temas e indicadores com a paleta secundária.
- **Alterado**: tipografia **Archivo** (títulos e texto) e **Geist Mono** (rótulos, links, botões e números). Archivo hospedada no projeto (`public/assets/fonts/archivo/`, licença OFL junto), sem requisição a terceiros.
- **Corrigido**: as fontes usavam caminho relativo (`assets/fonts/...`) e não carregavam em rotas aninhadas como `/developer/clientes`; agora o caminho é absoluto.

## 2026-11-10 — design executivo: Dashboard, cabeçalho e temas claro/escuro
- **Adicionado**: página **Dashboard** (início, `/dashboard`): 6 indicadores com variação contra o período anterior, sparkline, tooltip e contador animado (notícias coletadas, com impacto na frota, alertas importantes, críticas, rodovias afetadas, fontes ativas); **destaque editorial** com as 3 ocorrências mais graves do período (gira sozinho; bloqueio já liberado não entra); **tendência** (coletadas × com impacto × período anterior, com tooltip); **principais temas** (rosca); **panorama** (mini-mapa com marcadores por gravidade); **últimas notícias** com filtros rápidos. Período: 24h / 7 / 30 dias.
- **Adicionado**: cabeçalho superior com busca global (leva a Notícias filtradas), sino de alertas altos/críticos das últimas 24h, alternância **claro/escuro** (preferência salva, aplicada antes da primeira pintura), seletor de período e menu do usuário. Sidebar com status da coleta (última notícia e sparkline de 24h).
- **Alterado**: identidade passa a azul-marinho + azul elétrico (dark) e branco/cinza + azul (light), em tokens; cores fixas verdes do CSS viraram variáveis de tema. "Alertas" ganhou rota própria (`/alertas`) e o Cliente ganhou "Relatórios".
- **Interno**: `public/dashboard.js` (vanilla, sem dependência nova; gráficos em SVG, mapa no Leaflet existente), carregado após `risk.js` e `brief.js`.

## 2026-11-10 — resumo operacional, menu do Cliente e refresh visual
- **Alterado**: "Resumo operacional" deixou de ser quatro cartões de contagem (categorias, estados, rodovias citadas, risco) e virou **Situação operacional**: janela de 6h/24h/72h/7 dias comparada à janela anterior; situação geral; KPIs (bloqueios totais, restrições parciais, programados, acidentes com pesado, vítimas fatais, roubo de carga, avisos INMET); **rodovias com restrição** (pior situação por rodovia, há quanto tempo, ação; bloqueio com liberação posterior vira "Liberada (confirmar)"); ações imediatas; atenção nos próximos dias; risco por estado; evolução no período; segurança da carga e clima.
- **Alterado**: o ambiente **Cliente** não mostra mais **Fontes** nem **Configurações**, e as rotas `/fontes` e `/configuracoes` redirecionam para o painel nesse ambiente (Gestor/Admin seguem com acesso).
- **Alterado**: refresh visual "escuro refinado": texto em sans-serif (monoespaçada só em números), paleta grafite em camadas, verde da marca como destaque, cartões com raio e sombra suaves, navegação lateral com indicador de item ativo.
- **Interno**: o motor do resumo semanal foi para `public/brief.js` (UMD, usado no navegador e pela API via `api/_weekly_brief.js`), com `windowMs` e `includeEvents` opcionais; saída semanal inalterada.

## 2026-11-10 — resumo semanal da frota
- **Alterado**: o resumo semanal (painel e e-mail) deixou de ser contagem de notícias ("rodovias mais citadas", "fontes com maior volume") e passou a ser um briefing de decisão: veredito da semana; números (bloqueios totais e programados, acidentes com pesado, vítimas fatais, roubo de carga, paralisações, avisos INMET de Perigo) com comparativo contra a semana anterior; **Atenção para os próximos dias**; trechos mais críticos com a ação; segurança da carga; clima por UF; até 5 ações; principais ocorrências.
- **Adicionado**: a mesma ocorrência noticiada por vários veículos conta uma vez só (com o nº de fontes); bloqueio programado já passado sai da lista; bloqueio total sem notícia de liberação aparece como "pode seguir bloqueado".
- **Alterado**: números, seções e ações são calculados sem IA (`api/_weekly_brief.js`, espelho `scraper/weekly_brief.py`); a IA, quando configurada, só redige título e abertura. `GET/POST /api/weekly-summary` mudou o formato da resposta (ver `docs/API.md`).
- **Adicionado**: `classifyRisk` passa a retornar `kind` (tipo de ocorrência) e `fatal`.

## 2026-11-10 — régua única de risco (Baixo/Médio/Alto/Crítico)
- **Alterado**: risco passa a medir o **impacto na operação da frota**, não a gravidade humana do fato. Crítico = via indisponível agora (bloqueio total em curso, manifestação bloqueando, INMET Grande Perigo); Alto = impacto forte provável (pesado tombado/incendiado, vítima fatal, produto perigoso, roubo de carga, greve anunciada, bloqueio total **programado**, INMET Perigo); Médio = atraso/atenção (acidente sem interdição, bloqueio parcial, obra, neblina, INMET Perigo Potencial, corredor internacional); Baixo = sem impacto atual (liberado, fora do Brasil, desdobramento judicial/luto, simulado, boato, greve negada).
- **Corrigido**: em amostra real de 254 notícias, 39% saíam como Crítico (qualquer morte, inclusive no exterior e em notícia de julgamento); agora 8%. Caminhão tombado sem a palavra "tombamento" saía como "Monitorar"; INMET Perigo Potencial saía como Alto.
- **Corrigido**: seis réguas divergentes (painel, Minha Rota, resumo individual, resumo semanal JS e Python, `risk_level` gravado pelo scraper) foram unificadas em `public/risk.js` (espelho `scraper/utils/risk.py`). A IA não define mais o risco.
- **Adicionado**: justificativa de cada nível (passe o mouse no selo de risco; campo `risk_reason` na Minha Rota e no resumo individual). Notícia sem local identificado fica limitada a Médio.
- **Corrigido**: títulos "Fato - Veículo" (ex.: "... - G1") geravam o resumo "há alerta de ... publicado pelo INMET".

## 2026-11-10 — Minha Rota: ocorrências de fora do trajeto
- **Corrigido**: a Minha Rota listava ocorrências de outros estados como "relacionadas à rota" (ex.: bloqueio da BR-101 no Espírito Santo numa rota Santo André → Itaquaquecetuba), porque a origem/destino era casada palavra a palavra ("santo" ⊂ "Espírito Santo"). Agora casa a localidade inteira com limite de palavra, descarta ocorrência geolocalizada a mais de 45 km do trajeto e ocorrência que cita só rodovias fora da rota.
- **Melhorado**: ocorrência casada pela cidade de origem/destino passa a ser marcada nessa ponta do mapa; bloqueio sem ponto identificável no traçado exibe aviso explícito.

## 2026-11-10 — impacto na frota, destaque de bloqueios e mapa
- **Corrigido**: o mapa rodoviário e o mapa da Minha Rota exibiam "API KEY REQUIRED" porque os tiles `dark_all` do CARTO passaram a exigir chave. Agora usam tiles do OpenStreetMap (sem chave), escurecidos via CSS; provedor centralizado em `BASE_TILE_URL`.
- **Adicionado**: destaque de rodovia bloqueada: borda vermelha e faixa "Rodovia bloqueada" (total) ou "parcialmente bloqueada" (tracejada) em notícias, alertas, salvos, ocorrências da rota e pop-up do mapa. Marcadores de bloqueio ficam fora do cluster e com anel pulsante.
- **Alterado**: `POST /api/news-feed` retorna `road_blocked`/`block_level` por ocorrência, ordena bloqueios primeiro e recomenda rota alternativa quando há bloqueio total.
- **Alterado**: o scraper descarta notícias sem impacto operacional para frota (filtro `fleet_relevance`); fontes podem desligá-lo com `fleet_filter: false`.
- **Adicionado**: linha "Impacto na frota" com ação sugerida em cada card; ordenação padrão passa a ser "Impacto na frota".

## 2026-11-09 — acesso por senha temporária
- **Alterado**: o convite por e-mail e a recuperação de senha por e-mail foram removidos. O admin/gestor cria o acesso com **senha temporária** e o usuário é obrigado a trocá-la no primeiro login (`POST /api/my-access`); enquanto não troca, toda a API responde 403. Política única de senha: mínimo 8 caracteres, 1 minúscula, 1 maiúscula, 1 caractere especial (validada no navegador e no servidor). O admin pode redefinir uma senha temporária pela edição do usuário.
- **Aplicado em produção**: `scripts/supabase_security_hardening.sql` — leitura anônima de `news` e RPC anônimo bloqueados (retestado: 401/42501); consultas do feed de 11–17 ms para 0,2–0,8 ms com `news_created_at_idx`.

## 2026-11-09 (auditoria QA)
- **Segurança**: a tabela `news` deixa de ser legível sem login pela chave pública; o frontend lê notícias só via `/api/news-feed` (também no modo demo) e o scraper não recria mais a policy anônima. Migration `scripts/supabase_security_hardening.sql`.
- **Corrigido**: fonte "Band - Notícias" retornava 0 itens após mudança no formato de URL do portal.
- **Segurança**: teto de tamanho no texto enviado à IA (`/api/news-summary`) e no corpo de todas as requisições (400 para JSON inválido); exclusão de usuário por e-mail com correspondência exata; `supabase-js` fixado em 2.118.0 com SRI; headers de segurança.
- **Atualizado**: `requests` 2.33.1 e `python-dotenv` 1.2.2 (CVEs).
- **Adicionado**: CI de testes (`.github/workflows/tests.yml`) e relatório de auditoria em `docs/qa-audit/`.

## 2026-08-06
- **Adicionado**: arquitetura de 23 subagents especializados do Claude Code (`.claude/agents/`), documentada em `docs/AGENTS.md` e `CLAUDE.md`.
- **Adicionado**: `docs-publisher` — consolida `/product` + `/docs` em um PDF único e sempre atualizado (`docs/dist/road-news-documentation.pdf`).
- **Corrigido**: resumo do card gerado pelo botão "Gerar Resumo" (canvas em `public/index.html`) podia truncar sem indicação visual de corte (`completeCardSummary`); agora sempre termina com reticências quando o texto é cortado.
- **Melhorado**: card do botão "Gerar Resumo" ganhou badge de rota (rodovia + região) e cor de severidade específica no badge de risco (crítico/alto/médio/baixo), em vez de usar a cor de marca para todos os níveis.
- **Melhorado**: prompt do resumo individual (`api/news-summary.js`) passa a extrair km, sentido e status da via quando existirem, e marca `insufficient_data: true` explicitamente em vez de gerar frase vaga de impacto não confirmado.
- **Corrigido**: fontes "Google News — ..." (`config/sources.yaml`) gravavam o nome da query de busca como fonte da notícia; `scraper/sources/rss.py` agora resolve o veículo real por trás do redirect.

## 2026-08-05
- **Melhorado**: marcadores de risco sobrepostos no mapa agora se agrupam e reagrupam por nível de zoom.
- **Corrigido**: rodovias citadas na análise de rota sem geolocalização precisa agora ainda recebem marcador no mapa.
- **Melhorado**: marcador da rota mostra km e descrição curta sempre visíveis.
- **Melhorado**: visibilidade de trechos de risco no mapa da tela Minha Rota.
- **Adicionado**: sinalização de bloqueios/riscos na rota com descrição e segmento destacado no mapa.
- **Corrigido**: janela de notícias consideradas na análise de rota reduzida de 72h para 24h (relevância).
- **Adicionado**: suporte a paradas intermediárias na análise de rota (Minha Rota).
- **Corrigido**: lacunas de classificação de risco identificadas em QA visual; bug de KPI exibindo vazio quando o valor real era zero.
- **Melhorado**: resumos de IA agora são instruídos a agregar valor além de repetir o título.
- **Corrigido**: campo de região corrompido quando a saída de IA não era validada.
- **Melhorado**: classificação de risco diferenciada em vez de default para "Alto".
- **Segurança**: removidos detalhes internos de arquitetura do copy do painel admin.

---

*Entradas anteriores a 2026-08-05 não foram retroativamente documentadas aqui — consultar `git log` para o histórico completo do repositório.*
